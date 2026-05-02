import OpenAI from 'openai';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { serverLog } from '../lib/serverLog';

dotenv.config();

const prisma = new PrismaClient();
const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 180_000);

const openai = new OpenAI({
  apiKey,
});

type OpenAIChatClient = {
  chat: {
    completions: {
      create: (params: {
        model: string;
        messages: { role: "user"; content: string }[];
        response_format: { type: "json_object" };
      }, options?: any) => Promise<{
        id?: string;
        model?: string;
        usage?: unknown;
        choices: {
          finish_reason?: string | null;
          message: { content: string | null };
        }[];
      }>;
    };
  };
};

type AILogRepository = {
  aILog: {
    create: (params: {
      data: {
        message_id: string;
        prompt_sent: string;
        response_received: string;
      };
    }) => Promise<unknown>;
  };
};

function preview(value: string, maxLength = 700) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}... [truncated ${normalized.length - maxLength} chars]`;
}

async function saveAiLog(
  logRepository: AILogRepository,
  messageId: string,
  prompt: string,
  response: string
) {
  try {
    await logRepository.aILog.create({
      data: {
        message_id: messageId,
        prompt_sent: prompt,
        response_received: response,
      }
    });
  } catch (error) {
    serverLog(`[OPENAI][${messageId}] Failed to save AI log:`, error);
  }
}

export function buildAnalyzeLabReportPrompt(emailBody: string, attachmentText: string) {
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

function normalizeReports(parsed: any) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed?.reports)) {
    return parsed.reports;
  }

  if (parsed && typeof parsed === 'object' && ('lotNumber' in parsed || 'metadata' in parsed || 'moleculeResults' in parsed)) {
    return [parsed];
  }

  return [];
}

export async function analyzeLabReportWithClient(
  emailBody: string,
  attachmentText: string,
  messageId: string,
  client: OpenAIChatClient,
  logRepository: AILogRepository,
  requestId?: string
) {
  const trace = requestId ?? "—";
  const prompt = buildAnalyzeLabReportPrompt(emailBody, attachmentText);
  const startedAt = Date.now();

  if (!apiKey && client === openai) {
    const message = "OpenAI API key not configured. Set OPENAI_API_KEY in backend/.env.";
    serverLog(`[trace=${trace}][OPENAI][${messageId}] ${message}`);
    await saveAiLog(logRepository, messageId, prompt, JSON.stringify({ error: message }));
    throw new Error(message);
  }

  serverLog(`[trace=${trace}][OPENAI][${messageId}] Sending lab report analysis request`, {
    model: OPENAI_MODEL,
    emailBodyChars: emailBody.length,
    attachmentTextChars: attachmentText.length,
    promptChars: prompt.length,
    promptPreview: preview(prompt),
  });

  try {
    serverLog(
      `[trace=${trace}][OPENAI][${messageId}] chat.completions.create: waiting (timeout=${OPENAI_TIMEOUT_MS}ms)`
    );
    const response = await client.chat.completions.create(
      {
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      },
      {
        timeout: OPENAI_TIMEOUT_MS,
        maxRetries: 1,
      }
    );

    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("No content received from OpenAI");

    serverLog(`[trace=${trace}][OPENAI][${messageId}] Received lab report analysis response`, {
      durationMs: Date.now() - startedAt,
      responseId: response.id,
      responseModel: response.model,
      finishReason: response.choices[0]?.finish_reason,
      usage: response.usage,
      responseChars: content.length,
      responsePreview: preview(content),
    });

    await saveAiLog(logRepository, messageId, prompt, content);

    try {
      const parsed = JSON.parse(content);
      const reports = normalizeReports(parsed);
      serverLog(`[trace=${trace}][OPENAI][${messageId}] Parsed lab report analysis`, {
        reportCount: reports.length,
        lotNumbers: reports.map((report: any) => report?.lotNumber ?? null),
        moleculeResultCounts: reports.map((report: any) =>
          Array.isArray(report?.moleculeResults) ? report.moleculeResults.length : null
        ),
      });
      return reports;
    } catch (parseError: any) {
      serverLog(`[trace=${trace}][OPENAI][${messageId}] Failed to parse OpenAI JSON response`, {
        error: parseError.message,
        responsePreview: preview(content),
      });
      throw parseError;
    }
  } catch (error: any) {
    serverLog(`[trace=${trace}][OPENAI][${messageId}] Error analyzing lab report`, {
      durationMs: Date.now() - startedAt,
      error: error.message,
      name: error.name,
      status: error.status,
      code: error.code,
      type: error.type,
    });

    await saveAiLog(logRepository, messageId, prompt, JSON.stringify({
      error: error.message,
      name: error.name,
      status: error.status,
      code: error.code,
      type: error.type,
    }));

    throw error;
  }
}

export async function analyzeLabReport(
  emailBody: string,
  attachmentText: string,
  messageId: string,
  requestId?: string
) {
  return analyzeLabReportWithClient(emailBody, attachmentText, messageId, openai, prisma, requestId);
}
