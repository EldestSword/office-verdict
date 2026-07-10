import {
  generatePin,
  getSupabase,
  handleError,
  hashPin,
  json,
  normalisePin,
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
    const supabase = getSupabase();

    if (action === 'generateMissingPins') {
      const { data: people, error } = await supabase
        .from('people')
        .select('id, name, pin_hash')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;

      const generated = [];
      for (const person of people ?? []) {
        if (person.pin_hash) continue;
        const pin = generatePin();
        const update = await supabase
          .from('people')
          .update({ pin_hash: hashPin(pin) })
          .eq('id', person.id);
        if (update.error) throw update.error;
        generated.push({ name: person.name, pin });
      }

      return json(200, {
        ok: true,
        message: generated.length ? `${generated.length} PINs generated.` : 'Everyone already has a PIN.',
        generated,
      });
    }

    const id = validateUuid(body.id, 'Person');

    if (action === 'setPin') {
      const pin = normalisePin(body.pin);
      const { error } = await supabase
        .from('people')
        .update({ pin_hash: hashPin(pin) })
        .eq('id', id);
      if (error) throw error;
      return json(200, { ok: true, message: 'PIN updated.' });
    }

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
