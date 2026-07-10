import {
  buildRankedResults,
  getSupabase,
  handleError,
  json,
  publicComments,
  resolveOpenQuestion,
  validateUuid,
} from './_shared.mjs';

export async function handler(event) {
  try {
    const supabase = getSupabase();
    await resolveOpenQuestion(supabase, new Date());

    const requestedId = event.queryStringParameters?.id
      ? validateUuid(event.queryStringParameters.id, 'Question')
      : null;
    const requestedLimit = Number(event.queryStringParameters?.limit ?? 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
      : 20;

    let questionQuery = supabase
      .from('questions')
      .select('id, question_text, category, tags, voting_opens_at, voting_closes_at, closed_at, eligible_voters_count, created_at')
      .eq('status', 'closed')
      .eq('is_active', true)
      .order('closed_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (requestedId) questionQuery = questionQuery.eq('id', requestedId);
    else questionQuery = questionQuery.limit(limit);

    const [questionsResult, peopleResult] = await Promise.all([
      questionQuery,
      supabase.from('people').select('id, name'),
    ]);

    if (questionsResult.error) throw questionsResult.error;
    if (peopleResult.error) throw peopleResult.error;

    const questions = questionsResult.data ?? [];
    const people = peopleResult.data ?? [];
    const ids = questions.map((question) => question.id);

    let votes = [];
    if (ids.length) {
      const votesResult = await supabase
        .from('votes')
        .select('question_id, selected_person_id, comment_text, comment_hidden')
        .in('question_id', ids);
      if (votesResult.error) throw votesResult.error;
      votes = votesResult.data ?? [];
    }

    const votesByQuestion = new Map();
    for (const vote of votes) {
      const list = votesByQuestion.get(vote.question_id) ?? [];
      list.push(vote);
      votesByQuestion.set(vote.question_id, list);
    }

    const history = questions.map((question) => {
      const questionVotes = votesByQuestion.get(question.id) ?? [];
      const results = buildRankedResults(questionVotes, people);
      return {
        id: question.id,
        text: question.question_text,
        category: question.category,
        tags: question.tags ?? [],
        openedAt: question.voting_opens_at,
        closedAt: question.closed_at ?? question.voting_closes_at,
        votesCast: questionVotes.length,
        eligibleVoters: question.eligible_voters_count,
        topThree: results.filter((row) => row.rank <= 3),
        results,
        comments: publicComments(questionVotes, people),
      };
    });

    return json(200, { ok: true, history });
  } catch (error) {
    return handleError(error);
  }
}
