import {
  getSettings,
  getSupabase,
  handleError,
  isQuestionRevealed,
  json,
  londonDateParts,
  requireAdmin,
} from './_shared.mjs';

function buildQuestionReports(questions, votes, people, revealTime) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const votesByQuestion = new Map();

  for (const vote of votes) {
    const list = votesByQuestion.get(vote.question_id) ?? [];
    list.push(vote);
    votesByQuestion.set(vote.question_id, list);
  }

  return questions.map((question) => {
    const questionVotes = votesByQuestion.get(question.id) ?? [];
    const counts = new Map();

    for (const vote of questionVotes) {
      counts.set(vote.selected_person_id, (counts.get(vote.selected_person_id) ?? 0) + 1);
    }

    const results = [...counts.entries()]
      .map(([personId, count]) => ({
        personId,
        name: peopleById.get(personId)?.name ?? 'Unknown',
        votes: count,
      }))
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

    const maxVotes = results[0]?.votes ?? 0;
    const winners = results.filter((row) => row.votes === maxVotes && maxVotes > 0);

    return {
      id: question.id,
      text: question.question_text,
      date: question.scheduled_date,
      category: question.category,
      active: question.is_active,
      manuallyRevealed: question.is_results_revealed,
      revealed: isQuestionRevealed(question, revealTime),
      votesCast: questionVotes.length,
      results,
      winners,
      voterIds: questionVotes.map((vote) => vote.voter_id),
    };
  });
}

export async function handler(event) {
  try {
    requireAdmin(event);
    const supabase = getSupabase();
    const london = londonDateParts();

    const [settings, peopleResult, questionsResult, votesResult] = await Promise.all([
      getSettings(supabase),
      supabase
        .from('people')
        .select('id, name, is_active, display_order, pin_hash, created_at')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('questions')
        .select('id, question_text, scheduled_date, category, is_active, is_results_revealed, created_at')
        .order('scheduled_date', { ascending: false }),
      supabase
        .from('votes')
        .select('question_id, voter_id, selected_person_id, created_at, updated_at'),
    ]);

    if (peopleResult.error) throw peopleResult.error;
    if (questionsResult.error) throw questionsResult.error;
    if (votesResult.error) throw votesResult.error;

    const people = (peopleResult.data ?? []).map(({ pin_hash: pinHash, ...person }) => ({
      ...person,
      hasPin: Boolean(pinHash),
    }));
    const questions = questionsResult.data ?? [];
    const votes = votesResult.data ?? [];
    const revealTime = settings.results_reveal_time ?? '16:00';
    const reports = buildQuestionReports(questions, votes, peopleResult.data ?? [], revealTime);

    const activePeople = people.filter((person) => person.is_active);
    const today = reports.find((report) => report.date === london.date) ?? null;
    const todayVoterIds = new Set(today?.voterIds ?? []);

    return json(200, {
      ok: true,
      appName: settings.app_name ?? 'Office Verdict',
      revealTime,
      today: london.date,
      people,
      questions: reports,
      summary: {
        activePeople: activePeople.length,
        totalQuestions: questions.length,
        totalVotes: votes.length,
        todayVotes: today?.votesCast ?? 0,
        todayMissing: activePeople
          .filter((person) => !todayVoterIds.has(person.id))
          .map((person) => person.name),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
