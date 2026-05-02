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
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Zapier Webhook Endpoint for Incoming Lab Reports
// Expected Payload: { test_id, lot_number, from_email, attachment_url, message_id }
router.post('/zapier', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { test_id, lot_number, from_email, attachment_url, message_id } = req.body;
        let targetTest;
        // Try to find the exact test if Zapier successfully extracted the ID from the email
        if (test_id) {
            targetTest = yield prisma.test.findUnique({ where: { id: test_id } });
        }
        // Fallback: Find the most recent AWAITING_REPORT test for this lot number
        if (!targetTest && lot_number) {
            const lot = yield prisma.lot.findUnique({
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
        const email = yield prisma.email.create({
            data: {
                message_id: message_id || `msg-${(0, uuid_1.v4)()}`,
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
        const updatedTest = yield prisma.test.update({
            where: { id: targetTest.id },
            data: { status: 'REPORT_RECEIVED' }
        });
        console.log(`[WEBHOOK] Processed incoming Zapier report. Test ${targetTest.id} transitioned to REPORT_RECEIVED.`);
        res.json({ success: true, test: updatedTest });
    }
    catch (error) {
        console.error("[WEBHOOK] Error processing Zapier payload:", error);
        res.status(500).json({ error: error.message });
    }
}));
exports.default = router;
