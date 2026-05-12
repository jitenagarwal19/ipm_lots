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
exports.PROMPT_VERSION = void 0;
exports.buildSectionPrompt = buildSectionPrompt;
exports.normalizeReports = normalizeReports;
exports.analyzeLabReportSection = analyzeLabReportSection;
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const serverLog_1 = require("../lib/serverLog");
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_MAX_TOKENS = Number(process.env.OPENAI_MAX_TOKENS || 8000);
exports.PROMPT_VERSION = "lab-report-v2-detected-only";
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
function buildSectionPrompt(input) {
    const { kind, text, sourceFilename } = input;
    const sourceTag = kind === "body"
        ? "EMAIL BODY"
        : `ATTACHMENT: ${sourceFilename || "unknown.pdf"}`;
    const sourceTypeLiteral = kind === "body" ? "EMAIL_BODY" : "ATTACHMENT";
    const filenameRule = kind === "attachment" && sourceFilename
        ? `- Set "sourceAttachmentFilename" to "${sourceFilename}".`
        : '- Set "sourceAttachmentFilename" to null.';
    return `
You are an AI assistant extracting structured lab-report data from a single ${sourceTag}.

This text may contain zero, one, or many lab reports. Each report covers a distinct lot. Extract each report separately.

Output JSON with EXACTLY this shape, no extra keys:
{
  "reports": [
    {
      "lotNumber": "string or null (must equal metadata.lotNumber)",
      "sourceType": "${sourceTypeLiteral}",
      "sourceAttachmentFilename": "string or null",
      "metadata": {
        "reportId": "string or null",
        "labName": "string or null",
        "lotNumber": "string or null",
        "sampleId": "string or null",
        "sampleName": "string or null",
        "sampleType": "string or null",
        "sampleCondition": "string or null",
        "dateSampleSubmitted": "string or null",
        "dateSampleCollected": "string or null",
        "dateReported": "string or null",
        "clientName": "string or null",
        "labAddress": "string or null",
        "reportStatus": "string or null"
      },
      "results": {
        "summary": "short string",
        "isValid": "boolean or null"
      },
      "extractionQuality": {
        "visibleAnalyteCountEstimate": "number or null",
        "detectedCount": "number",
        "undetectedCount": "number",
        "notes": "string or null"
      },
      "moleculeResults": [
        {
          "moleculeName": "string (exact name)",
          "casNumber": "string or null",
          "result": "string (full result text as shown)",
          "numericResult": "number or null",
          "unit": "string or null",
          "reportingLimit": "string or null",
          "methodDetectionLimit": "string or null",
          "specificationLimit": "string or null",
          "method": "string or null",
          "status": "string or null",
          "isCompliant": "boolean or null",
          "notes": "string or null"
        }
      ],
      "undetectedMolecules": [
        "moleculeName1",
        "moleculeName2"
      ],
      "undetectedSharedDefaults": {
        "result": "string or null",
        "reportingLimit": "string or null",
        "methodDetectionLimit": "string or null",
        "specificationLimit": "string or null",
        "method": "string or null",
        "isCompliant": "boolean or null",
        "notes": "string or null"
      }
    }
  ]
}

Detection rules (CRITICAL):
- "moleculeResults" contains DETECTED analytes ONLY: analytes with a measurable, numeric, or qualitative positive result. Each entry must include the full per-row detail.
- "undetectedMolecules" is a list of NAMES ONLY (strings). Put every analyte reported as Not Detected, ND, BLQ, BDL, "below LOQ", "<LOQ", or any equivalent non-detection result here. No per-row detail.
- If the same reporting/specification limit applies to the whole undetected group, populate "undetectedSharedDefaults" with that shared limit. Otherwise return null fields.
- Never invent a synthetic row like "Other analysed pesticides" or "remaining analytes". Split grouped lists (e.g. "Chlorantraniliprole (0.01), Clothianidin (0.01)") into individual entries in "undetectedMolecules".
- "extractionQuality.detectedCount" must equal moleculeResults.length. "extractionQuality.undetectedCount" must equal undetectedMolecules.length.

Compliance rules (CRITICAL):
- An analyte that was Not Detected (ND/BLQ/BDL/<LOQ/etc.) is ALWAYS compliant. Set "isCompliant": true for any undetected analyte and for "undetectedSharedDefaults".
- For detected analytes, set "isCompliant" by comparing the numeric result against the specification limit when both are available: result <= specification limit -> true, result > specification limit -> false.
- If a detected analyte has no specification limit you can rely on, return null for "isCompliant" instead of guessing.

Limit-column mapping (CRITICAL — do not confuse these three fields):
- "reportingLimit" = the limit of QUANTIFICATION/REPORTING. Pull this from columns labelled "LOQ", "LOR", "RL", "Reporting Limit", "Quantification Limit", "QL". This is typically the smallest value in the row (e.g. 0.01 mg/kg).
- "specificationLimit" = the regulatory / MRL / customer SPECIFICATION the result is judged against. Pull this from columns labelled "Limit", "MRL", "Maximum Residue Limit", "Spec", "Specification", "Standard", "Acceptance Criteria". This is the value that determines pass/fail and is typically larger than the LOQ. If the report shows "Limit" alongside "LOQ", "Limit" is the specificationLimit.
- "methodDetectionLimit" = ONLY use this when the report explicitly labels a column "MDL", "DL", "Method Detection Limit", "Detection Limit". If no such explicit column exists, leave methodDetectionLimit null. Never put an MRL / specification value here.
- A purely numeric column header like "Limit" (with no LOQ/MDL qualifier) maps to specificationLimit, NOT methodDetectionLimit.

Other rules:
- Use null for missing or unclear values. Do not guess.
- Top-level "lotNumber" must equal metadata.lotNumber.
- "sourceType" must be exactly "${sourceTypeLiteral}".
${filenameRule}
- Return an empty "reports" array if no lab report is present in this text.

${sourceTag}:
${text}
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
function analyzeLabReportSection(input_1, messageId_1) {
    return __awaiter(this, arguments, void 0, function* (input, messageId, client = openai, logRepository = prisma, requestId) {
        var _a, _b;
        const trace = requestId !== null && requestId !== void 0 ? requestId : "—";
        const sectionId = `${messageId}#${input.kind}${input.sourceFilename ? `:${input.sourceFilename}` : ''}`;
        const prompt = buildSectionPrompt(input);
        const startedAt = Date.now();
        if (!apiKey && client === openai) {
            const message = "OpenAI API key not configured. Set OPENAI_API_KEY in backend/.env.";
            (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${sectionId}] ${message}`);
            yield saveAiLog(logRepository, sectionId, prompt, JSON.stringify({
                error: message,
                promptVersion: exports.PROMPT_VERSION,
            }));
            throw new Error(message);
        }
        (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${sectionId}] Sending lab report section`, {
            kind: input.kind,
            sourceFilename: (_a = input.sourceFilename) !== null && _a !== void 0 ? _a : null,
            model: OPENAI_MODEL,
            promptVersion: exports.PROMPT_VERSION,
            maxTokens: OPENAI_MAX_TOKENS,
            inputChars: input.text.length,
            promptChars: prompt.length,
            promptPreview: preview(prompt),
        });
        try {
            (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${sectionId}] chat.completions.create: waiting`);
            const response = yield client.chat.completions.create({
                model: OPENAI_MODEL,
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                max_tokens: OPENAI_MAX_TOKENS,
                temperature: 0,
            });
            const choice = response.choices[0];
            const content = choice === null || choice === void 0 ? void 0 : choice.message.content;
            const finishReason = (_b = choice === null || choice === void 0 ? void 0 : choice.finish_reason) !== null && _b !== void 0 ? _b : null;
            if (finishReason === 'length') {
                throw new Error(`OpenAI response truncated (finish_reason=length, max_tokens=${OPENAI_MAX_TOKENS}). Increase OPENAI_MAX_TOKENS or shorten the input.`);
            }
            if (!content)
                throw new Error("No content received from OpenAI");
            (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${sectionId}] Received response`, {
                durationMs: Date.now() - startedAt,
                responseId: response.id,
                responseModel: response.model,
                finishReason,
                usage: response.usage,
                responseChars: content.length,
                responsePreview: preview(content),
            });
            yield saveAiLog(logRepository, sectionId, prompt, content);
            try {
                const parsed = JSON.parse(content);
                const reports = normalizeReports(parsed);
                (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${sectionId}] Parsed reports`, {
                    reportCount: reports.length,
                    lotNumbers: reports.map((r) => { var _a; return (_a = r === null || r === void 0 ? void 0 : r.lotNumber) !== null && _a !== void 0 ? _a : null; }),
                    detectedCounts: reports.map((r) => Array.isArray(r === null || r === void 0 ? void 0 : r.moleculeResults) ? r.moleculeResults.length : 0),
                    undetectedCounts: reports.map((r) => Array.isArray(r === null || r === void 0 ? void 0 : r.undetectedMolecules) ? r.undetectedMolecules.length : 0),
                });
                return reports;
            }
            catch (parseError) {
                (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${sectionId}] Failed to parse JSON`, {
                    error: parseError.message,
                    responsePreview: preview(content),
                });
                throw parseError;
            }
        }
        catch (error) {
            (0, serverLog_1.serverLog)(`[trace=${trace}][OPENAI][${sectionId}] Error analyzing section`, {
                durationMs: Date.now() - startedAt,
                error: error.message,
                name: error.name,
                status: error.status,
                code: error.code,
                type: error.type,
            });
            yield saveAiLog(logRepository, sectionId, prompt, JSON.stringify({
                error: error.message,
                name: error.name,
                status: error.status,
                code: error.code,
                type: error.type,
                promptVersion: exports.PROMPT_VERSION,
            }));
            throw error;
        }
    });
}
