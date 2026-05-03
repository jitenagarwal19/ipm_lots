import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import { getTestRequestEmailTemplate } from '../templates/emailTemplates';
const pdfParse = require('pdf-parse');
import { analyzeLabReportSection } from './openai';
import { pLimit } from '../lib/pLimit';
import { PrismaClient } from '@prisma/client';
import { serverLog } from '../lib/serverLog';

const prisma = new PrismaClient();

const TOKEN_PATH = path.join(__dirname, '../../token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../../credentials.json');
const UPLOADS_PATH = path.join(process.cwd(), 'uploads');
const TRACKED_EMAIL_LIMIT = Number(process.env.TRACKED_EMAIL_LIMIT || 10);
const PROCESSED_GMAIL_LABEL = process.env.PROCESSED_GMAIL_LABEL || 'processed';
const OPENAI_MAX_ATTACHMENT_CHARS = Number(process.env.OPENAI_MAX_ATTACHMENT_CHARS || 45_000);
const OPENAI_SECTION_CONCURRENCY = Number(process.env.OPENAI_SECTION_CONCURRENCY || 10);

const PDF_EXTENSIONS = ['.pdf'];
const BODY_KEYWORD_REGEX = /\b(lot|sample|report|cas|ppm|mg\/?kg|loq|lod|mdl|certificate|analyte|residue|pesticide)\b/i;
const BODY_MIN_CHARS = 200;

const STORAGE_MODE = process.env.STORAGE_MODE || 'local';
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  }
});

async function uploadFile(filename: string, buffer: Buffer, mimeType: string): Promise<string> {
  if (STORAGE_MODE === 's3' && process.env.AWS_S3_BUCKET_NAME) {
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: filename,
      Body: buffer,
      ContentType: mimeType,
    });
    await s3Client.send(command);
    // Returning a format that can be used directly or parsed by the frontend
    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;
  } else {
    fs.mkdirSync(UPLOADS_PATH, { recursive: true });
    const filepath = path.join(UPLOADS_PATH, filename);
    fs.writeFileSync(filepath, buffer);
    return `/uploads/${filename}`;
  }
}

type SavedAttachmentInput = {
  original_filename: string;
  file_url: string;
  file_type: string;
  extracted_text: string | null;
};

