/**
 * Fixed-window rate limiter, in memory.
 *
 * The sign-in flow already limits itself per email — a 60-second resend gap and
 * five wrong guesses before a code dies. This covers what those cannot: one
 * source working through *many* addresses, either to brute-force a code or to
 * use the endpoint as a mail bomb.
 *
 * In memory means the counter resets on restart and is per-process. That is
 * honest for a single-VPS deployment; if the API is ever run as multiple
 * processes, this needs to move to Redis, which the app already runs for BullMQ.
 */

import type { NextFunction, Request, Response } from 'express';
import { clientIp } from '../lib/auth';

type Bucket = { count: number; resetAt: number };

export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  const { windowMs, max } = options;
  const message = options.message || 'Too many requests. Wait a minute and try again.';
  const buckets = new Map<string, Bucket>();

  // Buckets are only dropped when their key is next seen, so sweep periodically
  // or a spray of unique IPs grows the map without bound.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = clientIp(req as any);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count++;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message, retryAfterSeconds: retryAfter });
    }
    return next();
  };
}
