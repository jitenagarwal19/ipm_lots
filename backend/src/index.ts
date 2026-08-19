import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { requestIdMiddleware } from './middleware/requestId';
import { serverLog } from './lib/serverLog';
import { UPLOADS_DIR } from './lib/paths';

dotenv.config({ override: true });

serverLog('BOOT IPM backend loading pid=%s cwd=%s', process.pid, process.cwd());

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 4000;
const uploadsPath = UPLOADS_DIR;

app.use(requestIdMiddleware);

// Log every request as soon as it hits Express (confirms the browser actually reached this process).
app.use((req, res, next) => {
  const started = Date.now();
  serverLog(
    `[HTTP][${req.requestId}] → ${req.method} ${req.url} origin=${req.get('origin') || '-'} ip=${req.ip || req.socket.remoteAddress || '-'}`
  );
  res.on('finish', () => {
    serverLog(
      `[HTTP][${req.requestId}] ← ${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`
    );
  });
  next();
});

// Allow browser calls from LAN dev URLs (e.g. http://192.168.x.x:3000). A fixed origin of localhost only
// makes fetch() appear to "hang" or fail silently when you open Next via the network URL.
const corsOrigin =
  process.env.NODE_ENV === 'production'
    ? (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((s) => s.trim())
    : true;

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  })
);
app.use(express.json());

// Routes
import settingsRoutes from './routes/settings';
import testsRoutes from './routes/tests';
import webhooksRoutes from './routes/webhooks';
import emailRoutes from './routes/emails';
import ailogsRoutes from './routes/ailogs';
import reviewRoutes from './routes/reviews';
import lotRoutes from './routes/lots';
import limitRoutes from './routes/limits';
import authRoutes from './routes/auth';
import { loadSession, requireAuth } from './middleware/requireAuth';
import { rateLimit } from './middleware/rateLimit';
import { cookieSecure } from './lib/auth';

// Trust the reverse proxy so req.ip and secure cookies work behind Nginx.
if (process.env.TRUST_PROXY !== 'false') app.set('trust proxy', 1);

// An insecure session cookie in production is a deliberate, temporary UAT
// choice. Say so on every boot so it cannot quietly become permanent.
if (process.env.NODE_ENV === 'production' && !cookieSecure()) {
  serverLog(
    'WARNING: COOKIE_SECURE=false — the session cookie is not marked Secure, so it ' +
    'travels in clear text. Acceptable only for IP-based UAT on a trusted network. ' +
    'Remove COOKIE_SECURE once TLS is in front.'
  );
}

// Resolve the session, then refuse anything that is not explicitly public.
// Registered before every route below, including static uploads — lab reports
// are the evidence behind compliance decisions and are not public files.
app.use(loadSession);
// Per-IP ceiling on the unauthenticated surface. The per-email resend gap and
// attempt limit live in the auth routes; this stops one source working through
// many addresses.
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, max: 60 }), authRoutes);
app.use(requireAuth);

// Serve uploads (authenticated — see above)
app.use('/uploads', express.static(uploadsPath));

app.use('/api/settings', settingsRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/ailogs', ailogsRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/lots', lotRoutes);
app.use('/api/limits', limitRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/** Quick dependency probe — use when debugging “no logs” / silent failures (does not call OpenAI or Gmail). */
app.get('/api/debug/ready', async (req, res) => {
  const tokenPath = path.join(process.cwd(), 'token.json');
  const credPath = path.join(process.cwd(), 'credentials.json');
  let database = false;
  let databaseError: string | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch (e: any) {
    databaseError = e?.message || String(e);
  }
  res.json({
    requestId: req.requestId,
    time: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || null,
    checks: {
      database,
      databaseError,
      gmailCredentialsFile: fs.existsSync(credPath),
      gmailTokenFile: fs.existsSync(tokenPath),
      openaiKeyConfigured: Boolean(process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY),
    },
  });
});

app.listen(port as number, '0.0.0.0', () => {
  serverLog('Listening http://0.0.0.0:%s  health=GET /health  debug=GET /api/debug/ready', port);
  if (!process.stderr.isTTY) {
    serverLog('Tip: stdout/stderr may be fully buffered in this environment. Set BACKEND_LOG_FILE=%s for a guaranteed on-disk trace.', path.join(process.cwd(), 'backend-debug.log'));
  }
});

export { prisma };
