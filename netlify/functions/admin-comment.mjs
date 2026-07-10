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
    const voteId = validateUuid(body.voteId, 'Vote');
    const hidden = Boolean(body.hidden);
    const supabase = getSupabase();

    const { error } = await supabase
      .from('votes')
      .update({
        comment_hidden: hidden,
        comment_moderated_at: hidden ? new Date().toISOString() : null,
      })
      .eq('id', voteId);

    if (error) throw error;
    return json(200, {
      ok: true,
      message: hidden ? 'Comment hidden from public results.' : 'Comment restored.',
    });
  } catch (error) {
    return handleError(error);
  }
}
