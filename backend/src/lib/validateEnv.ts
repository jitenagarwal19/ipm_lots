import { serverLog } from './serverLog';

export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.FRONTEND_URL) missing.push('FRONTEND_URL');
  if (process.env.API_REQUIRE_KEY !== 'false' && !process.env.SERVICE_API_KEY) {
    missing.push('SERVICE_API_KEY');
  }

  if (missing.length > 0) {
    const msg = `Missing required environment variables for production: ${missing.join(', ')}`;
    serverLog('FATAL: %s', msg);
    throw new Error(msg);
  }

  if (!process.env.WEBHOOK_SECRET) {
    serverLog('WARN: WEBHOOK_SECRET is not set; external webhooks will return 503 until configured.');
  }
}
