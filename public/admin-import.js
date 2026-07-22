export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const clean = String(text ?? '').replace(/^\uFEFF/, '');

  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index];
    if (quoted) {
      if (character === '"' && clean[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (character === '\n') {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else if (character !== '\r') {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseQuestionImport(text) {
  const clean = String(text ?? '').replace(/^\uFEFF/, '').trim();
  if (!clean) return [];

  const rows = parseCsv(clean);
  const headers = rows[0]?.map((header) => header.replace(/^\uFEFF/, '').trim().toLowerCase()) ?? [];
  const hasHeader = headers.includes('question') || headers.includes('question_text') || headers.includes('text');

  if (hasHeader) {
    rows.shift();
    const find = (...names) => headers.findIndex((header) => names.includes(header));
    const questionIndex = find('question', 'question_text', 'text');
    const typeIndex = find('question_type', 'type');
    const optionAIndex = find('option_a', 'option a');
    const optionBIndex = find('option_b', 'option b');
    const categoryIndex = find('category');
    const tagsIndex = find('tags');

    return rows
      .filter((row) => row[questionIndex]?.trim())
      .map((row) => ({
        text: row[questionIndex],
        questionType: typeIndex >= 0 ? row[typeIndex] || 'people_vote' : 'people_vote',
        optionA: optionAIndex >= 0 ? row[optionAIndex] : '',
        optionB: optionBIndex >= 0 ? row[optionBIndex] : '',
        category: categoryIndex >= 0 ? row[categoryIndex] : '',
        tags: tagsIndex >= 0 ? row[tagsIndex] : '',
      }));
  }

  return clean.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      if (parts[0]?.toLowerCase() === 'would_you_rather') {
        return {
          questionType: 'would_you_rather',
          text: parts[1],
          optionA: parts[2],
          optionB: parts[3],
          category: parts[4] ?? '',
          tags: parts[5] ?? '',
        };
      }
      return {
        questionType: 'people_vote',
        text: parts[0],
        optionA: '',
        optionB: '',
        category: parts[1] ?? '',
        tags: parts[2] ?? '',
      };
    });
}
