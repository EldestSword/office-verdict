import { parseQuestionImport } from './admin-import.js';

const $ = (selector) => document.querySelector(selector);
const elements = {
  notice: $('#adminNotice'), loginPanel: $('#loginPanel'), loginForm: $('#loginForm'), passwordInput: $('#adminPassword'), dashboard: $('#dashboard'), logout: $('#logoutButton'),
  summaryPeople: $('#summaryPeople'), summaryBank: $('#summaryBank'), summaryWyr: $('#summaryWyr'), summaryRounds: $('#summaryRounds'), summaryVotes: $('#summaryVotes'), summaryTurnout: $('#summaryTurnout'),
  currentTitle: $('#currentRoundTitle'), currentMeta: $('#currentRoundMeta'), currentParticipation: $('#currentParticipation'), missingVoters: $('#missingVoters'), closeRound: $('#closeRoundButton'), duration: $('#roundDuration'), scheduleAt: $('#scheduleAt'), randomLaunch: $('#randomQuestionButton'),
  questionForm: $('#questionForm'), questionFormTitle: $('#questionFormTitle'), questionId: $('#questionId'), questionType: $('#questionTypeInput'), questionText: $('#questionTextInput'), wyrFields: $('#wyrFields'), optionA: $('#optionAInput'), optionB: $('#optionBInput'), categoryInput: $('#questionCategoryInput'), tagsInput: $('#questionTagsInput'), cancelEdit: $('#cancelQuestionEdit'),
  search: $('#questionSearch'), typeFilter: $('#questionTypeFilter'), statusFilter: $('#questionStatusFilter'), categoryFilter: $('#questionCategoryFilter'), count: $('#questionCount'), questionsBody: $('#questionsTableBody'),
  importFile: $('#importFile'), importText: $('#importText'), importPreview: $('#importPreview'), importButton: $('#importButton'), clearImport: $('#clearImportButton'),
  peopleBody: $('#peopleTableBody'), leaderboardBody: $('#leaderboardTableBody'), categoryBody: $('#categoryTableBody'), turnoutChart: $('#turnoutChart'), reportsBody: $('#reportsTableBody'), exportButton: $('#exportButton'), commentsBody: $('#commentsTableBody'), showHidden: $('#showHiddenComments'),
  wyrRounds: $('#wyrRoundsStat'), wyrA: $('#wyrAStat'), wyrB: $('#wyrBStat'), wyrClosest: $('#wyrClosestTableBody'),
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
    else if (key === 'attrs') Object.entries(value).forEach(([name, attrValue]) => node.setAttribute(name, attrValue));
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node[key] = value;
  }
  node.append(...children);
  return node;
}

