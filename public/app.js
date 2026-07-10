const elements = {
  appName: document.querySelector('#appName'),
  questionHeading: document.querySelector('#questionHeading'),
  questionDate: document.querySelector('#questionDate'),
  categoryText: document.querySelector('#categoryText'),
  participation: document.querySelector('#participation'),
  participationCount: document.querySelector('#participationCount'),
  participationBar: document.querySelector('#participationBar'),
  revealMessage: document.querySelector('#revealMessage'),
  statusMessage: document.querySelector('#statusMessage'),
  noQuestionPanel: document.querySelector('#noQuestionPanel'),
  votePanel: document.querySelector('#votePanel'),
  resultsPanel: document.querySelector('#resultsPanel'),
  voterSelect: document.querySelector('#voterSelect'),
  pinInput: document.querySelector('#pinInput'),
  peopleGrid: document.querySelector('#peopleGrid'),
  selectionSummary: document.querySelector('#selectionSummary'),
  submitVote: document.querySelector('#submitVote'),
  resultsList: document.querySelector('#resultsList'),
  winnerText: document.querySelector('#winnerText'),
};

const state = {
  data: null,
  selectedPersonId: null,
  submitting: false,
};

function showNotice(message, type = 'success') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `notice${type === 'success' ? '' : ` ${type}`}`;
  elements.statusMessage.hidden = false;
}

function clearNotice() {
  elements.statusMessage.hidden = true;
  elements.statusMessage.textContent = '';
}

