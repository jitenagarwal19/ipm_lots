import type { RequestHandler } from 'express';
import { serverLog } from '../lib/serverLog';

function requiresApiKey(): boolean {
  if (process.env.API_REQUIRE_KEY === 'true') return true;
  if (process.env.API_REQUIRE_KEY === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function allowedWithoutKey(pathname: string): boolean {
  if (pathname.startsWith('/api/webhooks')) return true;
  return false;
}

export const apiKeyAuth: RequestHandler = (req, res, next) => {
  if (!requiresApiKey()) return next();

  const pathname = req.path || '';
  if (!pathname.startsWith('/api')) return next();
  if (allowedWithoutKey(pathname)) return next();

  const expected = process.env.SERVICE_API_KEY;
  if (!expected) {
    serverLog('FATAL: SERVICE_API_KEY is required when API key auth is enabled');
    return res.status(503).json({ error: 'Server misconfigured' });
  }

  const auth = req.headers.authorization;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  const headerKey = (req.headers['x-api-key'] as string | undefined)?.trim();
  if (bearer === expected || headerKey === expected) return next();

  return res.status(401).json({ error: 'Unauthorized' });
};