function showNotice(message, type = 'success') {
  elements.notice.textContent = message;
  elements.notice.className = `notice${type === 'success' ? '' : ` ${type}`}`;
  elements.notice.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function clearNotice() { elements.notice.hidden = true; elements.notice.textContent = ''; }
function setLoggedIn(loggedIn) { elements.loginPanel.hidden = loggedIn; elements.dashboard.hidden = !loggedIn; elements.logout.hidden = !loggedIn; }
function formatDateTime(value) { return value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : 'Not set'; }
function typeLabel(type) { return type === 'would_you_rather' ? 'Would You Rather' : 'Most Likely To'; }
function typeBadge(type) { return make('span', { className: `badge ${type === 'would_you_rather' ? 'type-badge-wyr' : 'type-badge-people'}`, text: typeLabel(type) }); }
function statusBadge(status) { const css = { open: 'success', queued: 'warning', closed: 'off', archived: 'off' }[status] ?? 'off'; return make('span', { className: `badge ${css}`, text: status }); }
function durationValue() { return elements.duration.value === 'manual' ? null : Number(elements.duration.value); }

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

function toggleWyrFields() {
  const isWyr = elements.questionType.value === 'would_you_rather';
  elements.wyrFields.hidden = !isWyr;
  elements.optionA.required = isWyr;
  elements.optionB.required = isWyr;
}

function resetQuestionForm() {
  elements.questionForm.reset();
  elements.questionId.value = '';
  elements.questionType.value = 'people_vote';
  elements.questionFormTitle.textContent = 'Add a question';
  elements.cancelEdit.hidden = true;
  toggleWyrFields();
}

function editQuestion(question) {
  elements.questionId.value = question.id;
  elements.questionType.value = question.questionType;
  elements.questionText.value = question.text;
  elements.optionA.value = question.optionA ?? '';
  elements.optionB.value = question.optionB ?? '';
  elements.categoryInput.value = question.category ?? '';
  elements.tagsInput.value = (question.tags ?? []).join(', ');
  elements.questionFormTitle.textContent = 'Edit question';
  elements.cancelEdit.hidden = false;
  toggleWyrFields();
  window.scrollTo({ top: elements.questionForm.offsetTop - 30, behavior: 'smooth' });
}

async function updateQuestion(payload, confirmation) {
  if (confirmation && !window.confirm(confirmation)) return;
  try {
    const result = await adminFetch('/api/admin/question', { method: 'POST', body: JSON.stringify(payload) });
    showNotice(result.message);
    resetQuestionForm();
    await loadDashboard({ preserveNotice: true });
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

async function launchQuestion(question) {
  const message = state.data.currentRound
    ? `Close the current round and launch “${question.text}”?`
    : `Launch “${question.text}” now?`;
  await updateQuestion({ action: 'launch', id: question.id, durationMinutes: durationValue() }, message);
}

async function scheduleQuestion(question) {
  if (!elements.scheduleAt.value) { showNotice('Choose a scheduled opening date and time first.', 'warning'); return; }
  const opensAt = new Date(elements.scheduleAt.value);
  if (Number.isNaN(opensAt.getTime())) { showNotice('The scheduled opening time is invalid.', 'warning'); return; }
  await updateQuestion({ action: 'schedule', id: question.id, opensAt: opensAt.toISOString(), durationMinutes: durationValue() }, `Schedule “${question.text}” for ${formatDateTime(opensAt)}?`);
}

function filteredQuestions({ queuedOnly = false } = {}) {
  const query = elements.search.value.trim().toLowerCase();
  const type = elements.typeFilter.value;
  const status = elements.statusFilter.value;
  const category = elements.categoryFilter.value;
  return (state.data?.questions ?? []).filter((question) => {
    if (queuedOnly && question.status !== 'queued') return false;
    if (!queuedOnly && status && question.status !== status) return false;
    if (type && question.questionType !== type) return false;
    if (category && question.category !== category) return false;
    if (!query) return true;
    return [question.text, question.optionA, question.optionB, question.category, ...(question.tags ?? [])]
      .filter(Boolean).join(' ').toLowerCase().includes(query);
  });
}

async function launchWeightedRandom() {
  const candidates = filteredQuestions({ queuedOnly: true });
  if (!candidates.length) { showNotice('There are no queued questions matching the current filters.', 'warning'); return; }
  let pool = candidates;
  if (!elements.typeFilter.value) {
    const wyr = candidates.filter((item) => item.questionType === 'would_you_rather');
    const people = candidates.filter((item) => item.questionType === 'people_vote');
    const chooseWyr = wyr.length && (!people.length || Math.random() * 100 < (state.data.wyrRandomWeight || 70));
    pool = chooseWyr ? wyr : (people.length ? people : wyr);
  }
  await launchQuestion(pool[Math.floor(Math.random() * pool.length)]);
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

function populateCategories() {
  const selected = elements.categoryFilter.value;
  const categories = [...new Set((state.data?.questions ?? []).map((item) => item.category).filter(Boolean))].sort();
  elements.categoryFilter.replaceChildren(new Option('All categories', ''));
  categories.forEach((category) => elements.categoryFilter.add(new Option(category, category)));
  if (categories.includes(selected)) elements.categoryFilter.value = selected;
}

function renderQuestions() {
  const questions = filteredQuestions();
  elements.count.textContent = `${questions.length} question${questions.length === 1 ? '' : 's'}`;
  elements.questionsBody.replaceChildren();
  if (!questions.length) {
    elements.questionsBody.append(make('tr', {}, [make('td', { text: 'No questions match these filters.', attrs: { colspan: '6' } })]));
    return;
  }
  for (const question of questions) {
    const detail = question.questionType === 'would_you_rather'
      ? `A: ${question.optionA} · B: ${question.optionB}`
      : '';
    elements.questionsBody.append(make('tr', {}, [
      make('td', {}, [statusBadge(question.status)]),
      make('td', {}, [typeBadge(question.questionType)]),
      make('td', { className: 'question-cell' }, [
        make('div', { text: question.text }),
        detail ? make('div', { className: 'table-muted', text: detail }) : document.createTextNode(''),
        make('div', { className: 'table-muted', text: [question.category || 'Uncategorised', ...(question.tags ?? [])].join(' · ') }),
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
    elements.currentTitle.textContent = 'No round open';
    elements.currentMeta.textContent = 'Launch a question from the bank when the office requires another judgement.';
    elements.currentParticipation.textContent = '0 votes';
    elements.missingVoters.textContent = 'No ballot is open.';
    elements.closeRound.hidden = true;
    return;
  }
  elements.currentTitle.textContent = current.text;
  elements.currentMeta.textContent = `${typeLabel(current.questionType)} · ${current.closesAt ? `Closes ${formatDateTime(current.closesAt)}` : 'Open until manually closed.'}`;
  elements.currentParticipation.textContent = `${current.votesCast} of ${state.data.summary.activePeople} votes cast`;
  elements.missingVoters.textContent = state.data.summary.currentMissing.length ? state.data.summary.currentMissing.join(', ') : 'Everyone has voted.';
  elements.closeRound.hidden = false;
}

async function updatePerson(payload) {
  try {
    const result = await adminFetch('/api/admin/person', { method: 'POST', body: JSON.stringify(payload) });
    showNotice(result.message);
    await loadDashboard({ preserveNotice: true });
  } catch (error) { showNotice(error.message, 'error'); }
}

function renderPeople() {
  elements.peopleBody.replaceChildren();
  for (const person of state.data.people) {
    elements.peopleBody.append(make('tr', {}, [
      make('td', { text: person.name }),
      make('td', {}, [make('span', { className: `badge ${person.is_active ? 'success' : 'off'}`, text: person.is_active ? 'Active' : 'Inactive' })]),
      make('td', {}, [make('button', { className: `small-button${person.is_active ? ' danger-button' : ''}`, text: person.is_active ? 'Deactivate' : 'Activate', type: 'button', onClick: () => updatePerson({ action: 'toggleActive', id: person.id, active: !person.is_active }) })]),
    ]));
  }
}

function topResultLabel(question) {
  if (!question.votesCast) return 'No votes';
  if (question.questionType === 'would_you_rather') {
    const top = question.results[0];
    return `${top.label} (${top.percentage}%)`;
  }
  const winners = question.results.filter((result) => result.rank === 1);
  return winners.length === 1 ? `${winners[0].name} (${winners[0].votes})` : `Tie: ${winners.map((result) => result.name).join(', ')}`;
}

function renderReports() {
  elements.leaderboardBody.replaceChildren();
  state.data.trends.leaderboard.forEach((row) => elements.leaderboardBody.append(make('tr', {}, [
    make('td', { text: row.name }), make('td', { text: String(row.wins) }), make('td', { text: String(row.topThreeFinishes) }), make('td', { text: String(row.totalVotesReceived) }), make('td', { text: String(row.averageVotesWhenScoring) }),
  ])));

  elements.categoryBody.replaceChildren();
  if (!state.data.trends.categories.length) elements.categoryBody.append(make('tr', {}, [make('td', { text: 'No completed rounds yet.', attrs: { colspan: '5' } })]));
  else state.data.trends.categories.forEach((row) => elements.categoryBody.append(make('tr', {}, [make('td', { text: row.category }), make('td', { text: String(row.rounds) }), make('td', { text: String(row.wyrRounds) }), make('td', { text: `${row.averageTurnout}%` }), make('td', { text: String(row.comments) })])));

  elements.turnoutChart.replaceChildren();
  const turnout = state.data.trends.turnout.slice(-12);
  if (!turnout.length) elements.turnoutChart.append(make('p', { className: 'muted-copy', text: 'No turnout trend exists yet.' }));
  else turnout.forEach((point) => elements.turnoutChart.append(make('div', { className: 'trend-row' }, [make('span', { className: 'trend-label', text: point.question }), make('div', { className: 'trend-track' }, [make('span', { attrs: { style: `width:${Math.min(100, point.turnout)}%` } })]), make('strong', { text: `${point.turnout}%` })])));

  const wyr = state.data.trends.wouldYouRather;
  elements.wyrRounds.textContent = wyr.completedRounds;
  elements.wyrA.textContent = wyr.optionAVotes;
  elements.wyrB.textContent = wyr.optionBVotes;
  elements.wyrClosest.replaceChildren();
  if (!wyr.closestRounds.length) elements.wyrClosest.append(make('tr', {}, [make('td', { text: 'No completed Would You Rather rounds yet.', attrs: { colspan: '3' } })]));
  else wyr.closestRounds.forEach((row) => elements.wyrClosest.append(make('tr', {}, [make('td', { className: 'question-cell', text: row.question }), make('td', { text: row.split }), make('td', { text: String(row.votes) })])));

  const closed = state.data.questions.filter((question) => question.status === 'closed');
  elements.reportsBody.replaceChildren();
  if (!closed.length) elements.reportsBody.append(make('tr', {}, [make('td', { text: 'No completed rounds yet.', attrs: { colspan: '6' } })]));
  else closed.forEach((question) => {
    const eligible = question.eligibleVoters || state.data.summary.activePeople;
    const turnoutPercentage = eligible ? Math.round((question.votesCast / eligible) * 100) : 0;
    elements.reportsBody.append(make('tr', {}, [
      make('td', { text: formatDateTime(question.closedAt) }), make('td', {}, [typeBadge(question.questionType)]), make('td', { className: 'question-cell', text: question.text }), make('td', { text: topResultLabel(question) }), make('td', { text: `${question.votesCast} (${turnoutPercentage}%)` }), make('td', { text: String(question.commentsCount) }),
    ]));
  });
}

async function moderateComment(voteId, hidden) {
  try {
    const result = await adminFetch('/api/admin/comment', { method: 'POST', body: JSON.stringify({ voteId, hidden }) });
    showNotice(result.message);
    await loadDashboard({ preserveNotice: true });
  } catch (error) { showNotice(error.message, 'error'); }
}

function renderComments() {
  const comments = state.data.comments.filter((comment) => elements.showHidden.checked || !comment.hidden);
  elements.commentsBody.replaceChildren();
  if (!comments.length) {
    elements.commentsBody.append(make('tr', {}, [make('td', { text: 'No comments to show.', attrs: { colspan: '6' } })]));
    return;
  }
  comments.forEach((comment) => elements.commentsBody.append(make('tr', {}, [
    make('td', { className: 'question-cell', text: comment.question }), make('td', { text: comment.voter }), make('td', { text: comment.selectedPerson }), make('td', { className: 'comment-cell', text: comment.text }), make('td', {}, [make('span', { className: `badge ${comment.hidden ? 'warning' : 'success'}`, text: comment.hidden ? 'Hidden' : 'Public' })]), make('td', {}, [make('button', { className: 'small-button', text: comment.hidden ? 'Restore' : 'Hide', type: 'button', onClick: () => moderateComment(comment.voteId, !comment.hidden) })]),
  ])));
}

function render(data) {
  state.data = data;
  setLoggedIn(true);
  elements.summaryPeople.textContent = data.summary.activePeople;
  elements.summaryBank.textContent = data.summary.bankQuestions;
  elements.summaryWyr.textContent = data.summary.queuedWyrQuestions;
  elements.summaryRounds.textContent = data.summary.completedRounds;
  elements.summaryVotes.textContent = data.summary.totalVotes;
  elements.summaryTurnout.textContent = `${data.summary.averageTurnout}%`;
  elements.duration.value = String(data.defaultRoundMinutes || 60);
  populateCategories();
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

function refreshImportPreview() {
  try {
    state.importItems = parseQuestionImport(elements.importText.value);
    const wyrCount = state.importItems.filter((item) => item.questionType === 'would_you_rather').length;
    elements.importPreview.textContent = state.importItems.length
      ? `${state.importItems.length} questions ready: ${wyrCount} Would You Rather and ${state.importItems.length - wyrCount} Most Likely To. Duplicates will be skipped.`
      : 'Nothing ready to import.';
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
  } catch (error) { showNotice(error.message, 'error'); }
  finally { elements.importButton.disabled = false; }
}

async function exportCsv() {
  try {
    const response = await fetch('/api/admin/export', { headers: { 'x-admin-password': state.password } });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'The export could not be created.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'office-verdict-votes-and-comments.csv';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) { showNotice(error.message, 'error'); }
}

elements.loginForm.addEventListener('submit', async (event) => { event.preventDefault(); state.password = elements.passwordInput.value; sessionStorage.setItem('officeVerdictAdminPassword', state.password); await loadDashboard(); });
elements.logout.addEventListener('click', () => { state.password = ''; state.data = null; sessionStorage.removeItem('officeVerdictAdminPassword'); elements.passwordInput.value = ''; setLoggedIn(false); clearNotice(); });
elements.questionType.addEventListener('change', toggleWyrFields);
elements.questionForm.addEventListener('submit', async (event) => { event.preventDefault(); await updateQuestion({ action: 'save', id: elements.questionId.value || undefined, questionType: elements.questionType.value, text: elements.questionText.value, optionA: elements.optionA.value, optionB: elements.optionB.value, category: elements.categoryInput.value, tags: elements.tagsInput.value }); });
elements.cancelEdit.addEventListener('click', resetQuestionForm);
elements.randomLaunch.addEventListener('click', launchWeightedRandom);
elements.closeRound.addEventListener('click', () => { if (state.data.currentRound) updateQuestion({ action: 'close', id: state.data.currentRound.id }, 'Close voting and reveal the results?'); });
[elements.search, elements.typeFilter, elements.statusFilter, elements.categoryFilter].forEach((element) => element.addEventListener(element.tagName === 'INPUT' ? 'input' : 'change', renderQuestions));
elements.importText.addEventListener('input', refreshImportPreview);
elements.importFile.addEventListener('change', async () => { const [file] = elements.importFile.files; if (!file) return; elements.importText.value = await file.text(); refreshImportPreview(); });
elements.importButton.addEventListener('click', importQuestions);
elements.clearImport.addEventListener('click', () => { elements.importText.value = ''; elements.importFile.value = ''; refreshImportPreview(); });
elements.exportButton.addEventListener('click', exportCsv);
elements.showHidden.addEventListener('change', renderComments);
document.querySelectorAll('.tab-button').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.tab-button').forEach((item) => item.classList.remove('active')); document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = true; }); button.classList.add('active'); document.querySelector(`#tab-${button.dataset.tab}`).hidden = false; }));

setLoggedIn(false);
toggleWyrFields();
if (state.password) loadDashboard();
