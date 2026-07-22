import {
  csvEscape,
  getSupabase,
  handleError,
  requireAdmin,
  text,
} from './_shared.mjs';
import { choiceLabel } from './_question-types.mjs';

export async function handler(event) {
  try {
    requireAdmin(event);
    const supabase = getSupabase();

    const [peopleResult, questionsResult, votesResult] = await Promise.all([
      supabase.from('people').select('id, name'),
      supabase.from('questions').select('id, question_text, question_type, option_a, option_b, category, tags, status, voting_opens_at, voting_closes_at, closed_at'),
      supabase.from('votes').select('question_id, voter_id, selected_person_id, selected_option, comment_text, comment_hidden, created_at, updated_at'),
    ]);

    if (peopleResult.error) throw peopleResult.error;
    if (questionsResult.error) throw questionsResult.error;
    if (votesResult.error) throw votesResult.error;

    const people = new Map((peopleResult.data ?? []).map((person) => [person.id, person.name]));
    const questions = new Map((questionsResult.data ?? []).map((question) => [question.id, question]));

    const rows = [[
      'Question type',
      'Question',
      'Option A',
      'Option B',
      'Category',
      'Tags',
      'Round status',
      'Opened at',
      'Closed at',
      'Voter',
      'Selected choice',
      'Selected option code',
      'Comment',
      'Comment hidden',
      'Vote created at',
      'Vote last changed',
    ]];

    for (const vote of votesResult.data ?? []) {
      const question = questions.get(vote.question_id) ?? {};
      rows.push([
        question.question_type ?? 'people_vote',
        question.question_text ?? '',
        question.option_a ?? '',
        question.option_b ?? '',
        question.category ?? '',
        (question.tags ?? []).join('; '),
        question.status ?? '',
        question.voting_opens_at ?? '',
        question.closed_at ?? question.voting_closes_at ?? '',
        people.get(vote.voter_id) ?? 'Unknown',
        choiceLabel(question, vote, people),
        vote.selected_option ?? '',
        vote.comment_text ?? '',
        vote.comment_hidden ? 'Yes' : 'No',
        vote.created_at ?? '',
        vote.updated_at ?? '',
      ]);
    }

    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
    return {
      ...text(200, `\uFEFF${csv}`, 'text/csv; charset=utf-8'),
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="office-verdict-votes-and-comments.csv"',
        'cache-control': 'no-store',
      },
    };
  } catch (error) {
    return handleError(error);
  }
}
