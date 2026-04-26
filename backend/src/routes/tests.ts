import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { pollForReplies, sendTestRequestEmail } from '../services/email';

const router = Router();
const prisma = new PrismaClient();

// Get all tests
router.get('/', async (req, res) => {
  const tests = await prisma.test.findMany({
    include: { lot: true, lab: true, test_type: true },
  });
  res.json(tests);
});

// Create Test (and Lot if needed)
router.post('/', async (req, res) => {
  const { lot_number, product_id, variant_id, company_id, lab_id, test_type_id } = req.body;

  try {
    // Upsert the Lot
    let lot = await prisma.lot.findUnique({ where: { lot_number } });
    if (!lot) {
      lot = await prisma.lot.create({
        data: {
          lot_number,
          product_id,
          variant_id: variant_id !== 'none' && variant_id ? variant_id : null,
          company_id,
        },
      });
    }

    // Create Test
    const test = await prisma.test.create({
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
      const updatedTest = await prisma.test.update({
        where: { id: test.id },
        data: { 
          status: 'AWAITING_REPORT',
          email_thread_id: emailResult.threadId
        }
      });

      // Log the sent email
      await prisma.email.create({
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
    const pendingTests = await prisma.test.findMany({
      where: { status: 'AWAITING_REPORT', email_thread_id: { not: null } }
    });
    
    let processedCount = 0;
    for (const test of pendingTests) {
      if (!test.email_thread_id) continue;
      
      const result = await pollForReplies(test.email_thread_id);
      
      if (result.hasReply && result.attachment) {
        await prisma.email.create({
          data: {
            message_id: `msg-${Math.random().toString(36).substring(7)}`,
            thread_id: test.email_thread_id,
            from_email: 'lab-response@mock.com', 
            received_at: result.attachment.receivedAt || new Date(),
            test_id: test.id,
            attachments: {
              create: {
                file_url: result.attachment.url,
                file_type: 'application/pdf'
              }
            }
          }
        });
        
        await prisma.test.update({
          where: { id: test.id },
          data: { status: 'REPORT_RECEIVED' }
        });
        processedCount++;
      }
    }
    
    res.json({ success: true, processedCount, lastFetchTime: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
