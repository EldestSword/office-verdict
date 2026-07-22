import {
  getSettings,
  getSupabase,
  handleError,
  json,
  requireAdmin,
  resolveOpenQuestion,
} from './_shared.mjs';
import { buildQuestionResults, choiceLabel, QUESTION_TYPES } from './_question-types.mjs';

function statusOrder(status) {
  return { open: 0, queued: 1, closed: 2, archived: 3 }[status] ?? 9;
}

function buildReports(questions, votes, people) {
  const votesByQuestion = new Map();
  for (const vote of votes) {
    const list = votesByQuestion.get(vote.question_id) ?? [];
    list.push(vote);
    votesByQuestion.set(vote.question_id, list);
  }

  return questions.map((question) => {
    const questionVotes = votesByQuestion.get(question.id) ?? [];
    const results = buildQuestionResults(question, questionVotes, people);
    return {
      id: question.id,
      text: question.question_text,
      questionType: question.question_type,
      optionA: question.option_a,
      optionB: question.option_b,
      category: question.category,
      tags: question.tags ?? [],
      status: question.status,
      active: question.is_active,
      source: question.source,
      openedAt: question.voting_opens_at,
      closesAt: question.voting_closes_at,
      closedAt: question.closed_at,
      createdAt: question.created_at,
      eligibleVoters: question.eligible_voters_count,
      votesCast: questionVotes.length,
      commentsCount: questionVotes.filter((vote) => vote.comment_text).length,
      visibleCommentsCount: questionVotes.filter((vote) => vote.comment_text && !vote.comment_hidden).length,
      results,
      topThree: question.question_type === QUESTION_TYPES.PEOPLE
        ? results.filter((row) => row.rank <= 3)
        : results,
      voterIds: questionVotes.map((vote) => vote.voter_id),
    };
  }).sort((a, b) => {
    const statusDifference = statusOrder(a.status) - statusOrder(b.status);
    if (statusDifference) return statusDifference;
    return String(b.openedAt ?? b.createdAt ?? '').localeCompare(String(a.openedAt ?? a.createdAt ?? ''));
  });
}

function buildLeaderboard(reports, people) {
  const rows = new Map(people.map((person) => [person.id, {
    personId: person.id,
    name: person.name,
    totalVotesReceived: 0,
    wins: 0,
    topThreeFinishes: 0,
    roundsScoring: 0,
  }]));

  for (const report of reports.filter((item) => item.status === 'closed' && item.questionType === QUESTION_TYPES.PEOPLE)) {
    for (const result of report.results) {
      const row = rows.get(result.personId);
      if (!row) continue;
      row.totalVotesReceived += result.votes;
      row.roundsScoring += 1;
      if (result.rank === 1) row.wins += 1;
      if (result.rank <= 3) row.topThreeFinishes += 1;
    }
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      averageVotesWhenScoring: row.roundsScoring
        ? Number((row.totalVotesReceived / row.roundsScoring).toFixed(1))
        : 0,
    }))
    .sort((a, b) => b.wins - a.wins
      || b.totalVotesReceived - a.totalVotesReceived
      || b.topThreeFinishes - a.topThreeFinishes
      || a.name.localeCompare(b.name));
}

function buildCategoryTrends(reports, activePeopleCount) {
  const categories = new Map();
  for (const report of reports.filter((item) => item.status === 'closed')) {
    const name = report.category || 'Uncategorised';
    const row = categories.get(name) ?? {
      category: name,
      rounds: 0,
      peopleRounds: 0,
      wyrRounds: 0,
      votes: 0,
      comments: 0,
      turnoutTotal: 0,
    };
    row.rounds += 1;
    if (report.questionType === QUESTION_TYPES.WOULD_YOU_RATHER) row.wyrRounds += 1;
    else row.peopleRounds += 1;
    row.votes += report.votesCast;
    row.comments += report.commentsCount;
    const eligible = report.eligibleVoters || activePeopleCount;
    row.turnoutTotal += eligible ? (report.votesCast / eligible) * 100 : 0;
    categories.set(name, row);
  }

  return [...categories.values()]
    .map((row) => ({
      ...row,
      averageTurnout: Number((row.turnoutTotal / row.rounds).toFixed(1)),
      averageVotes: Number((row.votes / row.rounds).toFixed(1)),
    }))
    .sort((a, b) => b.rounds - a.rounds || b.votes - a.votes || a.category.localeCompare(b.category));
}

