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
    throw new Error('The request body is not valid JSON.');
  }
}

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables have not been configured.');
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

export function hasReachedTime(current, target = '16:00') {
  const [targetHour, targetMinute] = String(target).split(':').map(Number);
  if (!Number.isInteger(targetHour) || !Number.isInteger(targetMinute)) {
    return false;
  }

  return current.hour > targetHour
    || (current.hour === targetHour && current.minute >= targetMinute);
}

export function isQuestionRevealed(question, revealTime, now = new Date()) {
  if (!question) return false;
  if (question.is_results_revealed) return true;

  const london = londonDateParts(now);
  if (question.scheduled_date < london.date) return true;
  if (question.scheduled_date > london.date) return false;

  return hasReachedTime(london, revealTime);
}

export async function getSettings(supabase) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_key, setting_value');

  if (error) throw error;

  return Object.fromEntries((data ?? []).map((row) => [row.setting_key, row.setting_value]));
}

export function normalisePin(pin) {
  const value = String(pin ?? '').trim();
  if (!/^\d{4}$/.test(value)) {
    throw new Error('PINs must contain exactly four digits.');
  }
  return value;
}

export function hashPin(pin) {
  const cleanPin = normalisePin(pin);
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(cleanPin, salt, 32);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPin(pin, storedHash) {
  try {
    const cleanPin = normalisePin(pin);
    const [scheme, saltHex, hashHex] = String(storedHash ?? '').split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(cleanPin, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
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
  const message = statusCode >= 500
    ? (error?.message || 'Something went wrong on the server.')
    : error.message;
  return json(statusCode, { ok: false, error: message });
}

export function validateUuid(value, label = 'ID') {
  const clean = String(value ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) {
    throw Object.assign(new Error(`${label} is invalid.`), { statusCode: 400 });
  }
  return clean;
}

export function generatePin() {
  return String(crypto.randomInt(1000, 10000));
}

export function csvEscape(value) {
  const textValue = String(value ?? '');
  if (/[",\r\n]/.test(textValue)) {
    return `"${textValue.replaceAll('"', '""')}"`;
  }
  return textValue;
}
