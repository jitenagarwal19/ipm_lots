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
const email_1 = require("../services/email");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Get all tests
router.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tests = yield prisma.test.findMany({
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
    }
    catch (error) {
        console.error("Error fetching tests:", error);
        res.status(500).json({ error: error.message });
    }
}));
router.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const test = yield prisma.test.findUnique({
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
    }
    catch (error) {
        console.error("Error fetching test:", error);
        res.status(500).json({ error: error.message });
    }
}));
// Create Test (and Lot if needed)
router.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    const { lot_number, product_id, variant_id, company_id, lab_id, test_type_id } = req.body;
    try {
        // Upsert the Lot
        let lot = yield prisma.lot.findUnique({ where: { lot_number } });
        if (!lot) {
            lot = yield prisma.lot.create({
                data: {
                    lot_number,
                    product_id,
                    variant_id: variant_id !== 'none' && variant_id ? variant_id : null,
                    company_id,
                },
            });
        }
        // Create Test
        const test = yield prisma.test.create({
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
            const labEmail = ((_c = (_b = (_a = test.lab) === null || _a === void 0 ? void 0 : _a.contacts) === null || _b === void 0 ? void 0 : _b.find(c => c.is_primary)) === null || _c === void 0 ? void 0 : _c.email) || ((_f = (_e = (_d = test.lab) === null || _d === void 0 ? void 0 : _d.contacts) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.email);
            if (!labEmail) {
                throw new Error("No email associated with the selected lab. Cannot send test request.");
            }
            // Send the email synchronously
            const emailResult = yield (0, email_1.sendTestRequestEmail)(test.id, lot.lot_number, ((_g = test.lab) === null || _g === void 0 ? void 0 : _g.name) || 'Lab', labEmail);
            // Update status and thread ID
            const updatedTest = yield prisma.test.update({
                where: { id: test.id },
                data: {
                    status: 'AWAITING_REPORT',
                    email_thread_id: emailResult.threadId
                }
            });
            // Log the sent email
            yield prisma.email.create({
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
        }
        catch (emailError) {
            console.error("Failed to send email:", emailError);
            res.status(500).json({ error: "Failed to dispatch email to the lab." });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
// Manually Fetch Emails for pending tests
router.post('/fetch-emails', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const setting = yield prisma.systemSetting.findUnique({
            where: { key: 'tracked_email_labels' }
        });
        if (!(setting === null || setting === void 0 ? void 0 : setting.value)) {
            return res.status(400).json({
                error: "No tracked email labels configured. Add Gmail labels in Settings before fetching emails."
            });
        }
        const labels = setting.value.split(',').map((label) => label.trim()).filter(Boolean);
        if (labels.length === 0) {
            return res.status(400).json({
                error: "No tracked email labels configured. Add Gmail labels in Settings before fetching emails."
            });
        }
        const trackedEmails = yield (0, email_1.getTrackedEmailsFromGmail)(labels);
        let processedCount = 0;
        let mappedCount = 0;
        let skippedCount = 0;
        const errors = [];
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
                const result = yield (0, email_1.processTrackedEmail)(email.id, { requestId: req.requestId });
                processedCount++;
                if ((_a = result.email) === null || _a === void 0 ? void 0 : _a.test_id) {
                    mappedCount++;
                }
            }
            catch (error) {
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
exports.default = router;