function decodeBase64Url(data: string) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function getHeader(headers: any[], name: string) {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function normalizeFilename(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function formatGmailLabelQuery(label: string) {
  const trimmed = label.trim();
  if (/[\s"]/g.test(trimmed)) {
    return `label:"${trimmed.replace(/"/g, '\\"')}"`;
  }
  return `label:${trimmed}`;
}

function inferReportSourceType(report: any, attachment: { extracted_text?: string | null } | null) {
  if (['EMAIL_BODY', 'ATTACHMENT', 'EMAIL_AND_ATTACHMENT'].includes(report?.sourceType)) {
    return report.sourceType;
  }

  const hasAttachmentSource = Boolean(report?.sourceAttachmentFilename || attachment?.extracted_text);
  const hasEmailBodySource = !hasAttachmentSource || Boolean(report?.sourceIncludesEmailBody);

  if (hasAttachmentSource && hasEmailBodySource) return 'EMAIL_AND_ATTACHMENT';
  if (hasAttachmentSource) return 'ATTACHMENT';
  return 'EMAIL_BODY';
}

export function isPdfAttachment(filename: string | null | undefined) {
  const lower = (filename || '').toLowerCase();
  return PDF_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Cheap precheck: only call OpenAI on the email body when it has enough
 * substance to plausibly contain report data. Filters out the common
 * "Please find attached" two-liners.
 */
export function shouldAnalyzeEmailBody(bodyText: string): boolean {
  const trimmed = (bodyText || '').trim();
  if (trimmed.length < BODY_MIN_CHARS) return false;
  return BODY_KEYWORD_REGEX.test(trimmed);
}

/**
 * Stable, lossless union-merge of two report objects describing the SAME lot.
 *
 * Strategy:
 *  - Scalars (lotNumber, sourceType, sourceAttachmentFilename, lab metadata fields):
 *    prefer the first non-null/non-empty value (existing wins, incoming fills gaps).
 *  - moleculeResults: union by moleculeName (case-insensitive), preserving order.
 *  - undetectedMolecules: union by name (case-insensitive).
 *  - undetectedSharedDefaults: deep-merge with existing winning on conflict.
 *
 * Rationale: PDF attachments usually carry the authoritative table; the
 * email body may add a summary/clientName/reportStatus the PDF lacks. Union
 * keeps both views without dropping data.
 */
export function mergeReportsForSameLot(existing: any, incoming: any): any {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const merged: any = { ...existing };

  const fillScalars = (target: any, source: any) => {
    if (!source) return;
    for (const [key, value] of Object.entries(source)) {
      const current = target[key];
      const isEmpty =
        current === undefined ||
        current === null ||
        (typeof current === 'string' && current.trim() === '');
      if (isEmpty && value !== undefined) {
        target[key] = value;
      }
    }
  };

  fillScalars(merged, {
    lotNumber: incoming.lotNumber,
    sourceType: incoming.sourceType,
    sourceAttachmentFilename: incoming.sourceAttachmentFilename,
  });

  merged.metadata = { ...(incoming.metadata || {}), ...(existing.metadata || {}) };
  fillScalars(merged.metadata, incoming.metadata || {});

  if (!merged.results || (typeof merged.results === 'object' && Object.keys(merged.results).length === 0)) {
    merged.results = incoming.results ?? merged.results ?? null;
  }

  const detectedMap = new Map<string, any>();
  for (const m of [
    ...(Array.isArray(existing.moleculeResults) ? existing.moleculeResults : []),
    ...(Array.isArray(incoming.moleculeResults) ? incoming.moleculeResults : []),
  ]) {
    const key = String(m?.moleculeName ?? m?.name ?? '').trim().toLowerCase();
    if (!key) continue;
    if (!detectedMap.has(key)) detectedMap.set(key, m);
  }
  merged.moleculeResults = Array.from(detectedMap.values());

  const undetectedSet = new Map<string, string>();
  for (const name of [
    ...(Array.isArray(existing.undetectedMolecules) ? existing.undetectedMolecules : []),
    ...(Array.isArray(incoming.undetectedMolecules) ? incoming.undetectedMolecules : []),
  ]) {
    const display = String(name || '').trim();
    if (!display) continue;
    const key = display.toLowerCase();
    if (!undetectedSet.has(key)) undetectedSet.set(key, display);
  }
  merged.undetectedMolecules = Array.from(undetectedSet.values());

  merged.undetectedSharedDefaults = {
    ...(incoming.undetectedSharedDefaults || {}),
    ...(existing.undetectedSharedDefaults || {}),
  };

  return merged;
}

/**
 * Union-merge a flat list of reports by lotNumber (case-insensitive).
 * Reports without a lotNumber are kept as-is (no merging).
 */
export function unionMergeReportsByLot(reports: any[]): any[] {
  const byLot = new Map<string, any>();
  const noLot: any[] = [];

  for (const report of reports) {
    const lot = String(report?.lotNumber ?? '').trim();
    if (!lot) {
      noLot.push(report);
      continue;
    }
    const key = lot.toLowerCase();
    const existing = byLot.get(key);
    byLot.set(key, existing ? mergeReportsForSameLot(existing, report) : report);
  }

  return [...byLot.values(), ...noLot];
}

/**
 * Expand the compact "undetectedMolecules + undetectedSharedDefaults" pair
 * back into individual MoleculeResult-shaped rows so the existing DB schema
 * (one row per analyte) keeps working unchanged.
 */
export function expandUndetectedMolecules(report: any): any[] {
  const names: any[] = Array.isArray(report?.undetectedMolecules) ? report.undetectedMolecules : [];
  if (names.length === 0) return [];

  const shared = report?.undetectedSharedDefaults || {};
  return names
    .map(name => {
      const moleculeName = typeof name === 'string'
        ? name.trim()
        : String(name?.moleculeName || name?.name || '').trim();
      if (!moleculeName) return null;
      return {
        moleculeName,
        casNumber: typeof name === 'object' ? name?.casNumber ?? null : null,
        result: shared.result ?? 'Not Detected',
        numericResult: null,
        unit: shared.unit ?? null,
        reportingLimit: shared.reportingLimit ?? null,
        methodDetectionLimit: shared.methodDetectionLimit ?? null,
        specificationLimit: shared.specificationLimit ?? null,
        method: shared.method ?? null,
        status: shared.result ?? 'Not Detected',
        isDetected: false,
        isCompliant: typeof shared.isCompliant === 'boolean' ? shared.isCompliant : null,
        notes: shared.notes ?? null,
      };
    })
    .filter(Boolean);
}

function mapMoleculeResult(reportId: string, molecule: any, isDetectedFallback: boolean | null = null) {
  return {
    lab_report_id: reportId,
    molecule_name: String(molecule?.moleculeName || molecule?.name || 'Unknown molecule'),
    cas_number: molecule?.casNumber ?? null,
    result: molecule?.result ?? null,
    numeric_result: typeof molecule?.numericResult === 'number' ? molecule.numericResult : null,
    unit: molecule?.unit ?? null,
    reporting_limit: molecule?.reportingLimit ?? null,
    method_detection_limit: molecule?.methodDetectionLimit ?? null,
    specification_limit: molecule?.specificationLimit ?? null,
    method: molecule?.method ?? null,
    status: molecule?.status ?? null,
    is_detected: typeof molecule?.isDetected === 'boolean' ? molecule.isDetected : isDetectedFallback,
    is_compliant: typeof molecule?.isCompliant === 'boolean' ? molecule.isCompliant : null,
    notes: molecule?.notes ?? null,
  };
}

async function getOrCreateGmailLabelId(gmail: any, labelName: string) {
  const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
  const existingLabel = (labelsResponse.data.labels || []).find(
    (label: any) => label.name?.toLowerCase() === labelName.toLowerCase()
  );

  if (existingLabel?.id) {
    return existingLabel.id;
  }

  const createdLabel = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: labelName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });

  return createdLabel.data.id;
}

async function applyProcessedLabel(gmail: any, messageId: string) {
  const labelId = await getOrCreateGmailLabelId(gmail, PROCESSED_GMAIL_LABEL);
  if (!labelId) {
    throw new Error(`Could not create or find Gmail label "${PROCESSED_GMAIL_LABEL}".`);
  }

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: [labelId],
    },
  });
}

