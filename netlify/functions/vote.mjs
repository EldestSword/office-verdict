import {
  getSettings,
  getSupabase,
  handleError,
  isRoundClosed,
  json,
  normaliseComment,
  parseBody,
  validateUuid,
} from './_shared.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const body = parseBody(event);
    const questionId = validateUuid(body.questionId, 'Question');
    const voterId = validateUuid(body.voterId, 'Voter');
    const selectedPersonId = validateUuid(body.selectedPersonId, 'Selected person');

    if (voterId === selectedPersonId) {
      throw Object.assign(new Error('You cannot vote for yourself. Admirable confidence, wrong ballot.'), { statusCode: 400 });
    }

    const supabase = getSupabase();
    const settings = await getSettings(supabase);
    const comment = normaliseComment(body.comment, Number(settings.comment_max_length) || 280);

    const [questionResult, voterResult, selectedResult] = await Promise.all([
      supabase
        .from('questions')
        .select('id, status, voting_opens_at, voting_closes_at, is_active, is_results_revealed')
        .eq('id', questionId)
        .maybeSingle(),
      supabase
        .from('people')
        .select('id, name, is_active')
        .eq('id', voterId)
        .maybeSingle(),
      supabase
        .from('people')
        .select('id, name, is_active')
        .eq('id', selectedPersonId)
        .maybeSingle(),
    ]);

    if (questionResult.error) throw questionResult.error;
    if (voterResult.error) throw voterResult.error;
    if (selectedResult.error) throw selectedResult.error;

    const question = questionResult.data;
    const voter = voterResult.data;
    const selected = selectedResult.data;
    const now = new Date();

    if (!question || !question.is_active || question.status !== 'open' || isRoundClosed(question, now)) {
      throw Object.assign(new Error('This voting round is no longer open.'), { statusCode: 409 });
    }
    if (question.voting_opens_at && new Date(question.voting_opens_at).getTime() > now.getTime()) {
      throw Object.assign(new Error('This voting round has not opened yet.'), { statusCode: 409 });
    }
    if (!voter || !voter.is_active) {
      throw Object.assign(new Error('The selected voter is not active.'), { statusCode: 400 });
    }
    if (!selected || !selected.is_active) {
      throw Object.assign(new Error('The selected colleague is not active.'), { statusCode: 400 });
    }

    const { error } = await supabase
      .from('votes')
      .upsert({
        question_id: questionId,
        voter_id: voterId,
        selected_person_id: selectedPersonId,
        comment_text: comment,
        comment_hidden: false,
        comment_moderated_at: null,
      }, {
        onConflict: 'question_id,voter_id',
      });

    if (error) throw error;

    return json(200, {
      ok: true,
      message: `Vote recorded for ${selected.name}.`,
    });
  } catch (error) {
    return handleError(error);
  }
}
