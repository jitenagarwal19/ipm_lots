import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { requestIdMiddleware } from './middleware/requestId';
import { serverLog } from './lib/serverLog';
import { apiKeyAuth } from './middleware/apiKeyAuth';
import { apiLimiter } from './middleware/rateLimits';
import { validateProductionEnv } from './lib/validateEnv';

dotenv.config({ override: true });

validateProductionEnv();

serverLog('BOOT IPM backend loading pid=%s cwd=%s', process.pid, process.cwd());

const app = express();
app.set('trust proxy', 1);

const prisma = new PrismaClient();
const port = process.env.PORT || 4000;
const uploadsPath = path.join(process.cwd(), 'uploads');

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

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

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  const p = req.path || '';
  if (!p.startsWith('/api')) return next();
  if (p.startsWith('/api/webhooks')) return next();
  return apiLimiter(req, res, next);
});

app.use((req, res, next) => {
  const p = req.path || '';
  if (!p.startsWith('/api')) return next();
  if (p.startsWith('/api/webhooks')) return next();
  return apiKeyAuth(req, res, next);
});

// Serve uploads
app.use('/uploads', express.static(uploadsPath));

// Routes
import settingsRoutes from './routes/settings';
import testsRoutes from './routes/tests';
import webhooksRoutes from './routes/webhooks';
import emailRoutes from './routes/emails';
import ailogsRoutes from './routes/ailogs';
import reviewRoutes from './routes/reviews';
import lotRoutes from './routes/lots';

app.use('/api/settings', settingsRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/ailogs', ailogsRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/lots', lotRoutes);

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
