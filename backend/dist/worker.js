"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailWorker = exports.emailQueue = void 0;
require("dotenv/config");
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const client_1 = require("@prisma/client");
const email_1 = require("./services/email");
const prisma = new client_1.PrismaClient();
// Initialize Redis connection for BullMQ
const connection = new ioredis_1.default({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
});
connection.on('error', (err) => {
    console.warn('Redis connection failed, BullMQ workers will not start:', err.message);
});
exports.emailQueue = new bullmq_1.Queue('email-queue', { connection });
// Initialize repeating job for polling
exports.emailQueue.add('poll-incoming-emails', {}, {
    repeat: {
        every: 30000 // Poll every 30 seconds
    },
    jobId: 'recurring-poll-job'
});
exports.emailWorker = new bullmq_1.Worker('email-queue', (job) => __awaiter(void 0, void 0, void 0, function* () {
    if (job.name === 'send-test-email') {
        const { testId, lotNumber, labId } = job.data;
        const lab = yield prisma.lab.findUnique({
            where: { id: labId },
            include: { contacts: true }
        });
        if (!lab)
            throw new Error('Lab not found');
        // 1. Dispatch Email (via Gmail API or Mock)
        const toEmail = lab.contacts && lab.contacts.length > 0 ? lab.contacts[0].email : 'default@example.com';
        const result = yield (0, email_1.sendTestRequestEmail)(testId, lotNumber, lab.name, toEmail);
        // 2. Save Message/Thread ID for Zapier Webhook or manual polling
        yield prisma.test.update({
            where: { id: testId },
            data: { email_thread_id: result.threadId }
        });
    }
}), { connection });
exports.emailWorker.on('completed', (job) => {
    console.log(`[WORKER] Job ${job.id} (${job.name}) has completed successfully!`);
});
exports.emailWorker.on('failed', (job, err) => {
    console.error(`[WORKER] Job ${job === null || job === void 0 ? void 0 : job.id} (${job === null || job === void 0 ? void 0 : job.name}) failed with error: ${err.message}`);
});
