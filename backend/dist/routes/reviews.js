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
const compliance_1 = require("../services/compliance");
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
                email: true,
                attachment: true,
                moleculeResults: true,
                complianceChecks: {
                    include: { standard: true },
                    orderBy: { checked_at: 'desc' },
                },
            },
        });
        // Unmapped reports have no Test (and therefore no Lot relation), but the
        // AI-extracted `lot_number` may still match a Lot row in the DB. Look it
        // up so the Mapping UI can show product/company/variant.
        const unmappedLotNumbers = Array.from(new Set(reports
            .filter(r => !r.test_id && r.lot_number)
            .map(r => r.lot_number)));
        const lotMatches = unmappedLotNumbers.length
            ? yield prisma.lot.findMany({
                where: { lot_number: { in: unmappedLotNumbers } },
                include: { product: true, variant: true, company: true },
            })
            : [];
        const lotMatchByNumber = new Map(lotMatches.map(lot => [lot.lot_number, lot]));
        const enriched = reports.map(report => {
            var _a;
            return (Object.assign(Object.assign({}, serializeReport(report)), { lotMatch: !report.test_id && report.lot_number
                    ? (_a = lotMatchByNumber.get(report.lot_number)) !== null && _a !== void 0 ? _a : null
                    : null }));
        });
        res.json(enriched);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
