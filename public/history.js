const elements = {
  notice: document.querySelector('#historyNotice'),
  count: document.querySelector('#historyCount'),
  search: document.querySelector('#historySearch'),
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

function renderResultRows(results, totalVotes) {
  const list = make('div', { className: 'results-list compact-results' });
  if (!results.length) {
    list.append(make('p', { className: 'muted-copy', text: 'No votes were cast.' }));
    return list;
  }

  for (const result of results) {
    const row = make('div', { className: 'result-row' });
    const name = make('span', { className: 'result-name', text: `${result.rank}. ${result.name}` });
    const track = make('div', { className: 'result-track' }, [
      make('span', {
        className: 'result-bar',
        attrs: { style: `width:${totalVotes ? Math.max(2, (result.votes / totalVotes) * 100) : 0}%` },
      }),
    ]);
    const count = make('span', { className: 'result-count', text: `${result.votes} ${result.votes === 1 ? 'vote' : 'votes'}` });
    row.append(name, track, count);
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
    const list = grouped.get(comment.selectedPersonName) ?? [];
    list.push(comment.text);
    grouped.set(comment.selectedPersonName, list);
  }

  for (const [name, texts] of grouped.entries()) {
    const group = make('section', { className: 'comment-group' }, [make('h5', { text: `Comments for ${name}` })]);
    for (const text of texts) group.append(make('blockquote', { text }));
    section.append(group);
  }
  return section;
}

function render() {
  const query = elements.search.value.trim().toLowerCase();
  const category = elements.category.value;
  const filtered = history.filter((item) => {
    if (category && (item.category || 'Uncategorised') !== category) return false;
    if (!query) return true;
    const haystack = [
      item.text,
      item.category,
      ...(item.tags ?? []),
      ...item.results.map((result) => result.name),
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
    const topThree = make('ol', { className: 'podium-list podium-large' });
    for (const result of item.topThree) {
      const medal = result.rank === 1 ? '🥇' : result.rank === 2 ? '🥈' : '🥉';
      topThree.append(make('li', {}, [
        make('span', { text: `${medal} ${result.name}` }),
        make('strong', { text: `${result.votes}` }),
      ]));
    }
    if (!item.topThree.length) topThree.append(make('li', { className: 'muted-copy', text: 'No votes' }));

    const details = make('details', {
      className: 'panel history-detail',
      id: item.id,
      open: window.location.hash === `#${item.id}`,
    });
    const summary = make('summary', {}, [
      make('div', { className: 'history-summary-copy' }, [
        make('div', { className: 'verdict-card-meta' }, [
          make('span', { className: 'badge', text: item.category || 'Uncategorised' }),
          make('span', { className: 'table-muted', text: formatDate(item.closedAt) }),
        ]),
        make('h2', { text: item.text }),
        make('p', { className: 'muted-copy', text: `${item.votesCast} votes · ${item.comments.length} public comments` }),
      ]),
      topThree,
    ]);
    details.append(summary);
    details.append(make('div', { className: 'history-detail-body' }, [
      renderResultRows(item.results, item.votesCast),
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
elements.category.addEventListener('change', render);
loadHistory();
