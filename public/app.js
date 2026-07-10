const elements = {
  appName: document.querySelector('#appName'),
  questionHeading: document.querySelector('#questionHeading'),
  roundStatus: document.querySelector('#roundStatus'),
  categoryText: document.querySelector('#categoryText'),
  participation: document.querySelector('#participation'),
  participationCount: document.querySelector('#participationCount'),
  participationBar: document.querySelector('#participationBar'),
  closeMessage: document.querySelector('#closeMessage'),
  statusMessage: document.querySelector('#statusMessage'),
  noQuestionPanel: document.querySelector('#noQuestionPanel'),
  votePanel: document.querySelector('#votePanel'),
  peopleGrid: document.querySelector('#peopleGrid'),
  currentVoterName: document.querySelector('#currentVoterName'),
  changeVoterButton: document.querySelector('#changeVoterButton'),
  commentInput: document.querySelector('#commentInput'),
  commentCount: document.querySelector('#commentCount'),
  selectionSummary: document.querySelector('#selectionSummary'),
  submitVote: document.querySelector('#submitVote'),
  historyPreview: document.querySelector('#historyPreview'),
  identityDialog: document.querySelector('#identityDialog'),
  identityForm: document.querySelector('#identityForm'),
  identitySelect: document.querySelector('#identitySelect'),
  cancelIdentityButton: document.querySelector('#cancelIdentityButton'),
};

const state = {
  data: null,
  history: [],
  voterId: localStorage.getItem('officeVerdictVoterId') ?? '',
  selectedPersonId: null,
  currentQuestionId: null,
  submitting: false,
  hasLoadedVote: false,
};

function make(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'attrs') {
      for (const [name, attrValue] of Object.entries(value)) node.setAttribute(name, attrValue);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node[key] = value;
    }
  }
  node.append(...children);
  return node;
}

function showNotice(message, type = 'success') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `notice${type === 'success' ? '' : ` ${type}`}`;
  elements.statusMessage.hidden = false;
}

