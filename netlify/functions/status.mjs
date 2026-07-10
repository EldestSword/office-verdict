import {
  getSettings,
  getSupabase,
  handleError,
  json,
  resolveOpenQuestion,
  validateUuid,
} from './_shared.mjs';

export async function handler(event) {
  try {
    const supabase = getSupabase();
    const now = new Date();
    const requestedVoterId = event.queryStringParameters?.voterId
      ? validateUuid(event.queryStringParameters.voterId, 'Voter')
      : null;

    const [settings, peopleResult] = await Promise.all([
      getSettings(supabase),
      supabase
        .from('people')
        .select('id, name, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true }),
    ]);

    if (peopleResult.error) throw peopleResult.error;
    const people = peopleResult.data ?? [];
    const question = await resolveOpenQuestion(supabase, now);

    if (!question) {
      return json(200, {
        ok: true,
        appName: settings.app_name ?? 'Office Verdict',
        people,
        question: null,
        myVote: null,
      });
    }

    const votesResult = await supabase
      .from('votes')
      .select('voter_id, selected_person_id, comment_text')
      .eq('question_id', question.id);

    if (votesResult.error) throw votesResult.error;
    const votes = votesResult.data ?? [];
    const myVote = requestedVoterId
      ? votes.find((vote) => vote.voter_id === requestedVoterId)
      : null;

    return json(200, {
      ok: true,
      appName: settings.app_name ?? 'Office Verdict',
      people,
      question: {
        id: question.id,
        text: question.question_text,
        category: question.category,
        tags: question.tags ?? [],
        opensAt: question.voting_opens_at,
        closesAt: question.voting_closes_at,
        status: question.status,
      },
      participation: {
        votesCast: votes.length,
        eligibleVoters: question.eligible_voters_count ?? people.length,
      },
      myVote: myVote ? {
        selectedPersonId: myVote.selected_person_id,
        comment: myVote.comment_text ?? '',
      } : null,
    });
  } catch (error) {
    return handleError(error);
  }
}
