import {
  csvEscape,
  getSupabase,
  handleError,
  requireAdmin,
  text,
} from './_shared.mjs';

export async function handler(event) {
  try {
    requireAdmin(event);
    const supabase = getSupabase();

    const [peopleResult, questionsResult, votesResult] = await Promise.all([
      supabase.from('people').select('id, name'),
      supabase.from('questions').select('id, scheduled_date, question_text, category'),
      supabase.from('votes').select('question_id, voter_id, selected_person_id, created_at, updated_at'),
    ]);

    if (peopleResult.error) throw peopleResult.error;
    if (questionsResult.error) throw questionsResult.error;
    if (votesResult.error) throw votesResult.error;

    const people = new Map((peopleResult.data ?? []).map((person) => [person.id, person.name]));
    const questions = new Map((questionsResult.data ?? []).map((question) => [question.id, question]));

    const rows = [
      ['Date', 'Question', 'Category', 'Voter', 'Selected colleague', 'Created at', 'Last changed'],
    ];

    for (const vote of votesResult.data ?? []) {
      const question = questions.get(vote.question_id) ?? {};
      rows.push([
        question.scheduled_date ?? '',
        question.question_text ?? '',
        question.category ?? '',
        people.get(vote.voter_id) ?? 'Unknown',
        people.get(vote.selected_person_id) ?? 'Unknown',
        vote.created_at ?? '',
        vote.updated_at ?? '',
      ]);
    }

    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
    return {
      ...text(200, `\uFEFF${csv}`, 'text/csv; charset=utf-8'),
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="office-verdict-votes.csv"',
        'cache-control': 'no-store',
      },
    };
  } catch (error) {
    return handleError(error);
  }
}