type PdfParser = (buffer: Buffer) => Promise<{ text?: string }>;

export async function extractPdfText(
  filename: string,
  buffer: Buffer,
  parser: PdfParser = pdfParse
) {
  if (!filename.toLowerCase().endsWith('.pdf')) {
    return '';
  }

  try {
    const pdfData = await parser(buffer);
    return `${pdfData.text || ''}\n`;
  } catch (e) {
    serverLog("Failed to parse PDF:", e);
    return '';
  }
}

// Initialize the Gmail API Client
function getGmailClient() {
  if (!fs.existsSync(CREDENTIALS_PATH) || !fs.existsSync(TOKEN_PATH)) {
    return null;
  }
  
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  
  const redirect_uri = (redirect_uris && redirect_uris.length > 0) ? redirect_uris[0] : 'http://localhost';
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);
  const token = fs.readFileSync(TOKEN_PATH, 'utf8');
  oAuth2Client.setCredentials(JSON.parse(token));
  
  return google.gmail({ version: 'v1', auth: oAuth2Client });
}

// Helper to create a base64url encoded MIME email
function makeEmail(to: string, from: string, subject: string, body: string) {
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

export async function sendTestRequestEmail(testId: string, lotNumber: string, labName: string, toEmail: string) {
  const gmail = getGmailClient();
  
  if (!gmail) {
    throw new Error("Gmail client not configured. Missing credentials.json or token.json");
  }

  try {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const fromEmail = profile.data.emailAddress || 'me';
    
    const subject = `IPM Test Request - Lot: ${lotNumber}`;
    const htmlBody = getTestRequestEmailTemplate(lotNumber, labName, testId);

    const rawMessage = makeEmail(toEmail, fromEmail, subject, htmlBody);
    
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
      },
    });

    serverLog(`[GMAIL SERVICE] Email sent successfully. Thread ID: ${res.data.threadId}`);
    return {
      threadId: res.data.threadId as string,
      messageId: res.data.id as string,
      fromEmail,
      toEmail,
      subject
    };
    
  } catch (error) {
    serverLog("[GMAIL SERVICE] Failed to send email:", error);
    throw error;
  }
}

