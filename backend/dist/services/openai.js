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
exports.buildAnalyzeLabReportPrompt = buildAnalyzeLabReportPrompt;
exports.analyzeLabReportWithClient = analyzeLabReportWithClient;
exports.analyzeLabReport = analyzeLabReport;
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const serverLog_1 = require("../lib/serverLog");
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 180000);
const openai = new openai_1.default({
    apiKey,
});
function preview(value, maxLength = 700) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength)
        return normalized;
    return `${normalized.slice(0, maxLength)}... [truncated ${normalized.length - maxLength} chars]`;
}
function saveAiLog(logRepository, messageId, prompt, response) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield logRepository.aILog.create({
                data: {
                    message_id: messageId,
                    prompt_sent: prompt,
                    response_received: response,
                }
            });
        }
        catch (error) {
            (0, serverLog_1.serverLog)(`[OPENAI][${messageId}] Failed to save AI log:`, error);
        }
    });
}
function buildAnalyzeLabReportPrompt(emailBody, attachmentText) {
    return `
  You are an AI assistant tasked with extracting structured data from lab test reports.
  Please read the following email body and the extracted text from all attached PDF reports.
  An email can contain zero, one, or many lab reports across one or many attachments.
  Extract each distinct report separately, including the report metadata and the complete molecule/analyte results table for that report.

  Important extraction rules:
  - Always return a "reports" array. If you discover only one report, return an array containing one report object.
  - Return an empty "reports" array if no lab report is present.
  - Return every molecule/analyte listed in the report, not only detected molecules and not only failures.
  - Never collapse multiple analytes into a synthetic summary row such as "Other analysed pesticides", "other pesticides", "all other analytes", "remaining analytes", or similar. Those phrases are not molecule names.
  - When the attachment text lists many analytes in one paragraph, numbered list, comma-separated list, or line-wrapped table, split them into separate moleculeResults entries. For example, "Chlorantraniliprole (0.01), Clothianidin (0.01), Cyantraniliprole (0.01)" must become three separate rows.
  - Include not-detected/BLQ/BDL/ND analytes as separate rows using their own molecule names and shared limit values when the report groups them.
  - Before responding, compare moleculeResults.length with the number of analyte names visible in the report. If the report visibly lists around 50 analytes, moleculeResults must contain around 50 entries, not only the detected subset.
  - If an analyte appears only in a grouped "not detected" list with a limit in parentheses, use that limit as reportingLimit/specificationLimit when the report does not clarify which kind of limit it is, set result to "BLQ", "BDL", "ND", or the exact grouped result text if shown, and set isDetected to false.
  - Preserve each molecule's full result details, including measured value, units, reporting limit, method limit, status, pass/fail decision, and any notes when present.
  - If a metadata field is absent or unclear, return null for that field instead of guessing.
  - Keep each report's top-level lotNumber equal to that report's metadata lotNumber so existing lot mapping can continue to work.
  - Use attachment filename markers when present to keep separate reports separate. Do not merge two different report certificates into one report object.
  - Set sourceType to "EMAIL_BODY" if the results came only from the email body, "ATTACHMENT" if they came only from an attachment, or "EMAIL_AND_ATTACHMENT" if both were needed.

  Email Body:
  ${emailBody}

  Attachment Text From All Attachments:
  ${attachmentText}

  Respond strictly in JSON format with the following structure:
  {
    "reports": [
      {
        "lotNumber": "extracted lot number or null if not found",
        "sourceType": "EMAIL_BODY, ATTACHMENT, EMAIL_AND_ATTACHMENT, or UNKNOWN",
        "sourceAttachmentFilename": "attachment filename this report came from, or null",
        "metadata": {
          "reportId": "report id, certificate number, or sample/report reference, or null",
          "labName": "testing laboratory name or null",
          "lotNumber": "lot number or null",
          "sampleId": "sample id or null",
          "sampleName": "sample/product name or null",
          "sampleType": "sample type/matrix/category or null",
          "sampleCondition": "sample condition on receipt/submission or null",
          "dateSampleSubmitted": "sample submitted/received date in ISO-8601 format when possible, or original date text, or null",
          "dateSampleCollected": "sample collection date in ISO-8601 format when possible, or original date text, or null",
          "dateReported": "report/certificate issue date in ISO-8601 format when possible, or original date text, or null",
          "clientName": "client/customer name or null",
          "labAddress": "lab address or null",
          "reportStatus": "final/amended/draft/etc. or null"
        },
        "results": {
          "summary": "brief summary of the test results",
          "isValid": boolean (true if the test passed, false if failed, or null if unknown)
        },
        "extractionQuality": {
          "visibleAnalyteCountEstimate": number or null,
          "moleculeResultsCount": number,
          "hasCollapsedAnalyteGroup": false,
          "notes": "brief note about completeness, especially if source text is truncated or table text is hard to read"
        },
        "moleculeResults": [
          {
            "moleculeName": "molecule/analyte name exactly as shown",
            "casNumber": "CAS number or null",
            "result": "full result value/text exactly as shown, or null",
            "numericResult": number or null,
            "unit": "unit of measure or null",
            "reportingLimit": "reporting limit/LOQ/RL text or null",
            "methodDetectionLimit": "MDL/LOD text or null",
            "specificationLimit": "allowed threshold/limit text or null",
            "method": "test method or null",
            "status": "detected/not detected/pass/fail/trace/etc. or null",
            "isDetected": boolean or null,
            "isCompliant": boolean or null,
            "notes": "row-level notes, qualifiers, or null"
          }
        ]
      }
    ]
  }
  `;
}
function normalizeReports(parsed) {
    if (Array.isArray(parsed)) {
        return parsed;
    }
    if (Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.reports)) {
        return parsed.reports;
    }
    if (parsed && typeof parsed === 'object' && ('lotNumber' in parsed || 'metadata' in parsed || 'moleculeResults' in parsed)) {
        return [parsed];
    }
    return [];
}
function analyzeLabReportWithClient(emailBody, attachmentText, messageId, client, logRepository, requestId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const trace = requestId !== null && requestId !== void 0 ? requestId : "—";
        const prompt = buildAnalyzeLabReportPrompt(emailBody, attachmentText);
        const startedAt = Date.now();
        if (!apiKey && client === openai) {
            const message = "OpenAI API key not configured. Set OPENAI_API_KEY in backend/.env.";
            (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${messageId}] ${message}`);
            yield saveAiLog(logRepository, messageId, prompt, JSON.stringify({ error: message }));
            throw new Error(message);
        }
        (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${messageId}] Sending lab report analysis request`, {
            model: OPENAI_MODEL,
            emailBodyChars: emailBody.length,
            attachmentTextChars: attachmentText.length,
            promptChars: prompt.length,
            promptPreview: preview(prompt),
        });
        try {
            (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${messageId}] chat.completions.create: waiting (timeout=${OPENAI_TIMEOUT_MS}ms)`);
            const response = yield client.chat.completions.create({
                model: OPENAI_MODEL,
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
            }, {
                timeout: OPENAI_TIMEOUT_MS,
                maxRetries: 1,
            });
            const content = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message.content;
            if (!content)
                throw new Error("No content received from OpenAI");
            (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${messageId}] Received lab report analysis response`, {
                durationMs: Date.now() - startedAt,
                responseId: response.id,
                responseModel: response.model,
                finishReason: (_b = response.choices[0]) === null || _b === void 0 ? void 0 : _b.finish_reason,
                usage: response.usage,
                responseChars: content.length,
                responsePreview: preview(content),
            });
            yield saveAiLog(logRepository, messageId, prompt, content);
            try {
                const parsed = JSON.parse(content);
                const reports = normalizeReports(parsed);
                (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${messageId}] Parsed lab report analysis`, {
                    reportCount: reports.length,
                    lotNumbers: reports.map((report) => { var _a; return (_a = report === null || report === void 0 ? void 0 : report.lotNumber) !== null && _a !== void 0 ? _a : null; }),
                    moleculeResultCounts: reports.map((report) => Array.isArray(report === null || report === void 0 ? void 0 : report.moleculeResults) ? report.moleculeResults.length : null),
                });
                return reports;
            }
            catch (parseError) {
                (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${messageId}] Failed to parse OpenAI JSON response`, {
                    error: parseError.message,
                    responsePreview: preview(content),
                });
                throw parseError;
            }
        }
        catch (error) {
            (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${messageId}] Error analyzing lab report`, {
                durationMs: Date.now() - startedAt,
                error: error.message,
                name: error.name,
                status: error.status,
                code: error.code,
                type: error.type,
            });
            yield saveAiLog(logRepository, messageId, prompt, JSON.stringify({
                error: error.message,
                name: error.name,
                status: error.status,
                code: error.code,
                type: error.type,
            }));
            throw error;
        }
    });
}
function analyzeLabReport(emailBody, attachmentText, messageId, requestId) {
    return __awaiter(this, void 0, void 0, function* () {
        return analyzeLabReportWithClient(emailBody, attachmentText, messageId, openai, prisma, requestId);
    });
}
