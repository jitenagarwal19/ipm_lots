/**
 * Session gate for the API.
 *
 * Default-deny: every route is protected unless its path is listed in
 * PUBLIC_PATHS below. An allowlist of *open* routes fails safe — a new route
 * added tomorrow is protected by default. A denylist would leave it open, and
 * nobody would notice until it mattered.
 *
 * Two layers run over each request:
 *   loadSession  — resolves the cookie to an email, never rejects
 *   requireAuth  — rejects when no session was resolved
 * Splitting them lets /api/auth/me answer "not signed in" with a clean 401
 * rather than being blocked before it can look.
 */

import type { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { SESSION_COOKIE, hashSessionToken, isAllowedEmail } from '../lib/auth';

const prisma = new PrismaClient();

/** Paths reachable without a session, matched against the full URL path. */
const PUBLIC_PATHS = new Set([
  '/health',
  '/api/auth/request-code',
  '/api/auth/verify',
  '/api/auth/logout',
  '/api/auth/me',
]);

/**
 * Webhooks authenticate with their own shared secret, not a browser session.
 * They stay outside the cookie gate but must not be left unauthenticated —
 * see webhookSecret middleware.
 */
const PUBLIC_PREFIXES = ['/api/webhooks/'];

export function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.has(path)) return true;
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Read one cookie without pulling in cookie-parser. */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authEmail?: string;
      sessionToken?: string;
    }
  }
}

export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (!token) return next();
    req.sessionToken = token;

    const session = await prisma.session.findUnique({
      where: { token_hash: hashSessionToken(token) },
    });
    if (!session || session.revoked_at || session.expires_at.getTime() < Date.now()) {
      return next();
    }

    // Revoking access means editing AUTH_ALLOWED_EMAILS. That has to take effect
    // on the next request, not whenever a 30-day session happens to expire.
    if (!isAllowedEmail(session.email)) return next();

    req.authEmail = session.email;

    // Cheap last-seen tracking, at most once an hour per session.
    if (Date.now() - session.last_seen.getTime() > 3_600_000) {
      void prisma.session
        .update({ where: { id: session.id }, data: { last_seen: new Date() } })
        .catch(() => undefined);
    }
  } catch {
    // A database hiccup must not authenticate anybody.
  }
  return next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isPublicPath(req.path)) return next();
  if (req.authEmail) return next();
  return res.status(401).json({ error: 'Not signed in.' });
}
