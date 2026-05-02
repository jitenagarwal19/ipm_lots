import type { RequestHandler } from 'express';
import { serverLog } from '../lib/serverLog';

function requiresSecret(): boolean {
  return Boolean(process.env.WEBHOOK_SECRET);
}

export const webhookSecretAuth: RequestHandler = (req, res, next) => {
  if (!requiresSecret()) {
    if (process.env.NODE_ENV === 'production') {
      serverLog('WARN: WEBHOOK_SECRET is not set; webhook endpoints are disabled in production');
      return res.status(503).json({ error: 'Webhooks not configured' });
    }
    return next();
  }

  const expected = process.env.WEBHOOK_SECRET!;
  const auth = req.headers.authorization;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  const headerSecret =
    (req.headers['x-webhook-secret'] as string | undefined)?.trim() ||
    (req.headers['x-zapier-secret'] as string | undefined)?.trim();

  if (bearer === expected || headerSecret === expected) return next();

  return res.status(401).json({ error: 'Invalid webhook credentials' });
};