export async function pollForReplies(threadId: string) {
  const gmail = getGmailClient();
  if (!gmail) {
    throw new Error("Gmail client not configured. Missing credentials.json or token.json");
  }

  try {
    // Fetch the thread
    const res = await gmail.users.threads.get({
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
      
      const parts = latestMessage.payload?.parts || [];
      for (const part of parts) {
        if (part.filename && part.filename.endsWith('.pdf') && part.body?.attachmentId) {
          attachmentId = part.body.attachmentId;
          filename = part.filename;
          break;
        }
      }
      
      if (attachmentId) {
        serverLog(`[GMAIL SERVICE] Found PDF reply for thread ${threadId}! Extracting...`);
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
  } catch (error) {
    serverLog(`[GMAIL SERVICE] Error polling thread ${threadId}:`, error);
    return { hasReply: false };
  }
}

export async function getTrackedEmailsFromGmail(labels: string[]) {
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
  serverLog("[GMAIL SERVICE] Fetching tracked emails", {
    labels,
    query,
    limit: TRACKED_EMAIL_LIMIT,
  });

  try {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: TRACKED_EMAIL_LIMIT,
      fields: 'messages(id,threadId),resultSizeEstimate',
    });

    const messages = res.data.messages || [];
    if (messages.length === 0) return [];

    const messageIds = messages.map(m => m.id).filter(Boolean) as string[];
    const existingEmails = await prisma.email.findMany({
      where: { message_id: { in: messageIds } },
      select: { message_id: true }
    });
    const processedIds = new Set(existingEmails.map(e => e.message_id));

    const messagesWithIds = messages.filter((msg): msg is { id: string; threadId?: string | null } => Boolean(msg.id));
    const detailedMessages = await Promise.all(messagesWithIds.map(async (msg) => {
      
      const details = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
        fields: 'id,threadId,snippet,payload(headers,parts)',
      });

      const payload = details.data.payload;
      const headers = payload?.headers || [];
      const subject = getHeader(headers, 'Subject') || 'No Subject';
      const from = getHeader(headers, 'From') || 'Unknown';
      const date = getHeader(headers, 'Date');

      let attachments: { filename: string }[] = [];
      function parsePartsForMetadata(parts: any[]) {
        for (const part of parts) {
          if (part.filename && part.body?.attachmentId) {
            attachments.push({ filename: part.filename });
          }
          if (part.parts) {
            parsePartsForMetadata(part.parts);
          }
        }
      }

      if (payload?.parts) {
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
    }));

    serverLog("[GMAIL SERVICE] Fetched tracked emails", {
      count: detailedMessages.length,
      durationMs: Date.now() - startedAt,
    });

    return detailedMessages;
  } catch (error) {
    serverLog("[GMAIL SERVICE] Error fetching tracked emails:", error);
    throw error;
  }
}

