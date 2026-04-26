import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { sendTestRequestEmail } from './services/email';

const prisma = new PrismaClient();

// Initialize Redis connection for BullMQ
const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});

connection.on('error', (err) => {
  console.warn('Redis connection failed, BullMQ workers will not start:', err.message);
});

export const emailQueue = new Queue('email-queue', { connection });

// Initialize repeating job for polling
emailQueue.add('poll-incoming-emails', {}, {
  repeat: {
    every: 30000 // Poll every 30 seconds
  },
  jobId: 'recurring-poll-job'
});

export const emailWorker = new Worker(
  'email-queue',
  async (job) => {
    if (job.name === 'send-test-email') {
      const { testId, lotNumber, labId } = job.data;
      
      const lab = await prisma.lab.findUnique({ where: { id: labId } });
      if (!lab) throw new Error('Lab not found');

      // 1. Dispatch Email (via Gmail API or Mock)
      const threadId = await sendTestRequestEmail(testId, lotNumber, lab.name);
      
      // 2. Save Message/Thread ID for Zapier Webhook or manual polling
      await prisma.test.update({
        where: { id: testId },
        data: { email_thread_id: threadId }
      });
      
    }
  },
  { connection }
);

emailWorker.on('completed', (job) => {
  console.log(`[WORKER] Job ${job.id} (${job.name}) has completed successfully!`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[WORKER] Job ${job?.id} (${job?.name}) failed with error: ${err.message}`);
});
