const elements = {
  adminNotice: document.querySelector('#adminNotice'),
  loginPanel: document.querySelector('#loginPanel'),
  loginForm: document.querySelector('#loginForm'),
  adminPassword: document.querySelector('#adminPassword'),
  dashboard: document.querySelector('#dashboard'),
  logoutButton: document.querySelector('#logoutButton'),
  summaryPeople: document.querySelector('#summaryPeople'),
  summaryQuestions: document.querySelector('#summaryQuestions'),
  summaryVotes: document.querySelector('#summaryVotes'),
  summaryToday: document.querySelector('#summaryToday'),
  todayParticipation: document.querySelector('#todayParticipation'),
  missingVoters: document.querySelector('#missingVoters'),
  questionForm: document.querySelector('#questionForm'),
  questionFormTitle: document.querySelector('#questionFormTitle'),
  questionId: document.querySelector('#questionId'),
  questionDateInput: document.querySelector('#questionDateInput'),
  questionTextInput: document.querySelector('#questionTextInput'),
  questionCategoryInput: document.querySelector('#questionCategoryInput'),
  cancelQuestionEdit: document.querySelector('#cancelQuestionEdit'),
  questionsTableBody: document.querySelector('#questionsTableBody'),
  peopleTableBody: document.querySelector('#peopleTableBody'),
  reportsTableBody: document.querySelector('#reportsTableBody'),
  generatePinsButton: document.querySelector('#generatePinsButton'),
  generatedPinsPanel: document.querySelector('#generatedPinsPanel'),
  generatedPinsText: document.querySelector('#generatedPinsText'),
  copyPinsButton: document.querySelector('#copyPinsButton'),
  exportButton: document.querySelector('#exportButton'),
};

const state = {
  password: sessionStorage.getItem('officeVerdictAdminPassword') ?? '',
  data: null,
};

