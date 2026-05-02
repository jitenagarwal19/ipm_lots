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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const serverLog_1 = require("../lib/serverLog");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const email_1 = require("../services/email");
// Process a tracked email
router.post('/process/:messageId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const messageId = req.params.messageId;
    const startedAt = Date.now();
    const rid = req.requestId;
    (0, serverLog_1.serverLog)(`[API][${rid}] POST /emails/process/${messageId} handler entered`);
    try {
        const result = yield (0, email_1.processTrackedEmail)(messageId, { requestId: rid });
        (0, serverLog_1.serverLog)(`[API][${rid}] POST /emails/process/${messageId} ok in ${Date.now() - startedAt}ms status=${result.status} reports=${Array.isArray(result.analysis) ? result.analysis.length : 0}`);
        res.json(Object.assign({ requestId: rid }, result));
    }
    catch (error) {
        (0, serverLog_1.serverLog)(`[API][${rid}] POST /emails/process/${messageId} failed after ${Date.now() - startedAt}ms: %s`, (error === null || error === void 0 ? void 0 : error.message) || error);
        res.status(500).json({ requestId: rid, error: error.message });
    }
}));
// Get tracked emails from Gmail
router.get('/tracked', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const setting = yield prisma.systemSetting.findUnique({
            where: { key: 'tracked_email_labels' }
        });
        if (!setting || !setting.value) {
            return res.json([]);
        }
        // Split by comma and trim spaces
        const labels = setting.value.split(',').map((l) => l.trim()).filter(Boolean);
        if (labels.length === 0) {
            return res.json([]);
        }
        const emails = yield (0, email_1.getTrackedEmailsFromGmail)(labels);
        res.json(emails);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// Get all email logs
router.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const emails = yield prisma.email.findMany({
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
exports.default = router;
