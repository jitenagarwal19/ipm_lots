import { Router } from 'express';
import { getTrackedEmailsFromGmail, processTrackedEmail, sendTestRequestEmail } from '../services/email';
import { db } from '../lib/db';

const router = Router();

// Get all tests
router.get('/', async (req, res) => {
  try {
    const tests = await db.prisma.test.findMany({
      include: {
        lot: true,
        lab: true,
        test_type: true,
        labReports: {
          where: { status: 'PENDING_REVIEW' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    res.json(tests);
  } catch (error: any) {
    console.error("Error fetching tests:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const test = await db.prisma.test.findUnique({
      where: { id: req.params.id },
      include: {
        lot: {
          include: {
            product: true,
            variant: true,
            company: true,
          },
        },
        lab: true,
        test_type: true,
        emails: {
          orderBy: { received_at: 'desc' },
          include: {
            attachments: true,
          },
        },
        labReports: {
          orderBy: { createdAt: 'desc' },
          include: {
            attachment: true,
            moleculeResults: true,
          },
        },
      },
    });

    if (!test) {
      return res.status(404).json({ error: 'Test not found.' });
    }

    res.json(test);
  } catch (error: any) {
    console.error("Error fetching test:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create Test (and Lot if needed)
router.post('/', async (req, res) => {
  const { lot_number, product_id, variant_id, company_id, lab_id, test_type_id } = req.body;

  try {
    // Upsert the Lot
    let lot = await db.prisma.lot.findUnique({ where: { lot_number } });
    if (!lot) {
      lot = await db.prisma.lot.create({
        data: {
          lot_number,
          product_id,
          variant_id: variant_id !== 'none' && variant_id ? variant_id : null,
          company_id,
        },
      });
    }

    // Create Test
    const test = await db.prisma.test.create({
      data: {
        lot_id: lot.id,
        lab_id,
        test_type_id,
        status: 'INITIATED',
      },
      include: {
        lot: true,
        lab: { include: { contacts: true } },
        test_type: true
      }
    });

    try {
      const labEmail = test.lab?.contacts?.find(c => c.is_primary)?.email || test.lab?.contacts?.[0]?.email;
      if (!labEmail) {
        throw new Error("No email associated with the selected lab. Cannot send test request.");
      }

      // Send the email synchronously
      const emailResult = await sendTestRequestEmail(
        test.id, 
        lot.lot_number, 
        test.lab?.name || 'Lab',
        labEmail
      );
      
      // Update status and thread ID
      const updatedTest = await db.prisma.test.update({
        where: { id: test.id },
        data: { 
          status: 'AWAITING_REPORT',
          email_thread_id: emailResult.threadId
        }
      });

      // Log the sent email
      await db.prisma.email.create({
        data: {
          message_id: emailResult.messageId,
          thread_id: emailResult.threadId,
          from_email: emailResult.fromEmail,
          to_email: emailResult.toEmail,
          direction: 'SENT',
          received_at: new Date(),
          test_id: test.id,
          subject: emailResult.subject
        }
      });

      res.json(updatedTest);
    } catch (emailError) {
      console.error("Failed to send email:", emailError);
      res.status(500).json({ error: "Failed to dispatch email to the lab." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Manually Fetch Emails for pending tests
router.post('/fetch-emails', async (req, res) => {
  try {
    const setting = await db.prisma.systemSetting.findUnique({
      where: { key: 'tracked_email_labels' }
    });

    if (!setting?.value) {
      return res.status(400).json({
        error: "No tracked email labels configured. Add Gmail labels in Settings before fetching emails."
      });
    }

    const labels = setting.value.split(',').map((label: string) => label.trim()).filter(Boolean);
    if (labels.length === 0) {
      return res.status(400).json({
        error: "No tracked email labels configured. Add Gmail labels in Settings before fetching emails."
      });
    }

    const trackedEmails = await getTrackedEmailsFromGmail(labels);
    let processedCount = 0;
    let mappedCount = 0;
    let skippedCount = 0;
    const errors: { messageId: string; error: string }[] = [];

    for (const email of trackedEmails) {
      if (email.isProcessed) {
        skippedCount++;
        continue;
      }

      if (!email.attachments || email.attachments.length === 0) {
        skippedCount++;
        continue;
      }

      try {
        const result = await processTrackedEmail(email.id, { requestId: req.requestId });
        processedCount++;
        if (result.email?.test_id) {
          mappedCount++;
        }
      } catch (error: any) {
        errors.push({
          messageId: email.id,
          error: error.message || "Unknown error"
        });
      }
    }
    
    res.json({
      success: errors.length === 0,
      processedCount,
      mappedCount,
      skippedCount,
      errorCount: errors.length,
      errors,
      lastFetchTime: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