function formatDate(dateString) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${dateString}T12:00:00`));
}

function formatRevealTime(time) {
  const [hour, minute] = String(time ?? '16:00').split(':').map(Number);
  const date = new Date(2020, 0, 1, hour, minute);
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function populateVoters(people) {
  const remembered = localStorage.getItem('officeVerdictVoterId') ?? '';
  elements.voterSelect.replaceChildren(new Option('Choose your name', ''));

  for (const person of people) {
    elements.voterSelect.add(new Option(person.name, person.id));
  }

  if (people.some((person) => person.id === remembered)) {
    elements.voterSelect.value = remembered;
  }
}

function renderPeople() {
  const people = state.data?.people ?? [];
  const voterId = elements.voterSelect.value;
  elements.peopleGrid.replaceChildren();

  for (const person of people) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'person-button';
    button.textContent = person.name;
    button.dataset.personId = person.id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(state.selectedPersonId === person.id));

    if (person.id === voterId) {
      button.disabled = true;
      button.title = 'You cannot vote for yourself.';
      if (state.selectedPersonId === person.id) state.selectedPersonId = null;
    }

    if (state.selectedPersonId === person.id) {
      button.classList.add('selected');
    }

    button.addEventListener('click', () => {
      state.selectedPersonId = person.id;
      renderPeople();
      updateVoteActions();
    });

    elements.peopleGrid.append(button);
  }
}

function updateVoteActions() {
  const person = state.data?.people.find((item) => item.id === state.selectedPersonId);
  const ready = Boolean(
    elements.voterSelect.value
      && /^\d{4}$/.test(elements.pinInput.value)
      && state.selectedPersonId
      && !state.submitting,
  );

  elements.selectionSummary.textContent = person
    ? `Selected: ${person.name}`
    : 'Nobody selected yet.';
  elements.submitVote.disabled = !ready;
  elements.submitVote.textContent = state.submitting ? 'Recording vote…' : 'Submit vote';
}

function renderParticipation(participation, revealTime, revealed) {
  const cast = participation?.votesCast ?? 0;
  const eligible = participation?.eligibleVoters ?? 0;
  const percentage = eligible > 0 ? Math.min(100, (cast / eligible) * 100) : 0;

  elements.participation.hidden = false;
  elements.participationCount.textContent = `${cast} of ${eligible} ${cast === 1 ? 'vote' : 'votes'} cast`;
  elements.participationBar.style.width = `${percentage}%`;
  elements.revealMessage.textContent = revealed
    ? 'Voting is closed.'
    : `Results appear at ${formatRevealTime(revealTime)}.`;
}

function renderResults(results, totalVotes) {
  elements.resultsList.replaceChildren();

  if (!results?.length) {
    const empty = document.createElement('p');
    empty.className = 'muted-copy';
    empty.textContent = 'No votes were cast. A stirring triumph for apathy.';
    elements.resultsList.append(empty);
    elements.winnerText.textContent = '';
    return;
  }

  const topScore = results[0].votes;
  const winners = results.filter((result) => result.votes === topScore);
  elements.winnerText.textContent = winners.length === 1
    ? `${winners[0].name} wins with ${topScore} ${topScore === 1 ? 'vote' : 'votes'}.`
    : `A tie between ${winners.map((winner) => winner.name).join(' and ')}.`;

  for (const result of results) {
    const row = document.createElement('div');
    row.className = 'result-row';

    const name = document.createElement('span');
    name.className = 'result-name';
    name.textContent = result.name;

    const track = document.createElement('div');
    track.className = 'result-track';
    const bar = document.createElement('span');
    bar.className = 'result-bar';
    bar.style.width = `${totalVotes ? Math.max(2, (result.votes / totalVotes) * 100) : 0}%`;
    track.append(bar);

    const count = document.createElement('span');
    count.className = 'result-count';
    count.textContent = `${result.votes} ${result.votes === 1 ? 'vote' : 'votes'}`;

    row.append(name, track, count);
    elements.resultsList.append(row);
  }
}

function render(data) {
  state.data = data;
  document.title = data.appName ?? 'Office Verdict';
  elements.appName.textContent = data.appName ?? 'Office Verdict';
  elements.questionDate.textContent = formatDate(data.date);
  elements.noQuestionPanel.hidden = Boolean(data.question);

  if (!data.question) {
    elements.questionHeading.textContent = 'No question today';
    elements.categoryText.textContent = '';
    elements.participation.hidden = true;
    elements.votePanel.hidden = true;
    elements.resultsPanel.hidden = true;
    elements.noQuestionPanel.hidden = false;
    return;
  }

  elements.questionHeading.textContent = data.question.text;
  elements.categoryText.textContent = data.question.category ? `Category: ${data.question.category}` : '';
  renderParticipation(data.participation, data.revealTime, data.question.revealed);
  populateVoters(data.people);

  if (data.question.revealed) {
    elements.votePanel.hidden = true;
    elements.resultsPanel.hidden = false;
    renderResults(data.results, data.participation.votesCast);
  } else {
    elements.votePanel.hidden = false;
    elements.resultsPanel.hidden = true;
    renderPeople();
    updateVoteActions();
  }
}

async function loadStatus({ quiet = false } = {}) {
  try {
    const response = await fetch('/api/status', { headers: { accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not load today’s question.');
    render(data);
    if (!quiet) clearNotice();
  } catch (error) {
    showNotice(error.message, 'error');
    elements.questionHeading.textContent = 'The verdict could not be loaded';
  }
}

async function submitVote() {
  if (!state.data?.question || state.submitting) return;

  const voterId = elements.voterSelect.value;
  const pin = elements.pinInput.value;
  if (!voterId || !/^\d{4}$/.test(pin) || !state.selectedPersonId) {
    showNotice('Choose your name, enter your four-digit PIN and select a colleague.', 'warning');
    return;
  }

  state.submitting = true;
  updateVoteActions();
  clearNotice();

  try {
    const response = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        questionId: state.data.question.id,
        voterId,
        selectedPersonId: state.selectedPersonId,
        pin,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'The vote could not be recorded.');

    localStorage.setItem('officeVerdictVoterId', voterId);
    elements.pinInput.value = '';
    showNotice(`${result.message} You may change it before results are revealed.`);
    await loadStatus({ quiet: true });
  } catch (error) {
    showNotice(error.message, 'error');
  } finally {
    state.submitting = false;
    updateVoteActions();
  }
}

elements.voterSelect.addEventListener('change', () => {
  if (elements.voterSelect.value) {
    localStorage.setItem('officeVerdictVoterId', elements.voterSelect.value);
  }
  renderPeople();
  updateVoteActions();
});

elements.pinInput.addEventListener('input', () => {
  elements.pinInput.value = elements.pinInput.value.replace(/\D/g, '').slice(0, 4);
  updateVoteActions();
});

elements.submitVote.addEventListener('click', submitVote);

loadStatus();
setInterval(() => loadStatus({ quiet: true }), 60_000);
