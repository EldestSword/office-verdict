const elements = {
  adminNotice: document.querySelector('#adminNotice'),
  loginPanel: document.querySelector('#loginPanel'),
  loginForm: document.querySelector('#loginForm'),
  adminPassword: document.querySelector('#adminPassword'),
  dashboard: document.querySelector('#dashboard'),
  logoutButton: document.querySelector('#logoutButton'),
  summaryPeople: document.querySelector('#summaryPeople'),
  summaryBank: document.querySelector('#summaryBank'),
  summaryRounds: document.querySelector('#summaryRounds'),
  summaryVotes: document.querySelector('#summaryVotes'),
  summaryComments: document.querySelector('#summaryComments'),
  summaryTurnout: document.querySelector('#summaryTurnout'),
  currentRoundTitle: document.querySelector('#currentRoundTitle'),
  currentRoundMeta: document.querySelector('#currentRoundMeta'),
  currentParticipation: document.querySelector('#currentParticipation'),
  missingVoters: document.querySelector('#missingVoters'),
  closeRoundButton: document.querySelector('#closeRoundButton'),
  roundDuration: document.querySelector('#roundDuration'),
  scheduleAt: document.querySelector('#scheduleAt'),
  randomQuestionButton: document.querySelector('#randomQuestionButton'),
  questionForm: document.querySelector('#questionForm'),
  questionFormTitle: document.querySelector('#questionFormTitle'),
  questionId: document.querySelector('#questionId'),
  questionTextInput: document.querySelector('#questionTextInput'),
  questionCategoryInput: document.querySelector('#questionCategoryInput'),
  questionTagsInput: document.querySelector('#questionTagsInput'),
  cancelQuestionEdit: document.querySelector('#cancelQuestionEdit'),
  questionSearch: document.querySelector('#questionSearch'),
  questionStatusFilter: document.querySelector('#questionStatusFilter'),
  questionCategoryFilter: document.querySelector('#questionCategoryFilter'),
  questionCount: document.querySelector('#questionCount'),
  questionsTableBody: document.querySelector('#questionsTableBody'),
  importFile: document.querySelector('#importFile'),
  importText: document.querySelector('#importText'),
  importPreview: document.querySelector('#importPreview'),
  importButton: document.querySelector('#importButton'),
  clearImportButton: document.querySelector('#clearImportButton'),
  peopleTableBody: document.querySelector('#peopleTableBody'),
  leaderboardTableBody: document.querySelector('#leaderboardTableBody'),
  categoryTableBody: document.querySelector('#categoryTableBody'),
  turnoutChart: document.querySelector('#turnoutChart'),
  reportsTableBody: document.querySelector('#reportsTableBody'),
  exportButton: document.querySelector('#exportButton'),
  commentsTableBody: document.querySelector('#commentsTableBody'),
  showHiddenComments: document.querySelector('#showHiddenComments'),
};

const state = {
  password: sessionStorage.getItem('officeVerdictAdminPassword') ?? '',
  data: null,
  importItems: [],
};