function showNotice(message, type = 'success') {
  elements.adminNotice.textContent = message;
  elements.adminNotice.className = `notice${type === 'success' ? '' : ` ${type}`}`;
  elements.adminNotice.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearNotice() {
  elements.adminNotice.hidden = true;
  elements.adminNotice.textContent = '';
}

function formatDate(dateString) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${dateString}T12:00:00`));
}

function make(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'attrs') {
      for (const [attr, attrValue] of Object.entries(value)) node.setAttribute(attr, attrValue);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node[key] = value;
    }
  }
  node.append(...children);
  return node;
}

async function adminFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      'x-admin-password': state.password,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok || (data && !data.ok)) {
    const error = new Error(data?.error || 'The request failed.');
    error.status = response.status;
    throw error;
  }
  return data ?? response;
}

function setLoggedIn(loggedIn) {
  elements.loginPanel.hidden = loggedIn;
  elements.dashboard.hidden = !loggedIn;
  elements.logoutButton.hidden = !loggedIn;
}

function resetQuestionForm() {
  elements.questionForm.reset();
  elements.questionId.value = '';
  elements.questionDateInput.value = state.data?.today ?? '';
  elements.questionFormTitle.textContent = 'Add a question';
  elements.cancelQuestionEdit.hidden = true;
}

function editQuestion(question) {
  elements.questionId.value = question.id;
  elements.questionDateInput.value = question.date;
  elements.questionTextInput.value = question.text;
  elements.questionCategoryInput.value = question.category ?? '';
  elements.questionFormTitle.textContent = 'Edit question';
  elements.cancelQuestionEdit.hidden = false;
  window.scrollTo({ top: elements.questionForm.offsetTop - 30, behavior: 'smooth' });
}

function winnerLabel(question) {
  if (!question.votesCast) return 'No votes';
  if (!question.revealed) return 'Hidden';
  if (question.winners.length === 1) return `${question.winners[0].name} (${question.winners[0].votes})`;
  return `Tie: ${question.winners.map((winner) => winner.name).join(', ')}`;
}

function renderQuestions(questions) {
  elements.questionsTableBody.replaceChildren();

  if (!questions.length) {
    const row = make('tr', {}, [
      make('td', { text: 'No questions have been scheduled.', attrs: { colspan: '5' } }),
    ]);
    elements.questionsTableBody.append(row);
    return;
  }

  for (const question of questions) {
    const actions = make('div', { className: 'inline-actions' });
    actions.append(
      make('button', {
        className: 'small-button',
        text: 'Edit',
        type: 'button',
        onClick: () => editQuestion(question),
      }),
      make('button', {
        className: 'small-button',
        text: question.manuallyRevealed ? 'Use timed reveal' : 'Reveal now',
        type: 'button',
        onClick: () => updateQuestion({
          action: 'reveal',
          id: question.id,
          revealed: !question.manuallyRevealed,
        }),
      }),
      make('button', {
        className: 'small-button danger-button',
        text: 'Delete',
        type: 'button',
        onClick: () => deleteQuestion(question),
      }),
    );

    const questionCell = make('td', { className: 'question-cell' }, [
      make('div', { text: question.text }),
      make('div', { className: 'table-muted', text: question.category || 'No category' }),
    ]);

    elements.questionsTableBody.append(make('tr', {}, [
      make('td', { text: formatDate(question.date) }),
      questionCell,
      make('td', { text: String(question.votesCast) }),
      make('td', { text: winnerLabel(question) }),
      make('td', {}, [actions]),
    ]));
  }
}

function renderPeople(people) {
  elements.peopleTableBody.replaceChildren();

  for (const person of people) {
    const pinInput = make('input', {
      type: 'text',
      inputMode: 'numeric',
      maxLength: 4,
      placeholder: 'New PIN',
      attrs: { 'aria-label': `New PIN for ${person.name}` },
    });
    pinInput.addEventListener('input', () => {
      pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4);
    });

    const setPinButton = make('button', {
      className: 'small-button',
      text: person.hasPin ? 'Reset PIN' : 'Set PIN',
      type: 'button',
      onClick: async () => {
        if (!/^\d{4}$/.test(pinInput.value)) {
          showNotice('Enter exactly four digits for the PIN.', 'warning');
          return;
        }
        await updatePerson({ action: 'setPin', id: person.id, pin: pinInput.value });
        pinInput.value = '';
      },
    });

    const toggleButton = make('button', {
      className: `small-button${person.is_active ? ' danger-button' : ''}`,
      text: person.is_active ? 'Deactivate' : 'Activate',
      type: 'button',
      onClick: () => updatePerson({ action: 'toggleActive', id: person.id, active: !person.is_active }),
    });

    elements.peopleTableBody.append(make('tr', {}, [
      make('td', { text: person.name }),
      make('td', {}, [
        make('span', {
          className: `badge ${person.is_active ? 'success' : 'off'}`,
          text: person.is_active ? 'Active' : 'Inactive',
        }),
      ]),
      make('td', {}, [
        make('span', {
          className: `badge ${person.hasPin ? 'success' : 'warning'}`,
          text: person.hasPin ? 'Set' : 'Missing',
        }),
      ]),
      make('td', {}, [make('div', { className: 'inline-actions' }, [pinInput, setPinButton, toggleButton])]),
    ]));
  }
}

function renderReports(questions) {
  elements.reportsTableBody.replaceChildren();

  const completed = questions.filter((question) => question.date <= state.data.today);
  if (!completed.length) {
    elements.reportsTableBody.append(make('tr', {}, [
      make('td', { text: 'No results yet.', attrs: { colspan: '4' } }),
    ]));
    return;
  }

  for (const question of completed) {
    elements.reportsTableBody.append(make('tr', {}, [
      make('td', { text: formatDate(question.date) }),
      make('td', { className: 'question-cell', text: question.text }),
      make('td', { text: winnerLabel(question) }),
      make('td', { text: `${question.votesCast} / ${state.data.summary.activePeople}` }),
    ]));
  }
}

function render(data) {
  state.data = data;
  setLoggedIn(true);
  elements.summaryPeople.textContent = data.summary.activePeople;
  elements.summaryQuestions.textContent = data.summary.totalQuestions;
  elements.summaryVotes.textContent = data.summary.totalVotes;
  elements.summaryToday.textContent = data.summary.todayVotes;

  const todayQuestion = data.questions.find((question) => question.date === data.today);
  elements.todayParticipation.textContent = todayQuestion
    ? `${todayQuestion.votesCast} of ${data.summary.activePeople} votes cast`
    : 'No question today.';
  elements.missingVoters.textContent = data.summary.todayMissing.length
    ? data.summary.todayMissing.join(', ')
    : (todayQuestion ? 'Everyone has voted.' : 'No ballot is open.');

  renderQuestions(data.questions);
  renderPeople(data.people);
  renderReports(data.questions);

  if (!elements.questionDateInput.value) {
    elements.questionDateInput.value = data.today;
  }
}

async function loadDashboard({ preserveNotice = false } = {}) {
  try {
    const data = await adminFetch('/api/admin/data');
    render(data);
    if (!preserveNotice) clearNotice();
  } catch (error) {
    if (error.status === 401) {
      state.password = '';
      sessionStorage.removeItem('officeVerdictAdminPassword');
      setLoggedIn(false);
      showNotice('The admin password is incorrect.', 'error');
      return;
    }
    showNotice(error.message, 'error');
  }
}

async function updateQuestion(payload) {
  try {
    const result = await adminFetch('/api/admin/question', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showNotice(result.message);
    resetQuestionForm();
    await loadDashboard({ preserveNotice: true });
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

async function deleteQuestion(question) {
  const warning = question.votesCast
    ? `Delete this question and its ${question.votesCast} votes? This cannot be undone.`
    : 'Delete this question?';
  if (!window.confirm(warning)) return;
  await updateQuestion({ action: 'delete', id: question.id });
}

async function updatePerson(payload) {
  try {
    const result = await adminFetch('/api/admin/person', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showNotice(result.message);
    await loadDashboard({ preserveNotice: true });
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

async function generateMissingPins() {
  elements.generatePinsButton.disabled = true;
  try {
    const result = await adminFetch('/api/admin/person', {
      method: 'POST',
      body: JSON.stringify({ action: 'generateMissingPins' }),
    });
    showNotice(result.message);
    if (result.generated?.length) {
      elements.generatedPinsText.textContent = result.generated
        .map((entry) => `${entry.name}: ${entry.pin}`)
        .join('\n');
      elements.generatedPinsPanel.hidden = false;
    }
    await loadDashboard({ preserveNotice: true });
  } catch (error) {
    showNotice(error.message, 'error');
  } finally {
    elements.generatePinsButton.disabled = false;
  }
}

async function exportCsv() {
  try {
    const response = await fetch('/api/admin/export', {
      headers: { 'x-admin-password': state.password },
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'The export could not be created.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'office-verdict-votes.csv';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  state.password = elements.adminPassword.value;
  sessionStorage.setItem('officeVerdictAdminPassword', state.password);
  await loadDashboard();
});

elements.logoutButton.addEventListener('click', () => {
  state.password = '';
  state.data = null;
  sessionStorage.removeItem('officeVerdictAdminPassword');
  elements.adminPassword.value = '';
  setLoggedIn(false);
  clearNotice();
});

elements.questionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await updateQuestion({
    action: 'save',
    id: elements.questionId.value || undefined,
    date: elements.questionDateInput.value,
    text: elements.questionTextInput.value,
    category: elements.questionCategoryInput.value,
  });
});

elements.cancelQuestionEdit.addEventListener('click', resetQuestionForm);
elements.generatePinsButton.addEventListener('click', generateMissingPins);
elements.copyPinsButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(elements.generatedPinsText.textContent);
  showNotice('PIN list copied.');
});
elements.exportButton.addEventListener('click', exportCsv);

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab-button').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = true; });
    button.classList.add('active');
    document.querySelector(`#tab-${button.dataset.tab}`).hidden = false;
  });
});

setLoggedIn(false);
if (state.password) loadDashboard();
