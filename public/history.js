const elements = {
  notice: document.querySelector('#historyNotice'),
  count: document.querySelector('#historyCount'),
  search: document.querySelector('#historySearch'),
  type: document.querySelector('#historyType'),
  category: document.querySelector('#historyCategory'),
  list: document.querySelector('#historyList'),
};

let history = [];

function make(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'attrs') {
      for (const [name, attrValue] of Object.entries(value)) node.setAttribute(name, attrValue);
    } else {
      node[key] = value;
    }
  }
  node.append(...children);
  return node;
}

function showNotice(message) {
  elements.notice.textContent = message;
  elements.notice.className = 'notice error';
  elements.notice.hidden = false;
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function renderResultRows(item) {
  const list = make('div', { className: 'results-list compact-results' });
  if (!item.results.length) {
    list.append(make('p', { className: 'muted-copy', text: 'No votes were cast.' }));
    return list;
  }

  for (const result of item.results) {
    const label = item.questionType === 'would_you_rather'
      ? `${result.choice}. ${result.label}`
      : `${result.rank}. ${result.name}`;
    const percentage = item.votesCast ? (result.votes / item.votesCast) * 100 : 0;
    const countText = item.questionType === 'would_you_rather'
      ? `${result.votes} · ${result.percentage}%`
      : `${result.votes} ${result.votes === 1 ? 'vote' : 'votes'}`;
    const row = make('div', { className: `result-row${item.questionType === 'would_you_rather' ? ' wyr-result-row' : ''}` });
    row.append(
      make('span', { className: 'result-name', text: label }),
      make('div', { className: 'result-track' }, [
        make('span', { className: 'result-bar', attrs: { style: `width:${Math.max(result.votes ? 2 : 0, percentage)}%` } }),
      ]),
      make('span', { className: 'result-count', text: countText }),
    );
    list.append(row);
  }
  return list;
}

function renderComments(comments) {
  const section = make('div', { className: 'comment-results' });
  section.append(make('h4', { text: `Anonymous comments (${comments.length})` }));
  if (!comments.length) {
    section.append(make('p', { className: 'muted-copy', text: 'Nobody added a comment. Restraint briefly prevailed.' }));
    return section;
  }

  const grouped = new Map();
  for (const comment of comments) {
    const label = comment.choiceLabel || comment.selectedPersonName || 'Unknown choice';
    const list = grouped.get(label) ?? [];
    list.push(comment.text);
    grouped.set(label, list);
  }

  for (const [label, texts] of grouped.entries()) {
    const group = make('section', { className: 'comment-group' }, [make('h5', { text: `Comments for ${label}` })]);
    for (const text of texts) group.append(make('blockquote', { text }));
    section.append(group);
  }
  return section;
}

function makeSummaryResults(item) {
  const list = make('ol', { className: 'podium-list podium-large' });
  if (!item.results.length) {
    list.append(make('li', { className: 'muted-copy', text: 'No votes' }));
    return list;
  }
  if (item.questionType === 'would_you_rather') {
    for (const result of item.results) {
      list.append(make('li', {}, [
        make('span', { text: `${result.choice}. ${result.label}` }),
        make('strong', { text: `${result.percentage}%` }),
      ]));
    }
    return list;
  }
  for (const result of item.topThree) {
    const medal = result.rank === 1 ? '🥇' : result.rank === 2 ? '🥈' : '🥉';
    list.append(make('li', {}, [
      make('span', { text: `${medal} ${result.name}` }),
      make('strong', { text: `${result.votes}` }),
    ]));
  }
  return list;
}

function render() {
  const query = elements.search.value.trim().toLowerCase();
  const type = elements.type.value;
  const category = elements.category.value;
  const filtered = history.filter((item) => {
    if (type && item.questionType !== type) return false;
    if (category && (item.category || 'Uncategorised') !== category) return false;
    if (!query) return true;
    const haystack = [
      item.text,
      item.optionA,
      item.optionB,
      item.category,
      ...(item.tags ?? []),
      ...item.results.map((result) => result.name || result.label),
      ...item.comments.map((comment) => comment.text),
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  });

  elements.list.replaceChildren();
  elements.count.textContent = `${filtered.length} verdict${filtered.length === 1 ? '' : 's'}`;

  if (!filtered.length) {
    elements.list.append(make('section', { className: 'panel empty-state' }, [
      make('div', { className: 'empty-icon', text: '?' }),
      make('h2', { text: 'Nothing matches' }),
      make('p', { text: 'Try a less ambitious search. The office can only generate so much evidence.' }),
    ]));
    return;
  }

  for (const item of filtered) {
    const typeLabel = item.questionType === 'would_you_rather' ? 'Would You Rather' : 'Most Likely To';
    const details = make('details', {
      className: 'panel history-detail',
      id: item.id,
      open: window.location.hash === `#${item.id}`,
    });
    const summary = make('summary', {}, [
      make('div', { className: 'history-summary-copy' }, [
        make('div', { className: 'verdict-card-meta' }, [
          make('span', { className: `badge ${item.questionType === 'would_you_rather' ? 'type-badge-wyr' : 'type-badge-people'}`, text: typeLabel }),
          make('span', { className: 'table-muted', text: formatDate(item.closedAt) }),
        ]),
        make('h2', { text: item.text }),
        make('p', { className: 'muted-copy', text: `${item.votesCast} votes · ${item.comments.length} public comments` }),
      ]),
      makeSummaryResults(item),
    ]);
    details.append(summary);
    details.append(make('div', { className: 'history-detail-body' }, [
      renderResultRows(item),
      renderComments(item.comments),
    ]));
    elements.list.append(details);
  }

  if (window.location.hash) {
    document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function loadHistory() {
  try {
    const response = await fetch('/api/history?limit=100', { headers: { accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'History could not be loaded.');
    history = data.history ?? [];
    const categories = [...new Set(history.map((item) => item.category || 'Uncategorised'))].sort();
    for (const category of categories) elements.category.add(new Option(category, category));
    render();
  } catch (error) {
    showNotice(error.message);
  }
}

elements.search.addEventListener('input', render);
elements.type.addEventListener('change', render);
elements.category.addEventListener('change', render);
loadHistory();
