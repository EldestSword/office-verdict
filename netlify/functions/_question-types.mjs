export const QUESTION_TYPES = {
  PEOPLE: 'people_vote',
  WOULD_YOU_RATHER: 'would_you_rather',
};

export function normaliseQuestionType(value) {
  const clean = String(value ?? QUESTION_TYPES.PEOPLE).trim().toLowerCase();
  if (!Object.values(QUESTION_TYPES).includes(clean)) {
    throw Object.assign(new Error('Question type is invalid.'), { statusCode: 400 });
  }
  return clean;
}

export function normaliseOption(value, label) {
  const clean = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.length > 180) {
    throw Object.assign(new Error(`${label} must be between 2 and 180 characters.`), { statusCode: 400 });
  }
  return clean;
}

export function questionPayload(body) {
  const questionType = normaliseQuestionType(body.questionType ?? body.type);
  if (questionType === QUESTION_TYPES.WOULD_YOU_RATHER) {
    const optionA = normaliseOption(body.optionA ?? body.option_a, 'Option A');
    const optionB = normaliseOption(body.optionB ?? body.option_b, 'Option B');
    if (optionA.toLowerCase() === optionB.toLowerCase()) {
      throw Object.assign(new Error('Would You Rather options must be different.'), { statusCode: 400 });
    }
    return { question_type: questionType, option_a: optionA, option_b: optionB };
  }
  return { question_type: questionType, option_a: null, option_b: null };
}

export function buildQuestionResults(question, votes, people) {
  if (question.question_type === QUESTION_TYPES.WOULD_YOU_RATHER) {
    const counts = { A: 0, B: 0 };
    for (const vote of votes) {
      if (vote.selected_option === 'A' || vote.selected_option === 'B') counts[vote.selected_option] += 1;
    }
    const total = counts.A + counts.B;
    const rows = [
      { choice: 'A', label: question.option_a ?? 'Option A', votes: counts.A },
      { choice: 'B', label: question.option_b ?? 'Option B', votes: counts.B },
    ].sort((a, b) => b.votes - a.votes || a.choice.localeCompare(b.choice));
    return rows.map((row, index) => ({
      ...row,
      name: row.label,
      percentage: total ? Number(((row.votes / total) * 100).toFixed(1)) : 0,
      rank: index > 0 && row.votes === rows[index - 1].votes ? rows[index - 1].rank : index + 1,
    }));
  }

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const counts = new Map();
  for (const vote of votes) {
    if (!vote.selected_person_id) continue;
    counts.set(vote.selected_person_id, (counts.get(vote.selected_person_id) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .map(([personId, voteCount]) => ({
      personId,
      name: peopleById.get(personId)?.name ?? 'Unknown',
      votes: voteCount,
    }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  let previousVotes = null;
  let previousRank = 0;
  return rows.map((row, index) => {
    const rank = previousVotes === row.votes ? previousRank : index + 1;
    previousVotes = row.votes;
    previousRank = rank;
    return { ...row, rank };
  });
}

export function choiceLabel(question, vote, peopleById = new Map()) {
  if (question?.question_type === QUESTION_TYPES.WOULD_YOU_RATHER) {
    if (vote.selected_option === 'A') return question.option_a ?? 'Option A';
    if (vote.selected_option === 'B') return question.option_b ?? 'Option B';
    return 'Unknown option';
  }
  return peopleById.get(vote.selected_person_id) ?? 'Unknown';
}

export function publicQuestionComments(question, votes, people) {
  const peopleById = new Map(people.map((person) => [person.id, person.name]));
  return votes
    .filter((vote) => vote.comment_text && !vote.comment_hidden)
    .map((vote) => ({
      selectedPersonId: vote.selected_person_id,
      selectedOption: vote.selected_option,
      selectedPersonName: choiceLabel(question, vote, peopleById),
      choiceLabel: choiceLabel(question, vote, peopleById),
      text: vote.comment_text,
    }));
}