function make(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
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

function formatDateTime(value) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusBadge(status) {
  const classes = { open: 'success', queued: 'warning', closed: 'off', archived: 'off' };
  return make('span', { className: `badge ${classes[status] || 'off'}`, text: status });
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

function durationValue() {
  return elements.roundDuration.value === 'manual' ? null : Number(elements.roundDuration.value);
}

function resetQuestionForm() {
  elements.questionForm.reset();
  elements.questionId.value = '';
  elements.questionFormTitle.textContent = 'Add a question';
  elements.cancelQuestionEdit.hidden = true;
}

function editQuestion(question) {
  elements.questionId.value = question.id;
  elements.questionTextInput.value = question.text;
  elements.questionCategoryInput.value = question.category ?? '';
  elements.questionTagsInput.value = (question.tags ?? []).join(', ');
  elements.questionFormTitle.textContent = 'Edit question';
  elements.cancelQuestionEdit.hidden = false;
  window.scrollTo({ top: elements.questionForm.offsetTop - 30, behavior: 'smooth' });
}

function topResultLabel(question) {
  const top = question.results?.filter((result) => result.rank === 1) ?? [];
  if (!question.votesCast) return 'No votes';
  if (top.length === 1) return `${top[0].name} (${top[0].votes})`;
  return `Tie: ${top.map((item) => item.name).join(', ')}`;
}

async function updateQuestion(payload, confirmation) {
  if (confirmation && !window.confirm(confirmation)) return;
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

async function launchQuestion(question) {
  const warning = state.data.currentRound
    ? `Close the current round and launch “${question.text}”?`
    : `Launch “${question.text}” now?`;
  await updateQuestion({ action: 'launch', id: question.id, durationMinutes: durationValue() }, warning);
}

function filteredQueuedQuestions() {
  const query = elements.questionSearch.value.trim().toLowerCase();
  const category = elements.questionCategoryFilter.value;
  return (state.data?.questions ?? []).filter((question) => {
    if (question.status !== 'queued') return false;
    if (category && question.category !== category) return false;
    if (!query) return true;
    return [question.text, question.category, ...(question.tags ?? [])]
      .filter(Boolean).join(' ').toLowerCase().includes(query);
  });
}

async function launchRandomQuestion() {
  const candidates = filteredQueuedQuestions();
  if (!candidates.length) {
    showNotice('There are no queued questions matching the current filters.', 'warning');
    return;
  }
  const question = candidates[Math.floor(Math.random() * candidates.length)];
  await launchQuestion(question);
}

async function scheduleQuestion(question) {
  if (!elements.scheduleAt.value) {
    showNotice('Choose a scheduled opening date and time first.', 'warning');
    return;
  }
  const opensAt = new Date(elements.scheduleAt.value);
  if (Number.isNaN(opensAt.getTime())) {
    showNotice('The scheduled opening time is invalid.', 'warning');
    return;
  }
  await updateQuestion({ action: 'schedule', id: question.id, opensAt: opensAt.toISOString(), durationMinutes: durationValue() }, `Schedule “${question.text}” for ${formatDateTime(opensAt)}?`);
}

function questionActions(question) {
  const actions = make('div', { className: 'inline-actions' });
  actions.append(make('button', { className: 'small-button', text: 'Edit', type: 'button', onClick: () => editQuestion(question) }));

  if (question.status === 'open') {
    actions.append(make('button', { className: 'small-button danger-button', text: 'Close', type: 'button', onClick: () => updateQuestion({ action: 'close', id: question.id }, 'Close voting and reveal the results?') }));
  } else if (question.status === 'queued') {
    actions.append(
      make('button', { className: 'small-button', text: 'Launch', type: 'button', onClick: () => launchQuestion(question) }),
      make('button', { className: 'small-button', text: 'Schedule', type: 'button', onClick: () => scheduleQuestion(question) }),
      make('button', { className: 'small-button danger-button', text: 'Archive', type: 'button', onClick: () => updateQuestion({ action: 'archive', id: question.id }, 'Archive this question?') }),
    );
  } else if (question.status === 'closed') {
    actions.append(make('button', { className: 'small-button', text: 'Copy to bank', type: 'button', onClick: () => updateQuestion({ action: 'duplicate', id: question.id }, 'Create a fresh reusable copy while preserving this result?') }));
  } else if (question.status === 'archived') {
    actions.append(make('button', { className: 'small-button', text: 'Restore', type: 'button', onClick: () => updateQuestion({ action: 'restore', id: question.id }) }));
  }
  return actions;
}

function populateQuestionCategories(questions) {
  const selected = elements.questionCategoryFilter.value;
  const categories = [...new Set(questions.map((question) => question.category).filter(Boolean))].sort();
  elements.questionCategoryFilter.replaceChildren(new Option('All categories', ''));
  for (const category of categories) elements.questionCategoryFilter.add(new Option(category, category));
  if (categories.includes(selected)) elements.questionCategoryFilter.value = selected;
}

function renderQuestions() {
  const questions = state.data?.questions ?? [];
  const query = elements.questionSearch.value.trim().toLowerCase();
  const status = elements.questionStatusFilter.value;
  const category = elements.questionCategoryFilter.value;
  const filtered = questions.filter((question) => {
    if (status && question.status !== status) return false;
    if (category && question.category !== category) return false;
    if (!query) return true;
    return [question.text, question.category, ...(question.tags ?? [])].filter(Boolean).join(' ').toLowerCase().includes(query);
  });

  elements.questionCount.textContent = `${filtered.length} question${filtered.length === 1 ? '' : 's'}`;
  elements.questionsTableBody.replaceChildren();
  if (!filtered.length) {
    elements.questionsTableBody.append(make('tr', {}, [make('td', { text: 'No questions match these filters.', attrs: { colspan: '5' } })]));
    return;
  }

  for (const question of filtered) {
    const meta = [question.category || 'Uncategorised', ...(question.tags ?? [])].join(' · ');
    elements.questionsTableBody.append(make('tr', {}, [
      make('td', {}, [statusBadge(question.status)]),
      make('td', { className: 'question-cell' }, [
        make('div', { text: question.text }),
        make('div', { className: 'table-muted', text: meta }),
        question.openedAt ? make('div', { className: 'table-muted', text: `Opened: ${formatDateTime(question.openedAt)}` }) : document.createTextNode(''),
      ]),
      make('td', { text: question.status === 'closed' ? formatDateTime(question.closedAt) : question.openedAt ? formatDateTime(question.openedAt) : 'Not yet' }),
      make('td', { text: String(question.votesCast) }),
      make('td', {}, [questionActions(question)]),
    ]));
  }
}

function renderCurrentRound() {
  const current = state.data.currentRound;
  if (!current) {
    elements.currentRoundTitle.textContent = 'No round open';
    elements.currentRoundMeta.textContent = 'Launch a question from the bank when the office requires another judgement.';
    elements.currentParticipation.textContent = '0 votes';
    elements.missingVoters.textContent = 'No ballot is open.';
    elements.closeRoundButton.hidden = true;
    return;
  }
  elements.currentRoundTitle.textContent = current.text;
  elements.currentRoundMeta.textContent = current.closesAt ? `Closes ${formatDateTime(current.closesAt)}` : 'Open until manually closed.';
  elements.currentParticipation.textContent = `${current.votesCast} of ${state.data.summary.activePeople} votes cast`;
  elements.missingVoters.textContent = state.data.summary.currentMissing.length ? state.data.summary.currentMissing.join(', ') : 'Everyone has voted.';
  elements.closeRoundButton.hidden = false;
}

async function updatePerson(payload) {
  try {
    const result = await adminFetch('/api/admin/person', { method: 'POST', body: JSON.stringify(payload) });
    showNotice(result.message);
    await loadDashboard({ preserveNotice: true });
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

function renderPeople() {
  elements.peopleTableBody.replaceChildren();
  for (const person of state.data.people) {
    elements.peopleTableBody.append(make('tr', {}, [
      make('td', { text: person.name }),
      make('td', {}, [make('span', { className: `badge ${person.is_active ? 'success' : 'off'}`, text: person.is_active ? 'Active' : 'Inactive' })]),
      make('td', {}, [make('button', { className: `small-button${person.is_active ? ' danger-button' : ''}`, text: person.is_active ? 'Deactivate' : 'Activate', type: 'button', onClick: () => updatePerson({ action: 'toggleActive', id: person.id, active: !person.is_active }) })]),
    ]));
  }
}

function renderReports() {
  elements.leaderboardTableBody.replaceChildren();
  for (const row of state.data.trends.leaderboard) {
    elements.leaderboardTableBody.append(make('tr', {}, [make('td', { text: row.name }), make('td', { text: String(row.wins) }), make('td', { text: String(row.topThreeFinishes) }), make('td', { text: String(row.totalVotesReceived) }), make('td', { text: String(row.averageVotesWhenScoring) })]));
  }

  elements.categoryTableBody.replaceChildren();
  if (!state.data.trends.categories.length) elements.categoryTableBody.append(make('tr', {}, [make('td', { text: 'No completed rounds yet.', attrs: { colspan: '4' } })]));
  else for (const row of state.data.trends.categories) elements.categoryTableBody.append(make('tr', {}, [make('td', { text: row.category }), make('td', { text: String(row.rounds) }), make('td', { text: `${row.averageTurnout}%` }), make('td', { text: String(row.comments) })]));

  elements.turnoutChart.replaceChildren();
  const turnout = state.data.trends.turnout.slice(-12);
  if (!turnout.length) elements.turnoutChart.append(make('p', { className: 'muted-copy', text: 'No turnout trend exists yet.' }));
  else for (const point of turnout) elements.turnoutChart.append(make('div', { className: 'trend-row' }, [make('span', { className: 'trend-label', text: point.question }), make('div', { className: 'trend-track' }, [make('span', { attrs: { style: `width:${Math.min(100, point.turnout)}%` } })]), make('strong', { text: `${point.turnout}%` })]));

  const closed = state.data.questions.filter((question) => question.status === 'closed');
  elements.reportsTableBody.replaceChildren();
  if (!closed.length) elements.reportsTableBody.append(make('tr', {}, [make('td', { text: 'No completed rounds yet.', attrs: { colspan: '5' } })]));
  else for (const question of closed) {
    const eligible = question.eligibleVoters || state.data.summary.activePeople;
    const turnoutPct = eligible ? Math.round((question.votesCast / eligible) * 100) : 0;
    elements.reportsTableBody.append(make('tr', {}, [make('td', { text: formatDateTime(question.closedAt) }), make('td', { className: 'question-cell', text: question.text }), make('td', { text: topResultLabel(question) }), make('td', { text: `${question.votesCast} (${turnoutPct}%)` }), make('td', { text: String(question.commentsCount) })]));
  }
}

async function moderateComment(voteId, hidden) {
  try {
    const result = await adminFetch('/api/admin/comment', { method: 'POST', body: JSON.stringify({ voteId, hidden }) });
    showNotice(result.message);
    await loadDashboard({ preserveNotice: true });
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

function renderComments() {
  const comments = state.data.comments.filter((comment) => elements.showHiddenComments.checked || !comment.hidden);
  elements.commentsTableBody.replaceChildren();
  if (!comments.length) {
    elements.commentsTableBody.append(make('tr', {}, [make('td', { text: 'No comments to show.', attrs: { colspan: '6' } })]));
    return;
  }
  for (const comment of comments) {
    elements.commentsTableBody.append(make('tr', {}, [
      make('td', { className: 'question-cell', text: comment.question }),
      make('td', { text: comment.voter }),
      make('td', { text: comment.selectedPerson }),
      make('td', { className: 'comment-cell', text: comment.text }),
      make('td', {}, [make('span', { className: `badge ${comment.hidden ? 'warning' : 'success'}`, text: comment.hidden ? 'Hidden' : 'Public' })]),
      make('td', {}, [make('button', { className: 'small-button', text: comment.hidden ? 'Restore' : 'Hide', type: 'button', onClick: () => moderateComment(comment.voteId, !comment.hidden) })]),
    ]));
  }
}

function render(data) {
  state.data = data;
  setLoggedIn(true);
  elements.summaryPeople.textContent = data.summary.activePeople;
  elements.summaryBank.textContent = data.summary.bankQuestions;
  elements.summaryRounds.textContent = data.summary.completedRounds;
  elements.summaryVotes.textContent = data.summary.totalVotes;
  elements.summaryComments.textContent = data.summary.totalComments;
  elements.summaryTurnout.textContent = `${data.summary.averageTurnout}%`;
  elements.roundDuration.value = String(data.defaultRoundMinutes || 60);
  populateQuestionCategories(data.questions);
  renderCurrentRound();
  renderQuestions();
  renderPeople();
  renderReports();
  renderComments();
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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(cell.trim()); cell = ''; }
    else if (character === '\n') { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else if (character !== '\r') cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseImport(text) {
  const clean = text.trim();
  if (!clean) return [];
  const firstLine = clean.split(/\r?\n/, 1)[0].toLowerCase();
  if (firstLine.includes('question') && firstLine.includes(',')) {
    const rows = parseCsv(clean);
    const headers = rows.shift().map((header) => header.trim().toLowerCase());
    const questionIndex = headers.findIndex((header) => ['question', 'text', 'question_text'].includes(header));
    const categoryIndex = headers.indexOf('category');
    const tagsIndex = headers.indexOf('tags');
    if (questionIndex < 0) throw new Error('The CSV needs a question column.');
    return rows.filter((row) => row[questionIndex]?.trim()).map((row) => ({ text: row[questionIndex], category: categoryIndex >= 0 ? row[categoryIndex] : '', tags: tagsIndex >= 0 ? row[tagsIndex] : '' }));
  }
  return clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [text, category = '', tags = ''] = line.split('|').map((part) => part.trim());
    return { text, category, tags };
  });
}

function refreshImportPreview() {
  try {
    state.importItems = parseImport(elements.importText.value);
    const categories = new Set(state.importItems.map((item) => item.category).filter(Boolean));
    elements.importPreview.textContent = state.importItems.length ? `${state.importItems.length} questions ready across ${categories.size || 1} categor${categories.size === 1 ? 'y' : 'ies'}. Duplicates already in the database will be skipped.` : 'Nothing ready to import.';
    elements.importPreview.className = 'import-preview muted-copy';
  } catch (error) {
    state.importItems = [];
    elements.importPreview.textContent = error.message;
    elements.importPreview.className = 'import-preview notice error';
  }
}

async function importQuestions() {
  refreshImportPreview();
  if (!state.importItems.length) { showNotice('Add some questions before importing.', 'warning'); return; }
  if (!window.confirm(`Import ${state.importItems.length} questions into the bank?`)) return;
  try {
    elements.importButton.disabled = true;
    const result = await adminFetch('/api/admin/question', { method: 'POST', body: JSON.stringify({ action: 'bulkImport', items: state.importItems }) });
    showNotice(result.message);
    elements.importText.value = '';
    elements.importFile.value = '';
    refreshImportPreview();
    await loadDashboard({ preserveNotice: true });
  } catch (error) {
    showNotice(error.message, 'error');
  } finally {
    elements.importButton.disabled = false;
  }
}

async function exportCsv() {
  try {
    const response = await fetch('/api/admin/export', { headers: { 'x-admin-password': state.password } });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'The export could not be created.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'office-verdict-votes-and-comments.csv';
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
  await updateQuestion({ action: 'save', id: elements.questionId.value || undefined, text: elements.questionTextInput.value, category: elements.questionCategoryInput.value, tags: elements.questionTagsInput.value });
});

elements.cancelQuestionEdit.addEventListener('click', resetQuestionForm);
elements.randomQuestionButton.addEventListener('click', launchRandomQuestion);
elements.closeRoundButton.addEventListener('click', () => { if (state.data.currentRound) updateQuestion({ action: 'close', id: state.data.currentRound.id }, 'Close voting and reveal the results?'); });
[elements.questionSearch, elements.questionStatusFilter, elements.questionCategoryFilter].forEach((element) => { element.addEventListener(element.tagName === 'INPUT' ? 'input' : 'change', renderQuestions); });
elements.importText.addEventListener('input', refreshImportPreview);
elements.importFile.addEventListener('change', async () => { const [file] = elements.importFile.files; if (!file) return; elements.importText.value = await file.text(); refreshImportPreview(); });
elements.importButton.addEventListener('click', importQuestions);
elements.clearImportButton.addEventListener('click', () => { elements.importFile.value = ''; elements.importText.value = ''; refreshImportPreview(); });
elements.exportButton.addEventListener('click', exportCsv);
elements.showHiddenComments.addEventListener('change', renderComments);

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab-button').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = true; });
    button.classList.add('active');
    document.querySelector(`#tab-${button.dataset.tab}`).hidden = false;
  });
});

setLoggedIn(false);
refreshImportPreview();
if (state.password) loadDashboard();