const EDITABLE_REPORT_STATUSES = new Set(['PENDING_REVIEW', 'UNMAPPED']);
router.patch('/:id/molecules/:moleculeId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const reportId = req.params.id;
        const moleculeId = req.params.moleculeId;
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const report = yield prisma.labReport.findUnique({
            where: { id: reportId },
            select: { id: true, status: true },
        });
        if (!report) {
            return res.status(404).json({ error: 'Review report not found.' });
        }
        if (!EDITABLE_REPORT_STATUSES.has(report.status)) {
            return res.status(409).json({
                error: `Molecule edits are not allowed while the report is in status "${report.status}".`,
            });
        }
        const existing = yield prisma.moleculeResult.findFirst({
            where: { id: moleculeId, lab_report_id: reportId },
        });
        if (!existing) {
            return res.status(404).json({ error: 'Molecule row not found for this report.' });
        }
        const data = {};
        if ('molecule_name' in body) {
            const v = body.molecule_name;
            if (typeof v !== 'string' || !v.trim()) {
                return res.status(400).json({ error: 'molecule_name must be a non-empty string when provided.' });
            }
            data.molecule_name = v.trim();
        }
        const optionalStringKeys = [
            'cas_number',
            'result',
            'unit',
            'reporting_limit',
            'method_detection_limit',
            'specification_limit',
            'method',
            'status',
            'notes',
        ];
        for (const key of optionalStringKeys) {
            if (key in body) {
                const v = body[key];
                if (v === null || v === undefined) {
                    data[key] = null;
                }
                else if (typeof v === 'string') {
                    const t = v.trim();
                    data[key] = t.length ? t : null;
                }
                else {
                    return res.status(400).json({ error: `Invalid type for ${key}.` });
                }
            }
        }
        if ('numeric_result' in body) {
            const v = body.numeric_result;
            if (v === null || v === undefined || v === '') {
                data.numeric_result = null;
            }
            else if (typeof v === 'number' && Number.isFinite(v)) {
                data.numeric_result = v;
            }
            else if (typeof v === 'string') {
                const t = v.trim();
                if (!t.length) {
                    data.numeric_result = null;
                }
                else {
                    const n = Number(t);
                    if (!Number.isFinite(n)) {
                        return res.status(400).json({ error: 'numeric_result must be a finite number or empty.' });
                    }
                    data.numeric_result = n;
                }
            }
            else {
                return res.status(400).json({ error: 'Invalid numeric_result.' });
            }
        }
        const boolOrNull = (val, field) => {
            if (val === null || val === undefined || val === '')
                return null;
            if (typeof val === 'boolean')
                return val;
            if (val === 'true')
                return true;
            if (val === 'false')
                return false;
            throw new Error(field);
        };
        try {
            if ('is_detected' in body) {
                data.is_detected = boolOrNull(body.is_detected, 'is_detected');
            }
            if ('is_compliant' in body) {
                data.is_compliant = boolOrNull(body.is_compliant, 'is_compliant');
            }
        }
        catch (_a) {
            return res.status(400).json({ error: 'is_detected and is_compliant must be boolean, null, or "true"/"false".' });
        }
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update.' });
        }
        const updated = yield prisma.moleculeResult.update({
            where: { id: moleculeId },
            data,
        });
        res.json(updated);
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
                complianceChecks: {
                    include: {
                        standard: true,
                        moleculeResults: {
                            include: {
                                moleculeResult: true,
                                molecule: true,
                            },
                        },
                    },
                    orderBy: { checked_at: 'desc' },
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
router.post('/:id/complete-review', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { notes } = req.body || {};
        const report = yield prisma.labReport.findUnique({
            where: { id: req.params.id },
            include: { test: true },
        });
        if (!report) {
            return res.status(404).json({ error: 'Review report not found.' });
        }
        if (!report.test_id) {
            return res.status(409).json({ error: 'Map this report to a test before completing molecule review.' });
        }
        if (!['PENDING_REVIEW', 'COMPLIANCE_PENDING'].includes(report.status)) {
            return res.status(409).json({
                error: `Report is in status "${report.status}" and cannot be moved to compliance review.`,
            });
        }
        const [updatedReport, updatedTest] = yield prisma.$transaction([
            prisma.labReport.update({
                where: { id: report.id },
                data: {
                    status: 'COMPLIANCE_PENDING',
                    review_notes: typeof notes === 'string' ? notes : report.review_notes,
                    reviewed_at: new Date(),
                },
            }),
            prisma.test.update({
                where: { id: report.test_id },
                data: { status: 'COMPLIANCE_PENDING' },
            }),
        ]);
        res.json({ success: true, report: updatedReport, test: updatedTest });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
router.get('/:id/compliance/:standardId/preview', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const preview = yield (0, compliance_1.buildCompliancePreview)(prisma, req.params.id, req.params.standardId);
        res.json(preview);
    }
    catch (error) {
        const status = /not found/i.test(error.message) ? 404 : 500;
        res.status(status).json({ error: error.message });
    }
}));
router.post('/:id/compliance/:standardId/agree', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { notes } = req.body || {};
        const report = yield prisma.labReport.findUnique({
            where: { id: req.params.id },
            include: { test: true },
        });
        if (!report) {
            return res.status(404).json({ error: 'Review report not found.' });
        }
        if (!report.test_id) {
            return res.status(409).json({ error: 'Map this report to a test before recording compliance.' });
        }
        if (!['COMPLIANCE_PENDING', 'APPROVED'].includes(report.status)) {
            return res.status(409).json({
                error: `Complete molecule review before recording compliance. Current status: "${report.status}".`,
            });
        }
        const check = yield (0, compliance_1.recordComplianceAgreement)(prisma, req.params.id, req.params.standardId, typeof notes === 'string' && notes.trim() ? notes.trim() : null);
        yield prisma.test.update({
            where: { id: report.test_id },
            data: { status: 'COMPLETED' },
        });
        res.json({ success: true, check });
    }
    catch (error) {
        const status = /not found/i.test(error.message) ? 404 : 500;
        res.status(status).json({ error: error.message });
    }
}));
router.post('/:id/map-to-test', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { testId } = req.body || {};
        if (typeof testId !== 'string' || testId.trim().length === 0) {
            return res.status(400).json({ error: 'testId is required.' });
        }
        const report = yield prisma.labReport.findUnique({
            where: { id: req.params.id },
        });
        if (!report) {
            return res.status(404).json({ error: 'Lab report not found.' });
        }
        if (report.status !== 'UNMAPPED') {
            return res.status(409).json({
                error: `Lab report is in status "${report.status}" and cannot be mapped.`,
            });
        }
        const test = yield prisma.test.findUnique({ where: { id: testId } });
        if (!test) {
            return res.status(404).json({ error: 'Target test not found.' });
        }
        const [updatedReport, updatedTest] = yield prisma.$transaction([
            prisma.labReport.update({
                where: { id: report.id },
                data: {
                    test_id: test.id,
                    status: 'PENDING_REVIEW',
                },
            }),
            // Only nudge the test forward if it's still waiting; never clobber
            // a completed/under-review test that someone manually moved on.
            prisma.test.update({
                where: { id: test.id },
                data: test.status === 'AWAITING_REPORT' || test.status === 'INITIATED'
                    ? { status: 'UNDER_REVIEW' }
                    : {},
            }),
        ]);
        // Also link the parent Email to the test if (a) it has no test yet,
        // and (b) all sibling lab reports either point at the same test or
        // are still unmapped. Avoids accidentally re-pointing a multi-lot email.
        const siblingReports = yield prisma.labReport.findMany({
            where: { email_id: report.email_id },
            select: { id: true, test_id: true },
        });
        const siblingTestIds = new Set(siblingReports.map(r => r.test_id).filter((id) => Boolean(id)));
        if (siblingTestIds.size === 1) {
            yield prisma.email.update({
                where: { id: report.email_id },
                data: { test_id: test.id },
            });
        }
        res.json({ success: true, report: updatedReport, test: updatedTest });
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
