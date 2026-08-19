/**
 * Email one-time-code authentication.
 *
 * Mirrors the Phyto Trade dashboard: an allowlisted work email receives a
 * 6-digit code, valid briefly, with a resend gap and an attempt ceiling. No
 * passwords to leak, reset, or share, and access is revoked by editing one
 * env var.
 *
 * Two rules make a 6-digit secret defensible:
 *   - the code is only ever stored as a scrypt hash, and
 *   - AUTH_MAX_ATTEMPTS wrong guesses kill the code, not just the request.
 * Without the second, a million guesses beats six digits every time.
 *
 * Session tokens are 256-bit random values stored as SHA-256. A database leak
 * therefore yields nothing replayable. Tokens are high-entropy so a fast hash
 * is correct here; the login *code* is low-entropy and gets the slow one.
 */

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

export const CODE_TTL_MS = Number(process.env.AUTH_CODE_TTL_SECONDS || 600) * 1000;
export const RESEND_GAP_MS = Number(process.env.AUTH_RESEND_GAP_SECONDS || 60) * 1000;
export const MAX_ATTEMPTS = Number(process.env.AUTH_MAX_ATTEMPTS || 5);
export const SESSION_TTL_MS =
  Number(process.env.AUTH_SESSION_DAYS || 30) * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = 'ipm_session';

/**
 * Who may sign in. Comma-separated in AUTH_ALLOWED_EMAILS; defaults to the same
 * addresses the Phyto dashboard trusts.
 *
 * An allowlist rather than open registration is deliberate — this system holds
 * compliance data, and "anyone who can receive mail at a domain" is not the
 * same set as "people who may change an MRL".
 */
export function allowedEmails(): Set<string> {
  const raw =
    process.env.AUTH_ALLOWED_EMAILS ||
    'spices@sumanexport.in,connect@sumanexport.in,export@sumanexport.in';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAllowedEmail(email: string): boolean {
  return allowedEmails().has(normalizeEmail(email));
}

export function normalizeEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase();
}

/** Rejects the obvious nonsense; the allowlist does the real work. */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** A 6-digit code from a CSPRNG. Never Math.random for a credential. */
export function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function hashCode(code: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(code, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

/** Constant-time comparison — a timing side channel would leak the code digit by digit. */
export async function verifyCode(code: string, stored: string): Promise<boolean> {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(code, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Cookie options.
 *
 * `secure` comes from cookieSecure() below — see the warning there before
 * turning it off.
 *
 * SameSite=Lax is safe because the browser talks to the API on its own origin —
 * Next rewrites /api to the backend in development, Nginx does it in production.
 * Serving the API on a different origin would force SameSite=None, which needs
 * HTTPS and re-opens CSRF.
 */
export function sessionCookieOptions(maxAgeMs: number = SESSION_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: cookieSecure(),
    path: '/',
    maxAge: maxAgeMs,
  };
}

/**
 * Whether to mark the session cookie Secure.
 *
 * Defaults to on in production, which is right the moment there is a
 * certificate. It is separately overridable because a Secure cookie is silently
 * discarded over plain http — so a production build reached by raw IP would
 * accept the sign-in code, set a cookie the browser throws away, and bounce the
 * user back to /login with no error anywhere. That failure is invisible and
 * costs an afternoon to find.
 *
 * COOKIE_SECURE=false is therefore allowed, and logged loudly, for IP-based UAT
 * only. Set it back to true (or remove it) the moment TLS is in front.
 */
export function cookieSecure(): boolean {
  const override = process.env.COOKIE_SECURE;
  if (override === 'false') return false;
  if (override === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

/** Client IP, preferring the proxy headers Nginx and Cloudflare set. */
export function clientIp(req: {
  headers: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string };
}): string {
  const header = (name: string) => {
    const v = req.headers[name];
    return typeof v === 'string' ? v.split(',')[0].trim() : '';
  };
  return (
    header('cf-connecting-ip') ||
    header('x-forwarded-for') ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}