export async function processTrackedEmail(
  messageId: string,
  opts?: { requestId?: string }
) {
  const trace = opts?.requestId ?? "—";
  const processStartedAt = Date.now();
  const timings: Record<string, number> = {};
  const gmail = getGmailClient();
  if (!gmail) throw new Error("Gmail client not configured.");

  // Check if it's already processed
  let stepStartedAt = Date.now();
  const existing = await prisma.email.findUnique({
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
      await applyProcessedLabel(gmail, messageId);
      processedLabelApplied = true;
    } catch (error: any) {
      processedLabelError = error.message || 'Failed to apply processed Gmail label.';
      serverLog(`[trace=${trace}][GMAIL SERVICE][${messageId}] Failed to apply processed label to already processed email`, error);
    }

    return {
      email: existing,
      status:
        existing.test_id || existing.labReports.some(r => Boolean(r.test_id))
          ? "ALREADY MAPPED"
          : "ALREADY PROCESSED (UNMAPPED)",
      analysis: null,
      timings,
      processedLabelApplied,
      processedLabelError,
    };
  }

  stepStartedAt = Date.now();
  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });
  timings.gmailMessageFetchMs = Date.now() - stepStartedAt;

  stepStartedAt = Date.now();
  const payload = msg.data.payload;
  const headers = payload?.headers || [];
  const subject = getHeader(headers, 'Subject') || 'No Subject';
  const fromEmail = getHeader(headers, 'From') || 'Unknown';
  const dateStr = getHeader(headers, 'Date');

  serverLog(`[trace=${trace}][GMAIL SERVICE][${messageId}] Processing tracked email`, {
    threadId: msg.data.threadId,
    subject,
    fromEmail,
    date: dateStr || null,
  });

  let bodyText = '';
  let attachmentIds: { id: string, filename: string }[] = [];

  function parseParts(parts: any[]) {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        bodyText += decodeBase64Url(part.body.data).toString('utf8') + '\n';
      } else if (part.filename && part.body?.attachmentId) {
        attachmentIds.push({ id: part.body.attachmentId, filename: part.filename });
      }
      if (part.parts) {
        parseParts(part.parts);
      }
    }
  }

  if (payload?.parts) {
    parseParts(payload.parts);
  } else if (payload?.body?.data) {
    bodyText = decodeBase64Url(payload.body.data).toString('utf8');
  }
  timings.payloadParseMs = Date.now() - stepStartedAt;

  serverLog(`[trace=${trace}][GMAIL SERVICE][${messageId}] Parsed email payload`, {
    bodyChars: bodyText.length,
    attachmentCount: attachmentIds.length,
    attachmentFilenames: attachmentIds.map(att => att.filename),
  });

  const pdfSections: { filename: string; text: string }[] = [];
  const savedAttachments: SavedAttachmentInput[] = [];
  let skippedNonPdfAttachments = 0;

  // Download and parse attachments. Image / non-PDF attachments are saved
  // for reference but excluded from OpenAI analysis (they have no text and
  // would just waste tokens / time).
  stepStartedAt = Date.now();
  for (const att of attachmentIds) {
    const attRes = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: att.id
    });

    if (!attRes.data.data) continue;

    const buffer = decodeBase64Url(attRes.data.data);
    const filename = `${uuidv4()}_${att.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const isPdf = isPdfAttachment(att.filename);
    const mimeType = isPdf ? 'application/pdf' : 'application/octet-stream';
    const fileUrl = await uploadFile(filename, buffer, mimeType);

    serverLog(`[trace=${trace}][GMAIL SERVICE][${messageId}] Saved attachment to ${STORAGE_MODE}`, {
      originalFilename: att.filename,
      savedFilename: filename,
      bytes: buffer.length,
      url: fileUrl,
      pdf: isPdf,
    });

    if (!isPdf) {
      skippedNonPdfAttachments += 1;
      savedAttachments.push({
        original_filename: att.filename,
        file_url: fileUrl,
        file_type: mimeType,
        extracted_text: null,
      });
      continue;
    }

    const extractedText = await extractPdfText(att.filename, buffer);
    savedAttachments.push({
      original_filename: att.filename,
      file_url: fileUrl,
      file_type: mimeType,
      extracted_text: extractedText.trim() || null,
    });

    if (extractedText.trim()) {
      const trimmedText = extractedText.trim();
      const truncated = trimmedText.length > OPENAI_MAX_ATTACHMENT_CHARS
        ? `${trimmedText.slice(0, OPENAI_MAX_ATTACHMENT_CHARS)}\n\n[TRUNCATED attachment text: ${trimmedText.length - OPENAI_MAX_ATTACHMENT_CHARS} chars removed]`
        : trimmedText;
      pdfSections.push({ filename: att.filename, text: truncated });
      if (truncated.length !== trimmedText.length) {
        serverLog(
          `[trace=${trace}][PROCESS][${messageId}] attachment text truncated for OpenAI: file=${att.filename} raw=${trimmedText.length} sent=${truncated.length}`
        );
      }
    }
  }
  timings.attachmentProcessingMs = Date.now() - stepStartedAt;

  serverLog(`[trace=${trace}][PROCESS][${messageId}] attachments done in ${timings.attachmentProcessingMs}ms`, {
    bodyChars: bodyText.length,
    pdfReportSectionCount: pdfSections.length,
    skippedNonPdfAttachments,
    savedAttachmentCount: savedAttachments.length,
  });

  // OpenAI Analysis: dedicated body call (gated by precheck) + one call per
  // PDF attachment, all run in parallel with a concurrency cap. Per-section
  // failures are logged but do NOT abort the email — other sections still
  // produce reports.
  const sectionLimit = pLimit(OPENAI_SECTION_CONCURRENCY);
  const wantsBodyCall = shouldAnalyzeEmailBody(bodyText);

  type SectionRun =
    | { kind: 'body'; reports: any[]; durationMs: number; error?: string }
    | { kind: 'attachment'; filename: string; reports: any[]; durationMs: number; error?: string };

  const sectionResults: SectionRun[] = [];

  if (!wantsBodyCall) {
    serverLog(
      `[trace=${trace}][PROCESS][${messageId}] body precheck skipped OpenAI call (chars=${bodyText.trim().length}, hasKeyword=${BODY_KEYWORD_REGEX.test(bodyText)})`
    );
  } else {
    serverLog(`[trace=${trace}][PROCESS][${messageId}] body precheck queued: chars=${bodyText.trim().length}`);
  }

  serverLog(
    `[trace=${trace}][PROCESS][${messageId}] OpenAI: starting ${wantsBodyCall ? 1 : 0} body + ${pdfSections.length} attachment sections (concurrency=${OPENAI_SECTION_CONCURRENCY})`
  );

  const sectionPromises: Promise<void>[] = [];

  if (wantsBodyCall) {
    sectionPromises.push(
      sectionLimit(async () => {
        const sectionStart = Date.now();
        try {
          const reports = await analyzeLabReportSection(
            { kind: 'body', text: bodyText },
            messageId,
            undefined,
            undefined,
            trace
          );
          sectionResults.push({
            kind: 'body',
            reports,
            durationMs: Date.now() - sectionStart,
          });
          serverLog(
            `[trace=${trace}][PROCESS][${messageId}] section body: ${reports.length} report(s) in ${Date.now() - sectionStart}ms`
          );
        } catch (error: any) {
          sectionResults.push({
            kind: 'body',
            reports: [],
            durationMs: Date.now() - sectionStart,
            error: error?.message || String(error),
          });
          serverLog(
            `[trace=${trace}][PROCESS][${messageId}] section body FAILED in ${Date.now() - sectionStart}ms: ${error?.message ?? error}`
          );
        }
      })
    );
  }

  pdfSections.forEach((section, index) => {
    sectionPromises.push(
      sectionLimit(async () => {
        const sectionStart = Date.now();
        try {
          const reports = await analyzeLabReportSection(
            { kind: 'attachment', text: section.text, sourceFilename: section.filename },
            messageId,
            undefined,
            undefined,
            trace
          );
          sectionResults.push({
            kind: 'attachment',
            filename: section.filename,
            reports,
            durationMs: Date.now() - sectionStart,
          });
          serverLog(
            `[trace=${trace}][PROCESS][${messageId}] section attachment ${index + 1}/${pdfSections.length} (${section.filename}): ${reports.length} report(s) in ${Date.now() - sectionStart}ms`
          );
        } catch (error: any) {
          sectionResults.push({
            kind: 'attachment',
            filename: section.filename,
            reports: [],
            durationMs: Date.now() - sectionStart,
            error: error?.message || String(error),
          });
          serverLog(
            `[trace=${trace}][PROCESS][${messageId}] section attachment ${index + 1}/${pdfSections.length} (${section.filename}) FAILED in ${Date.now() - sectionStart}ms: ${error?.message ?? error}`
          );
        }
      })
    );
  });

  stepStartedAt = Date.now();
  await Promise.allSettled(sectionPromises);
  timings.openAiMs = Date.now() - stepStartedAt;

  const allReports = sectionResults.flatMap(s => s.reports);
  const reports = unionMergeReportsByLot(allReports);

  const sectionsBreakdown = sectionResults.map(s =>
    s.kind === 'body'
      ? { kind: 'body', reports: s.reports.length, durationMs: s.durationMs, error: s.error ?? null }
      : { kind: 'attachment', filename: s.filename, reports: s.reports.length, durationMs: s.durationMs, error: s.error ?? null }
  );
  const sectionFailures = sectionResults.filter(s => s.error).length;

  serverLog(
    `[trace=${trace}][PROCESS][${messageId}] OpenAI: finished in ${timings.openAiMs}ms (sections=${sectionResults.length}, failures=${sectionFailures}, reportsBeforeMerge=${allReports.length}, reportsAfterMerge=${reports.length})`,
    {
      lotNumbers: reports.map((report: any) => report?.lotNumber ?? null),
      sectionsBreakdown,
    }
  );
  let statusStr = "UNMAPPED";
  const mappedReports: { lotNumber: string; testId: string; reportId: string | null }[] = [];
  const reportMatches: {
    report: any;
    testId: string | null;
    lotNumber: string | null;
    reportId: string | null;
  }[] = [];

  stepStartedAt = Date.now();
  let reportIndex = 0;
  for (const report of reports) {
    reportIndex += 1;
    let matchedTestId = null;
    if (!report?.lotNumber) {
      serverLog(`[trace=${trace}][PROCESS][${messageId}] map ${reportIndex}/${reports.length}: no lotNumber in AI output, skipping DB lookup`);
      reportMatches.push({
        report,
        testId: null,
        lotNumber: null,
        reportId: report?.metadata?.reportId ?? null,
      });
      continue;
    }

    // Find the lot
    serverLog(`[trace=${trace}][PROCESS][${messageId}] map ${reportIndex}/${reports.length}: lookup lot_number=${report.lotNumber}`);
    const lot = await prisma.lot.findUnique({
      where: { lot_number: report.lotNumber },
      include: { tests: { where: { status: 'AWAITING_REPORT' }, orderBy: { createdAt: 'desc' } } }
    });

    if (lot && lot.tests.length > 0) {
      const targetTest = lot.tests[0];
      matchedTestId = targetTest.id;
      // Update test status
      await prisma.test.update({
        where: { id: targetTest.id },
        data: { status: 'UNDER_REVIEW' }
      });
      mappedReports.push({
        lotNumber: report.lotNumber,
        testId: targetTest.id,
        reportId: report?.metadata?.reportId ?? null,
      });
      serverLog(`[trace=${trace}][PROCESS][${messageId}] map ${reportIndex}/${reports.length}: matched test ${targetTest.id} for lot ${report.lotNumber}`);
    } else {
      serverLog(`[trace=${trace}][PROCESS][${messageId}] map ${reportIndex}/${reports.length}: no AWAITING_REPORT test for lot ${report.lotNumber} (lot exists: ${Boolean(lot)})`);
    }

    reportMatches.push({
      report,
      testId: matchedTestId,
      lotNumber: report.lotNumber ?? null,
      reportId: report?.metadata?.reportId ?? null,
    });
  }
  timings.mappingMs = Date.now() - stepStartedAt;
  serverLog(`[trace=${trace}][PROCESS][${messageId}] mapping phase done in ${timings.mappingMs}ms (${reports.length} AI reports)`);

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
  const newEmail = await prisma.email.create({
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
  serverLog(`[trace=${trace}][PROCESS][${messageId}] saved Email row in ${timings.emailSaveMs}ms id=${newEmail.id}`);

  const attachmentsByOriginalName = new Map(
    newEmail.attachments.map(attachment => [normalizeFilename(attachment.original_filename), attachment])
  );

  stepStartedAt = Date.now();
  let saveIndex = 0;
  for (const match of reportMatches) {
    saveIndex += 1;
    const detectedMolecules = Array.isArray(match.report?.moleculeResults)
      ? match.report.moleculeResults
      : [];
    const expandedUndetected = expandUndetectedMolecules(match.report);
    const totalMoleculeRows = detectedMolecules.length + expandedUndetected.length;

    serverLog(
      `[trace=${trace}][PROCESS][${messageId}] save ${saveIndex}/${reportMatches.length}: LabReport lot=${match.lotNumber ?? '—'} testId=${match.testId ?? '—'} detected=${detectedMolecules.length} undetected=${expandedUndetected.length}`
    );
    const sourceAttachment = attachmentsByOriginalName.get(
      normalizeFilename(match.report?.sourceAttachmentFilename)
    ) || null;

    const labReport = await prisma.labReport.create({
      data: {
        email_id: newEmail.id,
        test_id: match.testId,
        attachment_id: sourceAttachment?.id ?? null,
        lot_number: match.lotNumber,
        source_type: inferReportSourceType(match.report, sourceAttachment),
        source_attachment_filename: match.report?.sourceAttachmentFilename ?? sourceAttachment?.original_filename ?? null,
        status: match.testId ? 'PENDING_REVIEW' : 'UNMAPPED',
        metadata_json: stringifyJson(match.report?.metadata ?? null),
        results_json: stringifyJson(match.report?.results ?? null),
        raw_ai_json: stringifyJson(match.report),
      },
    });

    if (totalMoleculeRows > 0) {
      await prisma.moleculeResult.createMany({
        data: [
          ...detectedMolecules.map((molecule: any) => mapMoleculeResult(labReport.id, molecule, true)),
          ...expandedUndetected.map((molecule: any) => mapMoleculeResult(labReport.id, molecule, false)),
        ],
      });
      serverLog(
        `[trace=${trace}][PROCESS][${messageId}] save ${saveIndex}/${reportMatches.length}: inserted ${totalMoleculeRows} MoleculeResult rows (detected=${detectedMolecules.length}, undetected=${expandedUndetected.length}) for labReport ${labReport.id}`
      );
    }
  }
  timings.reportSaveMs = Date.now() - stepStartedAt;
  serverLog(`[trace=${trace}][PROCESS][${messageId}] report save phase done in ${timings.reportSaveMs}ms`);

  let processedLabelApplied = false;
  let processedLabelError = null;

  stepStartedAt = Date.now();
  try {
    await applyProcessedLabel(gmail, messageId);
    processedLabelApplied = true;
  } catch (error: any) {
    processedLabelError = error.message || 'Failed to apply processed Gmail label.';
    serverLog(`[trace=${trace}][GMAIL SERVICE][${messageId}] Failed to apply processed label`, error);
  }
  timings.processedLabelMs = Date.now() - stepStartedAt;
  timings.totalMs = Date.now() - processStartedAt;

  serverLog(`[trace=${trace}][GMAIL SERVICE][${messageId}] Processing timing breakdown`, {
    ...timings,
    processedLabelApplied,
    processedLabelError,
  });

  return {
    email: newEmail,
    status: statusStr,
    analysis: reports,
    mappedReports,
    timings,
    sectionsBreakdown,
    sectionFailures,
    skippedNonPdfAttachments,
    processedLabelApplied,
    processedLabelError,
  };
}