function buildWyrTrends(reports) {
  const rounds = reports.filter((item) => item.status === 'closed' && item.questionType === QUESTION_TYPES.WOULD_YOU_RATHER);
  let optionAVotes = 0;
  let optionBVotes = 0;
  const margins = [];

  for (const report of rounds) {
    const a = report.results.find((row) => row.choice === 'A')?.votes ?? 0;
    const b = report.results.find((row) => row.choice === 'B')?.votes ?? 0;
    optionAVotes += a;
    optionBVotes += b;
    if (a + b) margins.push({
      questionId: report.id,
      question: report.text,
      margin: Math.abs(a - b),
      votes: a + b,
      split: `${Math.round((a / (a + b)) * 100)} / ${Math.round((b / (a + b)) * 100)}`,
    });
  }

  margins.sort((a, b) => a.margin - b.margin || b.votes - a.votes);
  return {
    completedRounds: rounds.length,
    optionAVotes,
    optionBVotes,
    closestRounds: margins.slice(0, 5),
  };
}

export async function handler(event) {
  try {
    requireAdmin(event);
    const supabase = getSupabase();
    await resolveOpenQuestion(supabase, new Date());

    const [settings, peopleResult, questionsResult, votesResult] = await Promise.all([
      getSettings(supabase),
      supabase.from('people').select('id, name, is_active, display_order, created_at').order('display_order', { ascending: true }).order('name', { ascending: true }),
      supabase.from('questions').select('id, question_text, question_type, option_a, option_b, category, tags, status, source, is_active, voting_opens_at, voting_closes_at, closed_at, eligible_voters_count, created_at'),
      supabase.from('votes').select('id, question_id, voter_id, selected_person_id, selected_option, comment_text, comment_hidden, comment_moderated_at, created_at, updated_at'),
    ]);

    if (peopleResult.error) throw peopleResult.error;
    if (questionsResult.error) throw questionsResult.error;
    if (votesResult.error) throw votesResult.error;

    const people = peopleResult.data ?? [];
    const questions = questionsResult.data ?? [];
    const votes = votesResult.data ?? [];
    const reports = buildReports(questions, votes, people);
    const activePeople = people.filter((person) => person.is_active);
    const current = reports.find((report) => report.status === 'open') ?? null;
    const currentVoters = new Set(current?.voterIds ?? []);
    const closedReports = reports.filter((report) => report.status === 'closed');
    const averageTurnout = closedReports.length && activePeople.length
      ? closedReports.reduce((sum, report) => {
        const eligible = report.eligibleVoters || activePeople.length;
        return sum + (eligible ? (report.votesCast / eligible) * 100 : 0);
      }, 0) / closedReports.length
      : 0;

    const peopleById = new Map(people.map((person) => [person.id, person.name]));
    const questionById = new Map(questions.map((question) => [question.id, question]));
    const comments = votes
      .filter((vote) => vote.comment_text)
      .map((vote) => {
        const question = questionById.get(vote.question_id);
        return {
          voteId: vote.id,
          questionId: vote.question_id,
          question: question?.question_text ?? 'Unknown question',
          questionType: question?.question_type ?? QUESTION_TYPES.PEOPLE,
          voter: peopleById.get(vote.voter_id) ?? 'Unknown',
          selectedPerson: choiceLabel(question, vote, peopleById),
          text: vote.comment_text,
          hidden: vote.comment_hidden,
          createdAt: vote.created_at,
          updatedAt: vote.updated_at,
        };
      })
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

    return json(200, {
      ok: true,
      appName: settings.app_name ?? 'Office Verdict',
      defaultRoundMinutes: Number(settings.default_round_minutes) || 60,
      wyrRandomWeight: Number(settings.wyr_random_weight) || 70,
      people,
      questions: reports,
      comments,
      currentRound: current,
      summary: {
        activePeople: activePeople.length,
        bankQuestions: reports.filter((report) => report.status === 'queued').length,
        queuedPeopleQuestions: reports.filter((report) => report.status === 'queued' && report.questionType === QUESTION_TYPES.PEOPLE).length,
        queuedWyrQuestions: reports.filter((report) => report.status === 'queued' && report.questionType === QUESTION_TYPES.WOULD_YOU_RATHER).length,
        completedRounds: closedReports.length,
        totalQuestions: questions.length,
        totalVotes: votes.length,
        totalComments: comments.length,
        currentVotes: current?.votesCast ?? 0,
        averageTurnout: Number(averageTurnout.toFixed(1)),
        currentMissing: current
          ? activePeople.filter((person) => !currentVoters.has(person.id)).map((person) => person.name)
          : [],
      },
      trends: {
        leaderboard: buildLeaderboard(reports, people),
        categories: buildCategoryTrends(reports, activePeople.length),
        wouldYouRather: buildWyrTrends(reports),
        turnout: closedReports
          .slice()
          .sort((a, b) => String(a.closedAt ?? a.createdAt).localeCompare(String(b.closedAt ?? b.createdAt)))
          .map((report) => ({
            questionId: report.id,
            question: report.text,
            questionType: report.questionType,
            closedAt: report.closedAt,
            votes: report.votesCast,
            turnout: (report.eligibleVoters || activePeople.length)
              ? Number(((report.votesCast / (report.eligibleVoters || activePeople.length)) * 100).toFixed(1))
              : 0,
          })),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
