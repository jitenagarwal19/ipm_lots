/**
 * Sign-in endpoints.
 *
 *   POST /api/auth/request-code   { email }         → always 200
 *   POST /api/auth/verify         { email, code }   → sets the session cookie
 *   GET  /api/auth/me                               → { email } or 401
 *   POST /api/auth/logout                           → clears the session
 *
 * `request-code` answers identically whether or not the address is allowed.
 * Saying "unknown email" would turn this endpoint into a directory of who works
 * here, and the honest-looking error buys the user nothing they cannot get by
 * asking a colleague.
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_GAP_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clientIp,
  generateCode,
  generateSessionToken,
  hashCode,
  hashSessionToken,
  isAllowedEmail,
  looksLikeEmail,
  normalizeEmail,
  sessionCookieOptions,
  verifyCode,
} from '../lib/auth';
import { sendSystemEmail } from '../services/email';
import { serverLog } from '../lib/serverLog';

const router = Router();
const prisma = new PrismaClient();

/** Where sign-in notices go. Empty disables them. */
const NOTIFY_EMAIL = process.env.AUTH_NOTIFY_EMAIL ?? 'spices@sumanexport.in';

function codeEmailHtml(code: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;color:#171614">
      <p>Your one-time sign-in code for the <b>IPM Traceability</b> dashboard is:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:.3em;margin:20px 0">${code}</p>
      <p>It is valid for ${Math.round(CODE_TTL_MS / 60000)} minutes and can be used once.</p>
      <p style="color:#6b6a66;font-size:13px">If you did not ask to sign in, you can ignore this email —
      nobody can use this code without access to your inbox.</p>
    </div>`;
}

function notifySignIn(email: string, ip: string, userAgent: string) {
  if (!NOTIFY_EMAIL) return;
  const when = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' });
  // Deliberately not awaited: a slow or failing mail send must not delay or
  // fail a sign-in that has already been authenticated.
  void sendSystemEmail(
    NOTIFY_EMAIL,
    'IPM dashboard sign-in',
    `<div style="font-family:system-ui,sans-serif;font-size:14px">
       <p><b>${email}</b> signed in to the IPM Traceability dashboard.</p>
       <p>Time: ${when} IST<br>IP: ${ip}<br>Device: ${userAgent || 'unknown'}</p>
     </div>`
  ).catch(() => undefined);
}

router.post('/request-code', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!looksLikeEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }

    const existing = await prisma.loginCode.findUnique({ where: { email } });
    const withinResendGap =
      existing && Date.now() - existing.sent_at.getTime() < RESEND_GAP_MS;

    if (isAllowedEmail(email) && !withinResendGap) {
      const code = generateCode();
      await prisma.loginCode.upsert({
        where: { email },
        update: {
          code_hash: await hashCode(code),
          expires_at: new Date(Date.now() + CODE_TTL_MS),
          attempts: 0,
          sent_at: new Date(),
        },
        create: {
          email,
          code_hash: await hashCode(code),
          expires_at: new Date(Date.now() + CODE_TTL_MS),
          sent_at: new Date(),
        },
      });

      const sent = await sendSystemEmail(email, 'Your IPM dashboard code', codeEmailHtml(code));
      if (!sent) {
        // First-run escape hatch: without this, a Gmail misconfiguration locks
        // everyone out with no way back in. Server logs are already privileged.
        serverLog('[AUTH] Gmail unavailable — sign-in code for %s is %s', email, code);
      }
    }

    // Same answer either way. See the module comment.
    res.json({
      ok: true,
      message: `If ${email} is authorized, a sign-in code is on its way.`,
      resendInSeconds: Math.round(RESEND_GAP_MS / 1000),
    });
  } catch (error: any) {
    serverLog('[AUTH] request-code failed:', error);
    res.status(500).json({ error: 'Could not send a sign-in code. Try again shortly.' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code ?? '').trim();
    const wrong = { error: 'Wrong or expired code — check the email, or request a new code.' };

    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json(wrong);

    const record = await prisma.loginCode.findUnique({ where: { email } });
    if (!record) return res.status(400).json(wrong);

    if (record.expires_at.getTime() < Date.now() || record.attempts >= MAX_ATTEMPTS) {
      await prisma.loginCode.delete({ where: { email } }).catch(() => undefined);
      return res.status(400).json(wrong);
    }

    if (!(await verifyCode(code, record.code_hash))) {
      // Count the failure before answering, so parallel guesses cannot outrun it.
      await prisma.loginCode.update({ where: { email }, data: { attempts: { increment: 1 } } });
      return res.status(400).json(wrong);
    }

    // Single-use: consume the code the moment it succeeds.
    await prisma.loginCode.delete({ where: { email } });

    // Re-check the allowlist at verify time. Someone removed from
    // AUTH_ALLOWED_EMAILS while holding a valid code must not get in.
    if (!isAllowedEmail(email)) return res.status(403).json({ error: 'This account is not authorized.' });

    const token = generateSessionToken();
    const ip = clientIp(req as any);
    const userAgent = String(req.headers['user-agent'] ?? '').slice(0, 255);

    await prisma.session.create({
      data: {
        token_hash: hashSessionToken(token),
        email,
        expires_at: new Date(Date.now() + SESSION_TTL_MS),
        ip,
        user_agent: userAgent,
      },
    });

    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    notifySignIn(email, ip, userAgent);
    res.json({ ok: true, email });
  } catch (error: any) {
    serverLog('[AUTH] verify failed:', error);
    res.status(500).json({ error: 'Could not complete sign-in. Try again shortly.' });
  }
});

router.get('/me', (req, res) => {
  const email = (req as any).authEmail;
  if (!email) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ email });
});

router.post('/logout', async (req, res) => {
  try {
    const token = (req as any).sessionToken as string | undefined;
    if (token) {
      await prisma.session.updateMany({
        where: { token_hash: hashSessionToken(token), revoked_at: null },
        data: { revoked_at: new Date() },
      });
    }
  } catch (error) {
    serverLog('[AUTH] logout cleanup failed:', error);
  }
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(0), maxAge: undefined });
  res.json({ ok: true });
});

export default router;
