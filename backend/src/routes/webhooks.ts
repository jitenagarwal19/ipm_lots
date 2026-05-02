import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { webhookSecretAuth } from '../middleware/webhookSecret';
import { serverLog } from '../lib/serverLog';
import { db } from '../lib/db';

const router = Router();

router.use(webhookSecretAuth);

// Zapier Webhook Endpoint for Incoming Lab Reports
// Expected Payload: { test_id, lot_number, from_email, attachment_url, message_id }
router.post('/zapier', async (req, res) => {
  try {
    const { test_id, lot_number, from_email, attachment_url, message_id } = req.body;

    let targetTest;

    // Try to find the exact test if Zapier successfully extracted the ID from the email
    if (test_id) {
      targetTest = await db.prisma.test.findUnique({ where: { id: test_id } });
    }
    
    // Fallback: Find the most recent AWAITING_REPORT test for this lot number
    if (!targetTest && lot_number) {
      const lot = await db.prisma.lot.findUnique({
        where: { lot_number },
        include: {
          tests: {
            where: { status: 'AWAITING_REPORT' },
            orderBy: { createdAt: 'desc' }
          }
        }
      });
      if (lot && lot.tests.length > 0) {
        targetTest = lot.tests[0];
      }
    }

    if (!targetTest) {
      return res.status(404).json({ error: "Could not match incoming report to an active test request." });
    }

    // Save the incoming email and attachment link to the database
    const email = await db.prisma.email.create({
      data: {
        message_id: message_id || `msg-${uuidv4()}`,
        thread_id: targetTest.email_thread_id,
        from_email: from_email || 'unknown@lab.com',
        received_at: new Date(),
        test_id: targetTest.id,
        attachments: {
          create: attachment_url ? [{
            file_url: attachment_url,
            file_type: 'application/pdf'
          }] : []
        }
      }
    });

    // Automatically transition the Test state to REPORT_RECEIVED
    const updatedTest = await db.prisma.test.update({
      where: { id: targetTest.id },
      data: { status: 'REPORT_RECEIVED' }
    });

    serverLog(`[WEBHOOK] Processed incoming Zapier report. Test ${targetTest.id} transitioned to REPORT_RECEIVED.`);
    res.json({ success: true, test: updatedTest });

  } catch (error: any) {
    serverLog('[WEBHOOK] Error processing Zapier payload: %s', error?.message || error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