function clearNotice() {
  elements.statusMessage.hidden = true;
  elements.statusMessage.textContent = '';
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatClosedDate(value) {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function remainingTime(value) {
  if (!value) return 'Open until an admin closes it.';
  const milliseconds = new Date(value).getTime() - Date.now();
  if (milliseconds <= 0) return 'Closing now…';
  const totalMinutes = Math.ceil(milliseconds / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'} remaining`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${minutes ? ` ${minutes}m` : ''} remaining`;
}

function populateIdentity(people) {
  elements.identitySelect.replaceChildren(new Option('Choose your name', ''));
  for (const person of people) elements.identitySelect.add(new Option(person.name, person.id));

  const voter = people.find((person) => person.id === state.voterId);
  if (voter) {
    elements.identitySelect.value = voter.id;
    elements.currentVoterName.textContent = voter.name;
  } else {
    state.voterId = '';
    localStorage.removeItem('officeVerdictVoterId');
    elements.currentVoterName.textContent = 'Nobody';
  }

  elements.cancelIdentityButton.hidden = !state.voterId;
}

function openIdentityDialog() {
  if (!elements.identityDialog.open) elements.identityDialog.showModal();
}

function renderPeople() {
  const people = state.data?.people ?? [];
  elements.peopleGrid.replaceChildren();

  for (const person of people) {
    const button = make('button', {
      type: 'button',
      className: 'person-button',
      text: person.name,
      attrs: {
        role: 'radio',
        'aria-checked': String(state.selectedPersonId === person.id),
      },
      onClick: () => {
        state.selectedPersonId = person.id;
        renderPeople();
        updateVoteActions();
      },
    });

    if (person.id === state.voterId) {
      button.disabled = true;
      button.title = 'You cannot vote for yourself.';
      if (state.selectedPersonId === person.id) state.selectedPersonId = null;
    }
    if (state.selectedPersonId === person.id) button.classList.add('selected');
    elements.peopleGrid.append(button);
  }
}

function updateCommentCount() {
  elements.commentCount.textContent = `${elements.commentInput.value.length} / 280`;
}

function updateVoteActions() {
  const selected = state.data?.people?.find((person) => person.id === state.selectedPersonId);
  elements.selectionSummary.textContent = selected
    ? `Selected: ${selected.name}`
    : 'Nobody selected yet.';
  elements.submitVote.disabled = !state.voterId || !state.selectedPersonId || state.submitting;
  elements.submitVote.textContent = state.submitting ? 'Recording vote…' : 'Submit vote';
  updateCommentCount();
}

function renderParticipation(participation) {
  const cast = participation?.votesCast ?? 0;
  const eligible = participation?.eligibleVoters ?? 0;
  const percentage = eligible ? Math.min(100, (cast / eligible) * 100) : 0;
  elements.participation.hidden = false;
  elements.participationCount.textContent = `${cast} of ${eligible} ${cast === 1 ? 'vote' : 'votes'} cast`;
  elements.participationBar.style.width = `${percentage}%`;
  elements.closeMessage.textContent = remainingTime(state.data?.question?.closesAt);
}

function renderHistory(history) {
  elements.historyPreview.replaceChildren();
  if (!history.length) {
    elements.historyPreview.append(make('div', { className: 'empty-inline' }, [
      make('strong', { text: 'No previous verdicts yet.' }),
      make('span', { text: 'The office has not generated enough evidence.' }),
    ]));
    return;
  }

  for (const item of history) {
    const podium = make('ol', { className: 'podium-list' });
    if (!item.topThree.length) {
      podium.append(make('li', { className: 'muted-copy', text: 'No votes were cast.' }));
    } else {
      for (const result of item.topThree) {
        const medal = result.rank === 1 ? '🥇' : result.rank === 2 ? '🥈' : '🥉';
        podium.append(make('li', {}, [
          make('span', { text: `${medal} ${result.name}` }),
          make('strong', { text: String(result.votes) }),
        ]));
      }
    }

    const card = make('article', { className: 'verdict-card' }, [
      make('div', { className: 'verdict-card-meta' }, [
        make('span', { className: 'badge', text: item.category || 'Uncategorised' }),
        make('span', { className: 'table-muted', text: formatClosedDate(item.closedAt) }),
      ]),
      make('h3', { text: item.text }),
      podium,
      make('div', { className: 'verdict-card-footer' }, [
        make('span', { text: `${item.votesCast} votes · ${item.comments.length} comments` }),
        make('a', {
          className: 'text-link',
          text: 'View details',
          href: `/history.html#${item.id}`,
        }),
      ]),
    ]);
    elements.historyPreview.append(card);
  }
}

function render(data, { quiet = false } = {}) {
  const questionChanged = state.currentQuestionId !== data.question?.id;
  state.data = data;
  state.currentQuestionId = data.question?.id ?? null;
  document.title = data.appName ?? 'Office Verdict';
  elements.appName.textContent = data.appName ?? 'Office Verdict';
  populateIdentity(data.people ?? []);

  if (!data.question) {
    elements.questionHeading.textContent = 'No question is open right now';
    elements.roundStatus.textContent = 'Waiting for the next one';
    elements.categoryText.textContent = '';
    elements.participation.hidden = true;
    elements.votePanel.hidden = true;
    elements.noQuestionPanel.hidden = false;
    return;
  }

  elements.noQuestionPanel.hidden = true;
  elements.votePanel.hidden = false;
  elements.questionHeading.textContent = data.question.text;
  elements.roundStatus.textContent = data.question.closesAt
    ? `Closes ${formatDateTime(data.question.closesAt)}`
    : 'Open-ended round';
  const labels = [data.question.category, ...(data.question.tags ?? [])].filter(Boolean);
  elements.categoryText.textContent = labels.join(' · ');
  renderParticipation(data.participation);

  if (questionChanged) {
    state.selectedPersonId = null;
    elements.commentInput.value = '';
    state.hasLoadedVote = false;
  }

  if (!state.hasLoadedVote && data.myVote) {
    state.selectedPersonId = data.myVote.selectedPersonId;
    elements.commentInput.value = data.myVote.comment ?? '';
    state.hasLoadedVote = true;
  }

  renderPeople();
  updateVoteActions();
  if (!state.voterId && !quiet) openIdentityDialog();
}

async function loadData({ quiet = false } = {}) {
  try {
    const voterQuery = state.voterId ? `?voterId=${encodeURIComponent(state.voterId)}` : '';
    const [statusResponse, historyResponse] = await Promise.all([
      fetch(`/api/status${voterQuery}`, { headers: { accept: 'application/json' } }),
      fetch('/api/history?limit=5', { headers: { accept: 'application/json' } }),
    ]);
    const [statusData, historyData] = await Promise.all([statusResponse.json(), historyResponse.json()]);
    if (!statusResponse.ok || !statusData.ok) throw new Error(statusData.error || 'Could not load the current question.');
    if (!historyResponse.ok || !historyData.ok) throw new Error(historyData.error || 'Could not load previous results.');
    state.history = historyData.history ?? [];
    render(statusData, { quiet });
    renderHistory(state.history);
    if (!quiet) clearNotice();
  } catch (error) {
    showNotice(error.message, 'error');
    elements.questionHeading.textContent = 'The verdict could not be loaded';
  }
}

async function submitVote() {
  if (!state.data?.question || state.submitting) return;
  if (!state.voterId) {
    openIdentityDialog();
    return;
  }
  if (!state.selectedPersonId) {
    showNotice('Choose a colleague before submitting your vote.', 'warning');
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
        voterId: state.voterId,
        selectedPersonId: state.selectedPersonId,
        comment: elements.commentInput.value,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'The vote could not be recorded.');
    showNotice(`${result.message} You may change it while the round remains open.`);
    state.hasLoadedVote = true;
    await loadData({ quiet: true });
  } catch (error) {
    showNotice(error.message, 'error');
  } finally {
    state.submitting = false;
    updateVoteActions();
  }
}

elements.identityForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const voterId = elements.identitySelect.value;
  if (!voterId) return;
  state.voterId = voterId;
  state.selectedPersonId = null;
  state.hasLoadedVote = false;
  localStorage.setItem('officeVerdictVoterId', voterId);
  elements.identityDialog.close();
  loadData({ quiet: true });
});

elements.cancelIdentityButton.addEventListener('click', () => elements.identityDialog.close());
elements.changeVoterButton.addEventListener('click', openIdentityDialog);
elements.commentInput.addEventListener('input', updateVoteActions);
elements.submitVote.addEventListener('click', submitVote);

loadData();
setInterval(() => {
  if (state.data?.question) elements.closeMessage.textContent = remainingTime(state.data.question.closesAt);
}, 1_000);
setInterval(() => loadData({ quiet: true }), 60_000);
