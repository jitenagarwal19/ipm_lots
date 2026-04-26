import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import { getTestRequestEmailTemplate } from '../templates/emailTemplates';
import pdfParse from 'pdf-parse';
import { analyzeLabReport } from './openai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TOKEN_PATH = path.join(__dirname, '../../token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../../credentials.json');

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

    console.log(`[GMAIL SERVICE] Email sent successfully. Thread ID: ${res.data.threadId}`);
    return {
      threadId: res.data.threadId as string,
      messageId: res.data.id as string,
      fromEmail,
      toEmail,
      subject
    };
    
  } catch (error) {
    console.error("[GMAIL SERVICE] Failed to send email:", error);
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
        console.log(`[GMAIL SERVICE] Found PDF reply for thread ${threadId}! Extracting...`);
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
    console.error(`[GMAIL SERVICE] Error polling thread ${threadId}:`, error);
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

  // Construct query like: "label:INBOX OR label:IPM_Report"
  const query = labels.map(l => `label:${l}`).join(' OR ');

  try {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50, // Limit to recent 50
    });

    const messages = res.data.messages || [];
    if (messages.length === 0) return [];

    const detailedMessages = [];
    // Fetch details for each message
    for (const msg of messages) {
      if (!msg.id) continue;
      
      const details = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date']
      });

      const headers = details.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      detailedMessages.push({
        id: msg.id,
        threadId: msg.threadId,
        snippet: details.data.snippet,
        subject,
        from,
        date,
      });
    }

    return detailedMessages;
  } catch (error) {
    console.error("[GMAIL SERVICE] Error fetching tracked emails:", error);
    throw error;
  }
}

export async function processTrackedEmail(messageId: string) {
  const gmail = getGmailClient();
  if (!gmail) throw new Error("Gmail client not configured.");

  // Check if it's already processed
  const existing = await prisma.email.findUnique({ where: { message_id: messageId } });
  if (existing) {
    return { email: existing, status: existing.test_id ? "ALREADY MAPPED" : "ALREADY PROCESSED (UNMAPPED)", analysis: null };
  }

  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });

  const payload = msg.data.payload;
  const headers = payload?.headers || [];
  const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
  const fromEmail = headers.find(h => h.name === 'From')?.value || 'Unknown';
  const dateStr = headers.find(h => h.name === 'Date')?.value || '';

  let bodyText = '';
  let attachmentIds: { id: string, filename: string }[] = [];

  function parseParts(parts: any[]) {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        bodyText += Buffer.from(part.body.data, 'base64').toString('utf8') + '\n';
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
    bodyText = Buffer.from(payload.body.data, 'base64').toString('utf8');
  }

  let fullPdfText = '';
  const savedAttachments = [];

  // Download and parse attachments
  for (const att of attachmentIds) {
    const attRes = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: att.id
    });
    
    if (attRes.data.data) {
      const buffer = Buffer.from(attRes.data.data, 'base64');
      const filename = `${uuidv4()}_${att.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filepath = path.join(__dirname, '../../uploads', filename);
      fs.writeFileSync(filepath, buffer);
      savedAttachments.push({
        file_url: `/uploads/${filename}`,
        file_type: att.filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'unknown'
      });

      if (att.filename.toLowerCase().endsWith('.pdf')) {
        try {
          const pdfData = await pdfParse(buffer);
          fullPdfText += pdfData.text + '\n';
        } catch (e) {
          console.error("Failed to parse PDF:", e);
        }
      }
    }
  }

  // OpenAI Analysis
  const analysis = await analyzeLabReport(bodyText, fullPdfText);
  let testId = null;
  let statusStr = "UNMAPPED";

  if (analysis.lotNumber) {
    // Find the lot
    const lot = await prisma.lot.findUnique({
      where: { lot_number: analysis.lotNumber },
      include: { tests: { where: { status: 'AWAITING_REPORT' }, orderBy: { createdAt: 'desc' } } }
    });

    if (lot && lot.tests.length > 0) {
      const targetTest = lot.tests[0];
      testId = targetTest.id;
      // Update test status
      await prisma.test.update({
        where: { id: testId },
        data: { status: 'PENDING_REVIEW' }
      });
      statusStr = `MAPPED to Lot ${analysis.lotNumber}`;
    }
  }

  let receivedAt = new Date();
  if (dateStr) {
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      receivedAt = parsedDate;
    }
  }

  // Create Email record
  const newEmail = await prisma.email.create({
    data: {
      message_id: messageId,
      thread_id: msg.data.threadId,
      subject,
      body: bodyText,
      from_email: fromEmail,
      direction: 'RECEIVED',
      received_at: receivedAt,
      test_id: testId,
      attachments: {
        create: savedAttachments
      }
    }
  });

  return { email: newEmail, status: statusStr, analysis };
}
