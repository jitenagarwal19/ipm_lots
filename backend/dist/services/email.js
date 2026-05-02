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
exports.extractPdfText = extractPdfText;
exports.sendTestRequestEmail = sendTestRequestEmail;
exports.pollForReplies = pollForReplies;
exports.getTrackedEmailsFromGmail = getTrackedEmailsFromGmail;
exports.processTrackedEmail = processTrackedEmail;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_s3_1 = require("@aws-sdk/client-s3");
const googleapis_1 = require("googleapis");
const uuid_1 = require("uuid");
const emailTemplates_1 = require("../templates/emailTemplates");
const pdfParse = require('pdf-parse');
const openai_1 = require("./openai");
const client_1 = require("@prisma/client");
const serverLog_1 = require("../lib/serverLog");
const prisma = new client_1.PrismaClient();
const TOKEN_PATH = path_1.default.join(__dirname, '../../token.json');
const CREDENTIALS_PATH = path_1.default.join(__dirname, '../../credentials.json');
const UPLOADS_PATH = path_1.default.join(process.cwd(), 'uploads');
const TRACKED_EMAIL_LIMIT = Number(process.env.TRACKED_EMAIL_LIMIT || 10);
const PROCESSED_GMAIL_LABEL = process.env.PROCESSED_GMAIL_LABEL || 'processed';
const OPENAI_MAX_ATTACHMENT_CHARS = Number(process.env.OPENAI_MAX_ATTACHMENT_CHARS || 45000);
const STORAGE_MODE = process.env.STORAGE_MODE || 'local';
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    }
});
function uploadFile(filename, buffer, mimeType) {
    return __awaiter(this, void 0, void 0, function* () {
        if (STORAGE_MODE === 's3' && process.env.AWS_S3_BUCKET_NAME) {
            const command = new client_s3_1.PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: filename,
                Body: buffer,
                ContentType: mimeType,
            });
            yield s3Client.send(command);
            // Returning a format that can be used directly or parsed by the frontend
            return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;
        }
        else {
            fs_1.default.mkdirSync(UPLOADS_PATH, { recursive: true });
            const filepath = path_1.default.join(UPLOADS_PATH, filename);
            fs_1.default.writeFileSync(filepath, buffer);
            return `/uploads/${filename}`;
        }
    });
}
function decodeBase64Url(data) {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function getHeader(headers, name) {
    var _a;
    return ((_a = headers.find(h => { var _a; return ((_a = h.name) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === name.toLowerCase(); })) === null || _a === void 0 ? void 0 : _a.value) || '';
}
function normalizeFilename(value) {
    return (value || '').trim().toLowerCase();
}
function stringifyJson(value) {
    return JSON.stringify(value !== null && value !== void 0 ? value : null);
}
function formatGmailLabelQuery(label) {
    const trimmed = label.trim();
    if (/[\s"]/g.test(trimmed)) {
        return `label:"${trimmed.replace(/"/g, '\\"')}"`;
    }
    return `label:${trimmed}`;
}
function inferReportSourceType(report, attachment) {
    if (['EMAIL_BODY', 'ATTACHMENT', 'EMAIL_AND_ATTACHMENT'].includes(report === null || report === void 0 ? void 0 : report.sourceType)) {
        return report.sourceType;
    }
    const hasAttachmentSource = Boolean((report === null || report === void 0 ? void 0 : report.sourceAttachmentFilename) || (attachment === null || attachment === void 0 ? void 0 : attachment.extracted_text));
    const hasEmailBodySource = !hasAttachmentSource || Boolean(report === null || report === void 0 ? void 0 : report.sourceIncludesEmailBody);
    if (hasAttachmentSource && hasEmailBodySource)
        return 'EMAIL_AND_ATTACHMENT';
    if (hasAttachmentSource)
        return 'ATTACHMENT';
    return 'EMAIL_BODY';
}
function mapMoleculeResult(reportId, molecule) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
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
        is_detected: typeof (molecule === null || molecule === void 0 ? void 0 : molecule.isDetected) === 'boolean' ? molecule.isDetected : null,
        is_compliant: typeof (molecule === null || molecule === void 0 ? void 0 : molecule.isCompliant) === 'boolean' ? molecule.isCompliant : null,
        notes: (_j = molecule === null || molecule === void 0 ? void 0 : molecule.notes) !== null && _j !== void 0 ? _j : null,
    };
}
function getOrCreateGmailLabelId(gmail, labelName) {
    return __awaiter(this, void 0, void 0, function* () {
        const labelsResponse = yield gmail.users.labels.list({ userId: 'me' });
        const existingLabel = (labelsResponse.data.labels || []).find((label) => { var _a; return ((_a = label.name) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === labelName.toLowerCase(); });
        if (existingLabel === null || existingLabel === void 0 ? void 0 : existingLabel.id) {
            return existingLabel.id;
        }
        const createdLabel = yield gmail.users.labels.create({
            userId: 'me',
            requestBody: {
                name: labelName,
                labelListVisibility: 'labelShow',
                messageListVisibility: 'show',
            },
        });
        return createdLabel.data.id;
    });
}
function applyProcessedLabel(gmail, messageId) {
    return __awaiter(this, void 0, void 0, function* () {
        const labelId = yield getOrCreateGmailLabelId(gmail, PROCESSED_GMAIL_LABEL);
        if (!labelId) {
            throw new Error(`Could not create or find Gmail label "${PROCESSED_GMAIL_LABEL}".`);
        }
        yield gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: {
                addLabelIds: [labelId],
            },
        });
    });
}
function extractPdfText(filename_1, buffer_1) {
    return __awaiter(this, arguments, void 0, function* (filename, buffer, parser = pdfParse) {
        if (!filename.toLowerCase().endsWith('.pdf')) {
            return '';
        }
        try {
            const pdfData = yield parser(buffer);
            return `${pdfData.text || ''}\n`;
        }
        catch (e) {
            (0, serverLog_1.serverLog)("Failed to parse PDF:", e);
            return '';
        }
    });
}
// Initialize the Gmail API Client
function getGmailClient() {
    if (!fs_1.default.existsSync(CREDENTIALS_PATH) || !fs_1.default.existsSync(TOKEN_PATH)) {
        return null;
    }
    const content = fs_1.default.readFileSync(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const redirect_uri = (redirect_uris && redirect_uris.length > 0) ? redirect_uris[0] : 'http://localhost';
    const oAuth2Client = new googleapis_1.google.auth.OAuth2(client_id, client_secret, redirect_uri);
    const token = fs_1.default.readFileSync(TOKEN_PATH, 'utf8');
    oAuth2Client.setCredentials(JSON.parse(token));
    return googleapis_1.google.gmail({ version: 'v1', auth: oAuth2Client });
}
// Helper to create a base64url encoded MIME email
function makeEmail(to, from, subject, body) {
    const str = [
        `Content-Type: text/html; charset="UTF-8"`,
        `MIME-Version: 1.0`,
        `Content-Transfer-Encoding: 7bit`,
        `to: ${to}`,
        `from: ${from}`,
        `subject: ${subject}`,
        ``,
        body,
    ].join('\n');
    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sendTestRequestEmail(testId, lotNumber, labName, toEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        const gmail = getGmailClient();
        if (!gmail) {
            throw new Error("Gmail client not configured. Missing credentials.json or token.json");
        }
        try {
            const profile = yield gmail.users.getProfile({ userId: 'me' });
            const fromEmail = profile.data.emailAddress || 'me';
            const subject = `IPM Test Request - Lot: ${lotNumber}`;
            const htmlBody = (0, emailTemplates_1.getTestRequestEmailTemplate)(lotNumber, labName, testId);
            const rawMessage = makeEmail(toEmail, fromEmail, subject, htmlBody);
            const res = yield gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: rawMessage,
                },
            });
            (0, serverLog_1.serverLog)(`[GMAIL SERVICE] Email sent successfully. Thread ID: ${res.data.threadId}`);
            return {
                threadId: res.data.threadId,
                messageId: res.data.id,
                fromEmail,
                toEmail,
                subject
            };
        }
        catch (error) {
            (0, serverLog_1.serverLog)("[GMAIL SERVICE] Failed to send email:", error);
            throw error;
        }
    });
}
function pollForReplies(threadId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const gmail = getGmailClient();
        if (!gmail) {
            throw new Error("Gmail client not configured. Missing credentials.json or token.json");
        }
        try {
            // Fetch the thread
            const res = yield gmail.users.threads.get({
                userId: 'me',
                id: threadId,
            });
            const messages = res.data.messages || [];
            // If there's more than 1 message, it means there is a reply!
            if (messages.length > 1) {
                // Get the latest message
                const latestMessage = messages[messages.length - 1];
                // Look for attachments in the payload
                let attachmentId = null;
                let filename = null;
                const parts = ((_a = latestMessage.payload) === null || _a === void 0 ? void 0 : _a.parts) || [];
                for (const part of parts) {
                    if (part.filename && part.filename.endsWith('.pdf') && ((_b = part.body) === null || _b === void 0 ? void 0 : _b.attachmentId)) {
                        attachmentId = part.body.attachmentId;
                        filename = part.filename;
                        break;
                    }
                }
                if (attachmentId) {
                    (0, serverLog_1.serverLog)(`[GMAIL SERVICE] Found PDF reply for thread ${threadId}! Extracting...`);
                    // We're not downloading it to disk just yet in this simplified MVP, just logging the URL reference
                    return {
                        hasReply: true,
                        attachment: {
                            filename: filename || `Report.pdf`,
                            url: `/uploads/gmail_${attachmentId}.pdf`, // Mock URL for the extracted attachment
                            receivedAt: new Date(parseInt(latestMessage.internalDate || '0'))
                        }
                    };
                }
            }
            return { hasReply: false };
        }
        catch (error) {
            (0, serverLog_1.serverLog)(`[GMAIL SERVICE] Error polling thread ${threadId}:`, error);
            return { hasReply: false };
        }
    });
}
function getTrackedEmailsFromGmail(labels) {
    return __awaiter(this, void 0, void 0, function* () {
        const gmail = getGmailClient();
        if (!gmail) {
            throw new Error("Gmail client not configured.");
        }
        if (!labels || labels.length === 0) {
            return [];
        }
        // Construct query like: "(label:INBOX OR label:IPM_Report) -label:processed"
        const trackedLabelQuery = labels.map(formatGmailLabelQuery).join(' OR ');
        const query = `(${trackedLabelQuery}) -${formatGmailLabelQuery(PROCESSED_GMAIL_LABEL)}`;
        const startedAt = Date.now();
        (0, serverLog_1.serverLog)("[GMAIL SERVICE] Fetching tracked emails", {
            labels,
            query,
            limit: TRACKED_EMAIL_LIMIT,
        });
        try {
            const res = yield gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: TRACKED_EMAIL_LIMIT,
                fields: 'messages(id,threadId),resultSizeEstimate',
            });
            const messages = res.data.messages || [];
            if (messages.length === 0)
                return [];
            const messageIds = messages.map(m => m.id).filter(Boolean);
            const existingEmails = yield prisma.email.findMany({
                where: { message_id: { in: messageIds } },
                select: { message_id: true }
            });
            const processedIds = new Set(existingEmails.map(e => e.message_id));
            const messagesWithIds = messages.filter((msg) => Boolean(msg.id));
            const detailedMessages = yield Promise.all(messagesWithIds.map((msg) => __awaiter(this, void 0, void 0, function* () {
                const details = yield gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full',
                    fields: 'id,threadId,snippet,payload(headers,parts)',
                });
                const payload = details.data.payload;
                const headers = (payload === null || payload === void 0 ? void 0 : payload.headers) || [];
                const subject = getHeader(headers, 'Subject') || 'No Subject';
                const from = getHeader(headers, 'From') || 'Unknown';
                const date = getHeader(headers, 'Date');
                let attachments = [];
                function parsePartsForMetadata(parts) {
                    var _a;
                    for (const part of parts) {
                        if (part.filename && ((_a = part.body) === null || _a === void 0 ? void 0 : _a.attachmentId)) {
                            attachments.push({ filename: part.filename });
                        }
                        if (part.parts) {
                            parsePartsForMetadata(part.parts);
                        }
                    }
                }
                if (payload === null || payload === void 0 ? void 0 : payload.parts) {
                    parsePartsForMetadata(payload.parts);
                }
                return {
                    id: msg.id,
                    threadId: msg.threadId,
                    snippet: details.data.snippet,
                    subject,
                    from,
                    date,
                    attachments,
                    isProcessed: processedIds.has(msg.id)
                };
            })));
            (0, serverLog_1.serverLog)("[GMAIL SERVICE] Fetched tracked emails", {
                count: detailedMessages.length,
                durationMs: Date.now() - startedAt,
            });
            return detailedMessages;
        }
        catch (error) {
            (0, serverLog_1.serverLog)("[GMAIL SERVICE] Error fetching tracked emails:", error);
            throw error;
        }
    });
}
function processTrackedEmail(messageId, opts) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
        const trace = (_a = opts === null || opts === void 0 ? void 0 : opts.requestId) !== null && _a !== void 0 ? _a : "—";
        const processStartedAt = Date.now();
        const timings = {};
        const gmail = getGmailClient();
        if (!gmail)
            throw new Error("Gmail client not configured.");
        // Check if it's already processed
        let stepStartedAt = Date.now();
        const existing = yield prisma.email.findUnique({
            where: { message_id: messageId },
            include: {
                labReports: {
                    select: { id: true, test_id: true },
                },
            },
        });
        timings.existingCheckMs = Date.now() - stepStartedAt;
        if (existing) {
            timings.totalMs = Date.now() - processStartedAt;
            let processedLabelApplied = false;
            let processedLabelError = null;
            try {
                yield applyProcessedLabel(gmail, messageId);
                processedLabelApplied = true;
            }
            catch (error) {
                processedLabelError = error.message || 'Failed to apply processed Gmail label.';
                (0, serverLog_1.serverLog)(`[trace=${trace}][GMAIL SERVICE][${messageId}] Failed to apply processed label to already processed email`, error);
            }
            return {
                email: existing,
                status: existing.test_id || existing.labReports.some(r => Boolean(r.test_id))
                    ? "ALREADY MAPPED"
                    : "ALREADY PROCESSED (UNMAPPED)",
                analysis: null,
                timings,
                processedLabelApplied,
                processedLabelError,
            };
        }
        stepStartedAt = Date.now();
        const msg = yield gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        });
        timings.gmailMessageFetchMs = Date.now() - stepStartedAt;
        stepStartedAt = Date.now();
        const payload = msg.data.payload;
        const headers = (payload === null || payload === void 0 ? void 0 : payload.headers) || [];
        const subject = getHeader(headers, 'Subject') || 'No Subject';
        const fromEmail = getHeader(headers, 'From') || 'Unknown';
        const dateStr = getHeader(headers, 'Date');
        (0, serverLog_1.serverLog)(`[trace=${trace}][GMAIL SERVICE][${messageId}] Processing tracked email`, {
            threadId: msg.data.threadId,
            subject,
            fromEmail,
            date: dateStr || null,
        });
        let bodyText = '';
        let attachmentIds = [];
        function parseParts(parts) {
            var _a, _b;
            for (const part of parts) {
                if (part.mimeType === 'text/plain' && ((_a = part.body) === null || _a === void 0 ? void 0 : _a.data)) {
                    bodyText += decodeBase64Url(part.body.data).toString('utf8') + '\n';
                }
                else if (part.filename && ((_b = part.body) === null || _b === void 0 ? void 0 : _b.attachmentId)) {
                    attachmentIds.push({ id: part.body.attachmentId, filename: part.filename });
                }
                if (part.parts) {
                    parseParts(part.parts);
                }
            }
        }
        if (payload === null || payload === void 0 ? void 0 : payload.parts) {
            parseParts(payload.parts);
        }
        else if ((_b = payload === null || payload === void 0 ? void 0 : payload.body) === null || _b === void 0 ? void 0 : _b.data) {
            bodyText = decodeBase64Url(payload.body.data).toString('utf8');
        }
        timings.payloadParseMs = Date.now() - stepStartedAt;
        (0, serverLog_1.serverLog)(`[trace=${trace}][GMAIL SERVICE][${messageId}] Parsed email payload`, {
            bodyChars: bodyText.length,
            attachmentCount: attachmentIds.length,
            attachmentFilenames: attachmentIds.map(att => att.filename),
        });
        const pdfTextSections = [];
        const savedAttachments = [];
        // Download and parse attachments
        stepStartedAt = Date.now();
        for (const att of attachmentIds) {
            const attRes = yield gmail.users.messages.attachments.get({
                userId: 'me',
                messageId: messageId,
                id: att.id
            });
            if (attRes.data.data) {
                const buffer = decodeBase64Url(attRes.data.data);
                const filename = `${(0, uuid_1.v4)()}_${att.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                const mimeType = att.filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
                const fileUrl = yield uploadFile(filename, buffer, mimeType);
                (0, serverLog_1.serverLog)(`[trace=${trace}][GMAIL SERVICE][${messageId}] Saved attachment to ${STORAGE_MODE}`, {
                    originalFilename: att.filename,
                    savedFilename: filename,
                    bytes: buffer.length,
                    url: fileUrl,
                });
                const extractedText = yield extractPdfText(att.filename, buffer);
                savedAttachments.push({
                    original_filename: att.filename,
                    file_url: fileUrl,
                    file_type: mimeType,
                    extracted_text: extractedText.trim() || null,
                });
                if (extractedText.trim()) {
                    pdfTextSections.push([
                        `--- Attachment: ${att.filename} ---`,
                        extractedText.trim(),
                        `--- End Attachment: ${att.filename} ---`,
                    ].join('\n'));
                }
            }
        }
        timings.attachmentProcessingMs = Date.now() - stepStartedAt;
        // OpenAI Analysis
        const fullPdfTextRaw = pdfTextSections.join('\n\n');
        const fullPdfText = fullPdfTextRaw.length > OPENAI_MAX_ATTACHMENT_CHARS
            ? `${fullPdfTextRaw.slice(0, OPENAI_MAX_ATTACHMENT_CHARS)}\n\n[TRUNCATED attachment text: ${fullPdfTextRaw.length - OPENAI_MAX_ATTACHMENT_CHARS} chars removed]`
            : fullPdfTextRaw;
        (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] attachments done in ${timings.attachmentProcessingMs}ms`, {
            bodyChars: bodyText.length,
            pdfTextChars: fullPdfText.length,
            pdfTextCharsRaw: fullPdfTextRaw.length,
            savedAttachmentCount: savedAttachments.length,
            pdfReportSectionCount: pdfTextSections.length,
        });
        if (fullPdfTextRaw.length !== fullPdfText.length) {
            (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] attachment text truncated for OpenAI: raw=${fullPdfTextRaw.length} sent=${fullPdfText.length}`);
        }
        (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] OpenAI: starting (large PDFs / many analytes can take 1–5+ minutes; UI progress bar is only a rough timer)`);
        stepStartedAt = Date.now();
        const analysis = yield (0, openai_1.analyzeLabReport)(bodyText, fullPdfText, messageId, trace);
        timings.openAiMs = Date.now() - stepStartedAt;
        const reports = Array.isArray(analysis) ? analysis : [];
        (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] OpenAI: finished in ${timings.openAiMs}ms`, {
            reportCount: reports.length,
            lotNumbers: reports.map((report) => { var _a; return (_a = report === null || report === void 0 ? void 0 : report.lotNumber) !== null && _a !== void 0 ? _a : null; }),
        });
        let statusStr = "UNMAPPED";
        const mappedReports = [];
        const reportMatches = [];
        stepStartedAt = Date.now();
        let reportIndex = 0;
        for (const report of reports) {
            reportIndex += 1;
            let matchedTestId = null;
            if (!(report === null || report === void 0 ? void 0 : report.lotNumber)) {
                (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] map ${reportIndex}/${reports.length}: no lotNumber in AI output, skipping DB lookup`);
                reportMatches.push({
                    report,
                    testId: null,
                    lotNumber: null,
                    reportId: (_d = (_c = report === null || report === void 0 ? void 0 : report.metadata) === null || _c === void 0 ? void 0 : _c.reportId) !== null && _d !== void 0 ? _d : null,
                });
                continue;
            }
            // Find the lot
            (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] map ${reportIndex}/${reports.length}: lookup lot_number=${report.lotNumber}`);
            const lot = yield prisma.lot.findUnique({
                where: { lot_number: report.lotNumber },
                include: { tests: { where: { status: 'AWAITING_REPORT' }, orderBy: { createdAt: 'desc' } } }
            });
            if (lot && lot.tests.length > 0) {
                const targetTest = lot.tests[0];
                matchedTestId = targetTest.id;
                // Update test status
                yield prisma.test.update({
                    where: { id: targetTest.id },
                    data: { status: 'UNDER_REVIEW' }
                });
                mappedReports.push({
                    lotNumber: report.lotNumber,
                    testId: targetTest.id,
                    reportId: (_f = (_e = report === null || report === void 0 ? void 0 : report.metadata) === null || _e === void 0 ? void 0 : _e.reportId) !== null && _f !== void 0 ? _f : null,
                });
                (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] map ${reportIndex}/${reports.length}: matched test ${targetTest.id} for lot ${report.lotNumber}`);
            }
            else {
                (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] map ${reportIndex}/${reports.length}: no AWAITING_REPORT test for lot ${report.lotNumber} (lot exists: ${Boolean(lot)})`);
            }
            reportMatches.push({
                report,
                testId: matchedTestId,
                lotNumber: (_g = report.lotNumber) !== null && _g !== void 0 ? _g : null,
                reportId: (_j = (_h = report === null || report === void 0 ? void 0 : report.metadata) === null || _h === void 0 ? void 0 : _h.reportId) !== null && _j !== void 0 ? _j : null,
            });
        }
        timings.mappingMs = Date.now() - stepStartedAt;
        (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] mapping phase done in ${timings.mappingMs}ms (${reports.length} AI reports)`);
        if (mappedReports.length > 0) {
            statusStr = `MAPPED ${mappedReports.length} report${mappedReports.length === 1 ? '' : 's'}`;
        }
        // If the email maps to multiple tests (e.g. 2 attachments / 2 lots),
        // we keep Email.test_id null and rely on LabReport.test_id per report.
        const uniqueMappedTestIds = Array.from(new Set(mappedReports.map(r => r.testId)));
        const emailTestId = uniqueMappedTestIds.length === 1 ? uniqueMappedTestIds[0] : null;
        let receivedAt = new Date();
        if (dateStr) {
            const parsedDate = new Date(dateStr);
            if (!isNaN(parsedDate.getTime())) {
                receivedAt = parsedDate;
            }
        }
        // Create Email record
        stepStartedAt = Date.now();
        const newEmail = yield prisma.email.create({
            data: {
                message_id: messageId,
                thread_id: msg.data.threadId,
                subject,
                body: bodyText,
                from_email: fromEmail,
                direction: 'RECEIVED',
                received_at: receivedAt,
                test_id: emailTestId,
                attachments: {
                    create: savedAttachments
                }
            },
            include: {
                attachments: true
            },
        });
        timings.emailSaveMs = Date.now() - stepStartedAt;
        (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] saved Email row in ${timings.emailSaveMs}ms id=${newEmail.id}`);
        const attachmentsByOriginalName = new Map(newEmail.attachments.map(attachment => [normalizeFilename(attachment.original_filename), attachment]));
        stepStartedAt = Date.now();
        let saveIndex = 0;
        for (const match of reportMatches) {
            saveIndex += 1;
            const moleculeResults = Array.isArray((_k = match.report) === null || _k === void 0 ? void 0 : _k.moleculeResults)
                ? match.report.moleculeResults
                : [];
            (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] save ${saveIndex}/${reportMatches.length}: LabReport lot=${(_l = match.lotNumber) !== null && _l !== void 0 ? _l : '—'} testId=${(_m = match.testId) !== null && _m !== void 0 ? _m : '—'} molecules=${moleculeResults.length}`);
            const sourceAttachment = attachmentsByOriginalName.get(normalizeFilename((_o = match.report) === null || _o === void 0 ? void 0 : _o.sourceAttachmentFilename)) || null;
            const labReport = yield prisma.labReport.create({
                data: {
                    email_id: newEmail.id,
                    test_id: match.testId,
                    attachment_id: (_p = sourceAttachment === null || sourceAttachment === void 0 ? void 0 : sourceAttachment.id) !== null && _p !== void 0 ? _p : null,
                    lot_number: match.lotNumber,
                    source_type: inferReportSourceType(match.report, sourceAttachment),
                    source_attachment_filename: (_s = (_r = (_q = match.report) === null || _q === void 0 ? void 0 : _q.sourceAttachmentFilename) !== null && _r !== void 0 ? _r : sourceAttachment === null || sourceAttachment === void 0 ? void 0 : sourceAttachment.original_filename) !== null && _s !== void 0 ? _s : null,
                    status: match.testId ? 'PENDING_REVIEW' : 'UNMAPPED',
                    metadata_json: stringifyJson((_u = (_t = match.report) === null || _t === void 0 ? void 0 : _t.metadata) !== null && _u !== void 0 ? _u : null),
                    results_json: stringifyJson((_w = (_v = match.report) === null || _v === void 0 ? void 0 : _v.results) !== null && _w !== void 0 ? _w : null),
                    raw_ai_json: stringifyJson(match.report),
                },
            });
            if (moleculeResults.length > 0) {
                yield prisma.moleculeResult.createMany({
                    data: moleculeResults.map((molecule) => mapMoleculeResult(labReport.id, molecule)),
                });
                (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] save ${saveIndex}/${reportMatches.length}: inserted ${moleculeResults.length} MoleculeResult rows for labReport ${labReport.id}`);
            }
        }
        timings.reportSaveMs = Date.now() - stepStartedAt;
        (0, serverLog_1.serverLog)(`[trace=${trace}][PROCESS][${messageId}] report save phase done in ${timings.reportSaveMs}ms`);
        let processedLabelApplied = false;
        let processedLabelError = null;
        stepStartedAt = Date.now();
        try {
            yield applyProcessedLabel(gmail, messageId);
            processedLabelApplied = true;
        }
        catch (error) {
            processedLabelError = error.message || 'Failed to apply processed Gmail label.';
            (0, serverLog_1.serverLog)(`[trace=${trace}][GMAIL SERVICE][${messageId}] Failed to apply processed label`, error);
        }
        timings.processedLabelMs = Date.now() - stepStartedAt;
        timings.totalMs = Date.now() - processStartedAt;
        (0, serverLog_1.serverLog)(`[trace=${trace}][GMAIL SERVICE][${messageId}] Processing timing breakdown`, Object.assign(Object.assign({}, timings), { processedLabelApplied,
            processedLabelError }));
        return {
            email: newEmail,
            status: statusStr,
            analysis: reports,
            mappedReports,
            timings,
            processedLabelApplied,
            processedLabelError,
        };
    });
}
