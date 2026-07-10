import {
  getSupabase,
  handleError,
  json,
  parseBody,
  requireAdmin,
  validateUuid,
} from './_shared.mjs';

function validateDate(value) {
  const clean = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    throw Object.assign(new Error('Enter a valid date.'), { statusCode: 400 });
  }
  return clean;
}

function validateQuestionText(value) {
  const clean = String(value ?? '').trim();
  if (clean.length < 5 || clean.length > 240) {
    throw Object.assign(new Error('The question must be between 5 and 240 characters.'), { statusCode: 400 });
  }
  return clean;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    requireAdmin(event);
    const body = parseBody(event);
    const action = String(body.action ?? 'save');
    const supabase = getSupabase();

    if (action === 'save') {
      const payload = {
        question_text: validateQuestionText(body.text),
        scheduled_date: validateDate(body.date),
        category: String(body.category ?? '').trim() || null,
        is_active: body.active !== false,
      };

      if (body.id) {
        const id = validateUuid(body.id, 'Question');
        const { error } = await supabase.from('questions').update(payload).eq('id', id);
        if (error) throw error;
        return json(200, { ok: true, message: 'Question updated.' });
      }

      const { error } = await supabase.from('questions').insert(payload);
      if (error?.code === '23505') {
        throw Object.assign(new Error('A question is already scheduled for that date.'), { statusCode: 409 });
      }
      if (error) throw error;
      return json(200, { ok: true, message: 'Question scheduled.' });
    }

    const id = validateUuid(body.id, 'Question');

    if (action === 'delete') {
      const { error } = await supabase.from('questions').delete().eq('id', id);
      if (error) throw error;
      return json(200, { ok: true, message: 'Question deleted.' });
    }

    if (action === 'reveal') {
      const { error } = await supabase
        .from('questions')
        .update({ is_results_revealed: Boolean(body.revealed) })
        .eq('id', id);
      if (error) throw error;
      return json(200, { ok: true, message: body.revealed ? 'Results revealed.' : 'Automatic reveal restored.' });
    }

    if (action === 'clearVotes') {
      const { error } = await supabase.from('votes').delete().eq('question_id', id);
      if (error) throw error;
      return json(200, { ok: true, message: 'Votes cleared.' });
    }

    throw Object.assign(new Error('Unknown question action.'), { statusCode: 400 });
  } catch (error) {
    return handleError(error);
  }
}
