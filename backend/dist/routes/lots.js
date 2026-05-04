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
function parseJson(value) {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch (_a) {
        return null;
    }
}
function normalizeReports(parsed) {
    if (Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.reports))
        return parsed.reports;
    if (Array.isArray(parsed))
        return parsed;
    if (parsed && typeof parsed === 'object' && ('lotNumber' in parsed || 'metadata' in parsed || 'moleculeResults' in parsed)) {
        return [parsed];
    }
    return [];
}
function normalizeFilename(value) {
    return (value || '').trim().toLowerCase();
}
function inferSourceType(report, attachment) {
    if (['EMAIL_BODY', 'ATTACHMENT', 'EMAIL_AND_ATTACHMENT'].includes(report === null || report === void 0 ? void 0 : report.sourceType)) {
        return report.sourceType;
    }
    return (report === null || report === void 0 ? void 0 : report.sourceAttachmentFilename) || attachment ? 'ATTACHMENT' : 'EMAIL_BODY';
}
function mapMoleculeResult(reportId, molecule) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const isDetected = typeof (molecule === null || molecule === void 0 ? void 0 : molecule.isDetected) === 'boolean' ? molecule.isDetected : null;
    const isCompliant = isDetected === false
        ? true
        : (typeof (molecule === null || molecule === void 0 ? void 0 : molecule.isCompliant) === 'boolean' ? molecule.isCompliant : null);
    return {
        lab_report_id: reportId,
        molecule_name: String((molecule === null || molecule === void 0 ? void 0 : molecule.moleculeName) || (molecule === null || molecule === void 0 ? void 0 : molecule.name) || 'Unknown molecule'),
        cas_number: (_a = molecule === null || molecule === void 0 ? void 0 : molecule.casNumber) !== null && _a !== void 0 ? _a : null,
        result: (_b = molecule === null || molecule === void 0 ? void 0 : molecule.result) !== null && _b !== void 0 ? _b : null,
        numeric_result: typeof (molecule === null || molecule === void 0 ? void 0 : molecule.numericResult) === 'number' ? molecule.numericResult : null,
        unit: (_c = molecule === null || molecule === void 0 ? void 0 : molecule.unit) !== null && _c !== void 0 ? _c : null,
        reporting_limit: (_d = molecule === null || molecule === void 0 ? void 0 : molecule.reportingLimit) !== null && _d !== void 0 ? _d : null,
        method_detection_limit: (_e = molecule === null || molecule === void 0 ? void 0 : molecule.methodDetectionLimit) !== null && _e !== void 0 ? _e : null,
        specification_limit: (_f = molecule === null || molecule === void 0 ? void 0 : molecule.specificationLimit) !== null && _f !== void 0 ? _f : null,
        method: (_g = molecule === null || molecule === void 0 ? void 0 : molecule.method) !== null && _g !== void 0 ? _g : null,
        status: (_h = molecule === null || molecule === void 0 ? void 0 : molecule.status) !== null && _h !== void 0 ? _h : null,
        is_detected: isDetected,
        is_compliant: isCompliant,
        notes: (_j = molecule === null || molecule === void 0 ? void 0 : molecule.notes) !== null && _j !== void 0 ? _j : null,
    };
}
function backfillReportsFromAiLogs(lotId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        const tests = yield prisma.test.findMany({
            where: { lot_id: lotId },
            include: {
                emails: {
                    include: {
                        attachments: true,
                        labReports: true,
                    },
                },
            },
        });
        for (const test of tests) {
            for (const email of test.emails) {
                if (email.direction !== 'RECEIVED' || email.labReports.length > 0) {
                    continue;
                }
                const aiLog = yield prisma.aILog.findFirst({
                    where: { message_id: email.message_id },
                    orderBy: { createdAt: 'desc' },
                });
                const reports = normalizeReports(parseJson((_a = aiLog === null || aiLog === void 0 ? void 0 : aiLog.response_received) !== null && _a !== void 0 ? _a : null));
                if (reports.length === 0) {
                    continue;
                }
                const attachmentsByName = new Map(email.attachments.map(attachment => [normalizeFilename(attachment.original_filename), attachment]));
                for (const report of reports) {
                    const sourceAttachment = attachmentsByName.get(normalizeFilename(report === null || report === void 0 ? void 0 : report.sourceAttachmentFilename)) || null;
                    const labReport = yield prisma.labReport.create({
                        data: {
                            email_id: email.id,
                            test_id: test.id,
                            attachment_id: (_b = sourceAttachment === null || sourceAttachment === void 0 ? void 0 : sourceAttachment.id) !== null && _b !== void 0 ? _b : null,
                            lot_number: (_c = report === null || report === void 0 ? void 0 : report.lotNumber) !== null && _c !== void 0 ? _c : null,
                            source_type: inferSourceType(report, sourceAttachment),
                            source_attachment_filename: (_e = (_d = report === null || report === void 0 ? void 0 : report.sourceAttachmentFilename) !== null && _d !== void 0 ? _d : sourceAttachment === null || sourceAttachment === void 0 ? void 0 : sourceAttachment.original_filename) !== null && _e !== void 0 ? _e : null,
                            status: 'PENDING_REVIEW',
                            metadata_json: JSON.stringify((_f = report === null || report === void 0 ? void 0 : report.metadata) !== null && _f !== void 0 ? _f : null),
                            results_json: JSON.stringify((_g = report === null || report === void 0 ? void 0 : report.results) !== null && _g !== void 0 ? _g : null),
                            raw_ai_json: JSON.stringify(report),
                        },
                    });
                    const moleculeResults = Array.isArray(report === null || report === void 0 ? void 0 : report.moleculeResults) ? report.moleculeResults : [];
                    if (moleculeResults.length > 0) {
                        yield prisma.moleculeResult.createMany({
                            data: moleculeResults.map((molecule) => mapMoleculeResult(labReport.id, molecule)),
                        });
                    }
                }
            }
        }
    });
}
router.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield backfillReportsFromAiLogs(req.params.id);
        const lot = yield prisma.lot.findUnique({
            where: { id: req.params.id },
            include: {
                product: true,
                variant: true,
                company: true,
                tests: {
                    orderBy: { createdAt: 'desc' },
                    include: {
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
                        },
                    },
                },
            },
        });
        if (!lot) {
            return res.status(404).json({ error: 'Lot not found.' });
        }
        res.json(lot);
    }
    catch (error) {
        console.error('Error fetching lot:', error);
        res.status(500).json({ error: error.message });
    }
}));
exports.default = router;
