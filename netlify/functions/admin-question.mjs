import {
  getSupabase,
  handleError,
  json,
  londonDateParts,
  normaliseCategory,
  normaliseTags,
  parseBody,
  requireAdmin,
  validateQuestionText,
  validateUuid,
} from './_shared.mjs';

function durationToCloseTime(durationMinutes, opensAt = new Date()) {
  if (durationMinutes === null || durationMinutes === '' || durationMinutes === undefined) return null;
  const duration = Number(durationMinutes);
  if (!Number.isInteger(duration) || duration < 5 || duration > 10080) {
    throw Object.assign(new Error('Voting duration must be between 5 minutes and 7 days.'), { statusCode: 400 });
  }
  return new Date(opensAt.getTime() + duration * 60_000).toISOString();
}

function validateIsoDate(value, label) {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error(`${label} is not a valid date and time.`), { statusCode: 400 });
  }
  return date;
}

async function closeOpenRounds(supabase, nowIso) {
  const result = await supabase
    .from('questions')
    .update({
      status: 'closed',
      closed_at: nowIso,
      is_results_revealed: true,
    })
    .eq('status', 'open');
  if (result.error) throw result.error;
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
        category: normaliseCategory(body.category),
        tags: normaliseTags(body.tags),
        is_active: body.active !== false,
      };

      if (body.id) {
        const id = validateUuid(body.id, 'Question');
        const { error } = await supabase.from('questions').update(payload).eq('id', id);
        if (error) throw error;
        return json(200, { ok: true, message: 'Question updated.' });
      }

      const { error } = await supabase.from('questions').insert({
        ...payload,
        status: 'queued',
        source: 'manual',
      });
      if (error) throw error;
      return json(200, { ok: true, message: 'Question added to the bank.' });
    }

    if (action === 'bulkImport') {
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) {
        throw Object.assign(new Error('No questions were supplied.'), { statusCode: 400 });
      }
      if (items.length > 1000) {
        throw Object.assign(new Error('Import up to 1,000 questions at a time.'), { statusCode: 400 });
      }

      const existingResult = await supabase.from('questions').select('question_text');
      if (existingResult.error) throw existingResult.error;
      const seen = new Set((existingResult.data ?? []).map((row) => row.question_text.trim().toLowerCase()));
      const rows = [];
      let skipped = 0;

      for (const item of items) {
        const text = validateQuestionText(item.text);
        const key = text.toLowerCase();
        if (seen.has(key)) {
          skipped += 1;
          continue;
        }
        seen.add(key);
        rows.push({
          question_text: text,
          category: normaliseCategory(item.category),
          tags: normaliseTags(item.tags),
          status: 'queued',
          source: 'bulk',
          is_active: true,
        });
      }

      for (let index = 0; index < rows.length; index += 200) {
        const { error } = await supabase.from('questions').insert(rows.slice(index, index + 200));
        if (error) throw error;
      }

      return json(200, {
        ok: true,
        message: `${rows.length} questions imported${skipped ? `; ${skipped} duplicates skipped` : ''}.`,
        imported: rows.length,
        skipped,
      });
    }

    const id = validateUuid(body.id, 'Question');

    if (action === 'launch') {
      const now = new Date();
      const nowIso = now.toISOString();
      const closesAt = durationToCloseTime(body.durationMinutes, now);
      await closeOpenRounds(supabase, nowIso);
      const activePeopleResult = await supabase
        .from('people')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);
      if (activePeopleResult.error) throw activePeopleResult.error;

      const { data, error } = await supabase
        .from('questions')
        .update({
          status: 'open',
          scheduled_date: londonDateParts(now).date,
          voting_opens_at: nowIso,
          voting_closes_at: closesAt,
          results_reveal_at: closesAt,
          closed_at: null,
          is_results_revealed: false,
          is_active: true,
          eligible_voters_count: activePeopleResult.count ?? null,
        })
        .eq('id', id)
        .select('question_text')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw Object.assign(new Error('Question not found.'), { statusCode: 404 });
      return json(200, { ok: true, message: 'Voting round launched.' });
    }

    if (action === 'schedule') {
      const opensAt = validateIsoDate(body.opensAt, 'Opening time');
      const closesAt = durationToCloseTime(body.durationMinutes, opensAt);
      const { error } = await supabase
        .from('questions')
        .update({
          status: 'queued',
          voting_opens_at: opensAt.toISOString(),
          voting_closes_at: closesAt,
          results_reveal_at: closesAt,
          scheduled_date: londonDateParts(opensAt).date,
          closed_at: null,
          is_results_revealed: false,
          is_active: true,
        })
        .eq('id', id);
      if (error) throw error;
      return json(200, { ok: true, message: 'Question scheduled.' });
    }

    if (action === 'close') {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('questions')
        .update({ status: 'closed', closed_at: nowIso, is_results_revealed: true })
        .eq('id', id);
      if (error) throw error;
      return json(200, { ok: true, message: 'Voting closed and results revealed.' });
    }

    if (action === 'duplicate') {
      const sourceResult = await supabase
        .from('questions')
        .select('question_text, category, tags')
        .eq('id', id)
        .maybeSingle();
      if (sourceResult.error) throw sourceResult.error;
      if (!sourceResult.data) throw Object.assign(new Error('Question not found.'), { statusCode: 404 });
      const { error } = await supabase.from('questions').insert({
        question_text: sourceResult.data.question_text,
        category: sourceResult.data.category,
        tags: sourceResult.data.tags ?? [],
        status: 'queued',
        source: 'reused',
        is_active: true,
      });
      if (error) throw error;
      return json(200, { ok: true, message: 'A fresh copy was added to the question bank.' });
    }

    if (action === 'restore') {
      const { error } = await supabase
        .from('questions')
        .update({ status: 'queued', is_active: true })
        .eq('id', id);
      if (error) throw error;
      return json(200, { ok: true, message: 'Question restored to the bank.' });
    }

    if (action === 'archive') {
      const { error } = await supabase
        .from('questions')
        .update({ status: 'archived', is_active: false })
        .eq('id', id);
      if (error) throw error;
      return json(200, { ok: true, message: 'Question archived.' });
    }

    if (action === 'delete') {
      const { error } = await supabase.from('questions').delete().eq('id', id);
      if (error) throw error;
      return json(200, { ok: true, message: 'Question deleted.' });
    }

    if (action === 'clearVotes') {
      const { error } = await supabase.from('votes').delete().eq('question_id', id);
      if (error) throw error;
      return json(200, { ok: true, message: 'Votes and comments cleared.' });
    }

    throw Object.assign(new Error('Unknown question action.'), { statusCode: 400 });
  } catch (error) {
    return handleError(error);
  }
}
