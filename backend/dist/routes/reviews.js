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
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
function parseJsonField(value) {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch (_a) {
        return null;
    }
}
function serializeReport(report) {
    return Object.assign(Object.assign({}, report), { metadata: parseJsonField(report.metadata_json), results: parseJsonField(report.results_json), rawAi: parseJsonField(report.raw_ai_json) });
}
router.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const reports = yield prisma.labReport.findMany({
            where: status ? { status } : undefined,
            orderBy: { createdAt: 'desc' },
            include: {
                test: {
                    include: {
                        lot: true,
                        lab: true,
                        test_type: true,
                    },
                },
                email: true,
                attachment: true,
                moleculeResults: true,
            },
        });
        res.json(reports.map(serializeReport));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
router.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const report = yield prisma.labReport.findUnique({
            where: { id: req.params.id },
            include: {
                test: {
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
                    },
                },
                email: {
                    include: {
                        attachments: true,
                    },
                },
                attachment: true,
                moleculeResults: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        if (!report) {
            return res.status(404).json({ error: 'Review report not found.' });
        }
        res.json(serializeReport(report));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
router.post('/:id/approve', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { notes } = req.body || {};
        const report = yield prisma.labReport.update({
            where: { id: req.params.id },
            data: {
                status: 'APPROVED',
                review_notes: typeof notes === 'string' ? notes : null,
                reviewed_at: new Date(),
            },
            include: {
                test: true,
            },
        });
        if (report.test_id) {
            yield prisma.test.update({
                where: { id: report.test_id },
                data: { status: 'COMPLETED' },
            });
        }
        res.json({ success: true, report });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
exports.default = router;
