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
import { QUESTION_TYPES } from './_question-types.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const body = parseBody(event);
    const questionId = validateUuid(body.questionId, 'Question');
    const voterId = validateUuid(body.voterId, 'Voter');
    const supabase = getSupabase();
    const settings = await getSettings(supabase);
    const comment = normaliseComment(body.comment, Number(settings.comment_max_length) || 280);

    const [questionResult, voterResult] = await Promise.all([
      supabase
        .from('questions')
        .select('id, question_type, option_a, option_b, status, voting_opens_at, voting_closes_at, is_active, is_results_revealed')
        .eq('id', questionId)
        .maybeSingle(),
      supabase
        .from('people')
        .select('id, name, is_active')
        .eq('id', voterId)
        .maybeSingle(),
    ]);

    if (questionResult.error) throw questionResult.error;
    if (voterResult.error) throw voterResult.error;

    const question = questionResult.data;
    const voter = voterResult.data;
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

    let selectedPersonId = null;
    let selectedOption = null;
    let message = 'Vote recorded.';

    if (question.question_type === QUESTION_TYPES.WOULD_YOU_RATHER) {
      selectedOption = String(body.selectedOption ?? '').toUpperCase();
      if (!['A', 'B'].includes(selectedOption)) {
        throw Object.assign(new Error('Choose one of the two options.'), { statusCode: 400 });
      }
      const label = selectedOption === 'A' ? question.option_a : question.option_b;
      message = `Vote recorded for “${label}”.`;
    } else {
      selectedPersonId = validateUuid(body.selectedPersonId, 'Selected person');
      if (voterId === selectedPersonId) {
        throw Object.assign(new Error('You cannot vote for yourself. Admirable confidence, wrong ballot.'), { statusCode: 400 });
      }
      const selectedResult = await supabase
        .from('people')
        .select('id, name, is_active')
        .eq('id', selectedPersonId)
        .maybeSingle();
      if (selectedResult.error) throw selectedResult.error;
      if (!selectedResult.data || !selectedResult.data.is_active) {
        throw Object.assign(new Error('The selected colleague is not active.'), { statusCode: 400 });
      }
      message = `Vote recorded for ${selectedResult.data.name}.`;
    }

    const { error } = await supabase
      .from('votes')
      .upsert({
        question_id: questionId,
        voter_id: voterId,
        selected_person_id: selectedPersonId,
        selected_option: selectedOption,
        comment_text: comment,
        comment_hidden: false,
        comment_moderated_at: null,
      }, {
        onConflict: 'question_id,voter_id',
      });

    if (error) throw error;
    return json(200, { ok: true, message });
  } catch (error) {
    return handleError(error);
  }
}
