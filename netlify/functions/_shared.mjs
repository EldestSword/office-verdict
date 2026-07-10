import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function json(statusCode, body) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body),
  };
}

export function text(statusCode, body, contentType = 'text/plain; charset=utf-8') {
  return {
    statusCode,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store',
    },
    body,
  };
}

export function parseBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    throw Object.assign(new Error('The request body is not valid JSON.'), { statusCode: 400 });
  }
}

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw Object.assign(new Error('Supabase environment variables have not been configured.'), { statusCode: 503 });
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function londonDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

export async function getSettings(supabase) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_key, setting_value');

  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.setting_key, row.setting_value]));
}

function safeCompare(left, right) {
  const a = Buffer.from(String(left ?? ''));
  const b = Buffer.from(String(right ?? ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function requireAdmin(event) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) {
    throw Object.assign(new Error('The admin password has not been configured.'), { statusCode: 503 });
  }

  const supplied = event.headers?.['x-admin-password']
    ?? event.headers?.['X-Admin-Password']
    ?? '';

  if (!safeCompare(supplied, configured)) {
    throw Object.assign(new Error('The admin password is incorrect.'), { statusCode: 401 });
  }
}

export function handleError(error) {
  console.error(error);
  const statusCode = Number(error?.statusCode) || 500;
  const message = error?.message || 'Something went wrong on the server.';
  return json(statusCode, { ok: false, error: message });
}

export function validateUuid(value, label = 'ID') {
  const clean = String(value ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) {
    throw Object.assign(new Error(`${label} is invalid.`), { statusCode: 400 });
  }
  return clean;
}

export function validateQuestionText(value) {
  const clean = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (clean.length < 5 || clean.length > 240) {
    throw Object.assign(new Error('The question must be between 5 and 240 characters.'), { statusCode: 400 });
  }
  return clean;
}

export function normaliseCategory(value) {
  const clean = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (clean.length > 50) {
    throw Object.assign(new Error('Categories must be 50 characters or fewer.'), { statusCode: 400 });
  }
  return clean || null;
}

export function normaliseTags(value) {
  const tags = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[;,]/);

  return [...new Set(tags
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean)
    .map((tag) => tag.slice(0, 30)))]
    .slice(0, 12);
}

export function normaliseComment(value, maxLength = 280) {
  const clean = String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

  if (clean.length > maxLength) {
    throw Object.assign(new Error(`Comments must be ${maxLength} characters or fewer.`), { statusCode: 400 });
  }
  return clean || null;
}

export function csvEscape(value) {
  let textValue = String(value ?? '');
  if (/^[=+\-@]/.test(textValue)) textValue = `'${textValue}`;
  if (/[",\r\n]/.test(textValue)) {
    return `"${textValue.replaceAll('"', '""')}"`;
  }
  return textValue;
}

export function isRoundClosed(question, now = new Date()) {
  if (!question) return true;
  if (question.status === 'closed' || question.status === 'archived' || question.is_results_revealed) return true;
  if (question.voting_closes_at && new Date(question.voting_closes_at).getTime() <= now.getTime()) return true;
  return false;
}

export async function resolveOpenQuestion(supabase, now = new Date()) {
  const nowIso = now.toISOString();
  let { data: open, error } = await supabase
    .from('questions')
    .select('id, question_text, category, tags, status, voting_opens_at, voting_closes_at, closed_at, eligible_voters_count, is_active, is_results_revealed, created_at')
    .eq('status', 'open')
    .eq('is_active', true)
    .order('voting_opens_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (open && isRoundClosed(open, now)) {
    const closeResult = await supabase
      .from('questions')
      .update({
        status: 'closed',
        closed_at: open.voting_closes_at ?? nowIso,
        is_results_revealed: true,
      })
      .eq('id', open.id);
    if (closeResult.error) throw closeResult.error;
    open = null;
  }

  if (open) return open;

  const dueResult = await supabase
    .from('questions')
    .select('id, question_text, category, tags, status, voting_opens_at, voting_closes_at, closed_at, eligible_voters_count, is_active, is_results_revealed, created_at')
    .eq('status', 'queued')
    .eq('is_active', true)
    .not('voting_opens_at', 'is', null)
    .lte('voting_opens_at', nowIso)
    .order('voting_opens_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (dueResult.error) throw dueResult.error;
  if (!dueResult.data) return null;

  const activePeopleResult = await supabase
    .from('people')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  if (activePeopleResult.error) throw activePeopleResult.error;

  const activateResult = await supabase
    .from('questions')
    .update({
      status: 'open',
      is_results_revealed: false,
      closed_at: null,
      eligible_voters_count: activePeopleResult.count ?? null,
    })
    .eq('id', dueResult.data.id)
    .eq('status', 'queued')
    .select('id, question_text, category, tags, status, voting_opens_at, voting_closes_at, closed_at, eligible_voters_count, is_active, is_results_revealed, created_at')
    .maybeSingle();

  if (activateResult.error?.code === '23505') {
    const retry = await supabase
      .from('questions')
      .select('id, question_text, category, tags, status, voting_opens_at, voting_closes_at, closed_at, eligible_voters_count, is_active, is_results_revealed, created_at')
      .eq('status', 'open')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (retry.error) throw retry.error;
    return retry.data ?? null;
  }
  if (activateResult.error) throw activateResult.error;
  return activateResult.data ?? null;
}

export function buildRankedResults(votes, people) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const counts = new Map();

  for (const vote of votes) {
    counts.set(vote.selected_person_id, (counts.get(vote.selected_person_id) ?? 0) + 1);
  }

  const rows = [...counts.entries()]
    .map(([personId, voteCount]) => ({
      personId,
      name: peopleById.get(personId)?.name ?? 'Unknown',
      votes: voteCount,
    }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

  let previousVotes = null;
  let previousRank = 0;
  return rows.map((row, index) => {
    const rank = previousVotes === row.votes ? previousRank : index + 1;
    previousVotes = row.votes;
    previousRank = rank;
    return { ...row, rank };
  });
}

export function publicComments(votes, people) {
  const peopleById = new Map(people.map((person) => [person.id, person.name]));
  return votes
    .filter((vote) => vote.comment_text && !vote.comment_hidden)
    .map((vote) => ({
      selectedPersonId: vote.selected_person_id,
      selectedPersonName: peopleById.get(vote.selected_person_id) ?? 'Unknown',
      text: vote.comment_text,
    }));
}
