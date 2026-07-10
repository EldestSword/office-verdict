import {
  getSupabase,
  handleError,
  json,
  parseBody,
  requireAdmin,
  validateUuid,
} from './_shared.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    requireAdmin(event);
    const body = parseBody(event);
    const action = String(body.action ?? '');
    const id = validateUuid(body.id, 'Person');
    const supabase = getSupabase();

    if (action === 'toggleActive') {
      const { error } = await supabase
        .from('people')
        .update({ is_active: Boolean(body.active) })
        .eq('id', id);
      if (error) throw error;
      return json(200, { ok: true, message: body.active ? 'Person activated.' : 'Person deactivated.' });
    }

    throw Object.assign(new Error('Unknown person action.'), { statusCode: 400 });
  } catch (error) {
    return handleError(error);
  }
}
