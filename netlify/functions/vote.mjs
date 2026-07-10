import {
  getSettings,
  getSupabase,
  handleError,
  isQuestionRevealed,
  json,
  londonDateParts,
  parseBody,
  validateUuid,
  verifyPin,
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
    const london = londonDateParts();

    const [settings, questionResult, voterResult, selectedResult] = await Promise.all([
      getSettings(supabase),
      supabase
        .from('questions')
        .select('id, scheduled_date, is_active, is_results_revealed')
        .eq('id', questionId)
        .maybeSingle(),
      supabase
        .from('people')
        .select('id, name, pin_hash, is_active')
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

    if (!question || !question.is_active || question.scheduled_date !== london.date) {
      throw Object.assign(new Error('Today’s question is no longer open.'), { statusCode: 409 });
    }
    if (isQuestionRevealed(question, settings.results_reveal_time ?? '16:00')) {
      throw Object.assign(new Error('Voting has closed and the results are now visible.'), { statusCode: 409 });
    }
    if (!voter || !voter.is_active) {
      throw Object.assign(new Error('The selected voter is not active.'), { statusCode: 400 });
    }
    if (!voter.pin_hash) {
      throw Object.assign(new Error('No PIN has been set for this voter. Ask the administrator to set one.'), { statusCode: 409 });
    }
    if (!verifyPin(body.pin, voter.pin_hash)) {
      throw Object.assign(new Error('That PIN is incorrect.'), { statusCode: 401 });
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
