import { Router } from 'express';
import { serverLog } from '../lib/serverLog';
import { processEmailLimiter } from '../middleware/rateLimits';
import { db } from '../lib/db';
import { getTrackedEmailsFromGmail, processTrackedEmail } from '../services/email';

const router = Router();

// Process a tracked email
router.post('/process/:messageId', processEmailLimiter, async (req, res) => {
  const rawId = req.params.messageId;
  const messageId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!messageId) {
    return res.status(400).json({ error: 'Missing message id' });
  }
  const startedAt = Date.now();
  const rid = req.requestId;
  serverLog(`[API][${rid}] POST /emails/process/${messageId} handler entered`);
  try {
    const result = await processTrackedEmail(messageId, { requestId: rid });
    serverLog(
      `[API][${rid}] POST /emails/process/${messageId} ok in ${Date.now() - startedAt}ms status=${result.status} reports=${Array.isArray(result.analysis) ? result.analysis.length : 0}`
    );
    res.json({ requestId: rid, ...result });
  } catch (error: any) {
    serverLog(
      `[API][${rid}] POST /emails/process/${messageId} failed after ${Date.now() - startedAt}ms: %s`,
      error?.message || error
    );
    res.status(500).json({ requestId: rid, error: error.message });
  }
});

// Get tracked emails from Gmail
router.get('/tracked', async (req, res) => {
  try {
    const setting = await db.prisma.systemSetting.findUnique({
      where: { key: 'tracked_email_labels' }
    });

    if (!setting || !setting.value) {
      return res.json([]);
    }

    // Split by comma and trim spaces
    const labels = setting.value.split(',').map((l: string) => l.trim()).filter(Boolean);
    
    if (labels.length === 0) {
      return res.json([]);
    }

    const emails = await getTrackedEmailsFromGmail(labels);
    res.json(emails);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all email logs
router.get('/', async (req, res) => {
  try {
    const emails = await db.prisma.email.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        attachments: true,
        test: {
          include: {
            lot: true,
            lab: true
          }
        }
      }
    });
    res.json(emails);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
