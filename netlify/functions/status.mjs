import {
  getSettings,
  getSupabase,
  handleError,
  isQuestionRevealed,
  json,
  londonDateParts,
} from './_shared.mjs';

export async function handler() {
  try {
    const supabase = getSupabase();
    const london = londonDateParts();

    const [settings, peopleResult, questionResult] = await Promise.all([
      getSettings(supabase),
      supabase
        .from('people')
        .select('id, name, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('questions')
        .select('id, question_text, scheduled_date, category, is_results_revealed')
        .eq('scheduled_date', london.date)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    if (peopleResult.error) throw peopleResult.error;
    if (questionResult.error) throw questionResult.error;

    const people = peopleResult.data ?? [];
    const question = questionResult.data;

    if (!question) {
      return json(200, {
        ok: true,
        appName: settings.app_name ?? 'Office Verdict',
        date: london.date,
        revealTime: settings.results_reveal_time ?? '16:00',
        people,
        question: null,
      });
    }

    const votesResult = await supabase
      .from('votes')
      .select('selected_person_id')
      .eq('question_id', question.id);

    if (votesResult.error) throw votesResult.error;

    const votes = votesResult.data ?? [];
    const revealTime = settings.results_reveal_time ?? '16:00';
    const revealed = isQuestionRevealed(question, revealTime);

    let results = null;
    if (revealed) {
      const tally = new Map(people.map((person) => [person.id, 0]));
      for (const vote of votes) {
        tally.set(vote.selected_person_id, (tally.get(vote.selected_person_id) ?? 0) + 1);
      }

      results = people
        .map((person) => ({
          personId: person.id,
          name: person.name,
          votes: tally.get(person.id) ?? 0,
        }))
        .filter((row) => row.votes > 0)
        .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
    }

    return json(200, {
      ok: true,
      appName: settings.app_name ?? 'Office Verdict',
      date: london.date,
      revealTime,
      people,
      question: {
        id: question.id,
        text: question.question_text,
        category: question.category,
        scheduledDate: question.scheduled_date,
        revealed,
      },
      participation: {
        votesCast: votes.length,
        eligibleVoters: people.length,
      },
      results,
    });
  } catch (error) {
    return handleError(error);
  }
}
