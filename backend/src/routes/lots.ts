import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeReports(parsed: any) {
  if (Array.isArray(parsed?.reports)) return parsed.reports;
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && ('lotNumber' in parsed || 'metadata' in parsed || 'moleculeResults' in parsed)) {
    return [parsed];
  }
  return [];
}

function normalizeFilename(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function inferSourceType(report: any, attachment: any) {
  if (['EMAIL_BODY', 'ATTACHMENT', 'EMAIL_AND_ATTACHMENT'].includes(report?.sourceType)) {
    return report.sourceType;
  }
  return report?.sourceAttachmentFilename || attachment ? 'ATTACHMENT' : 'EMAIL_BODY';
}

function mapMoleculeResult(reportId: string, molecule: any) {
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
    is_detected: typeof molecule?.isDetected === 'boolean' ? molecule.isDetected : null,
    is_compliant: typeof molecule?.isCompliant === 'boolean' ? molecule.isCompliant : null,
    notes: molecule?.notes ?? null,
  };
}

async function backfillReportsFromAiLogs(lotId: string) {
  const tests = await prisma.test.findMany({
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

      const aiLog = await prisma.aILog.findFirst({
        where: { message_id: email.message_id },
        orderBy: { createdAt: 'desc' },
      });

      const reports = normalizeReports(parseJson(aiLog?.response_received ?? null));
      if (reports.length === 0) {
        continue;
      }

      const attachmentsByName = new Map(
        email.attachments.map(attachment => [normalizeFilename(attachment.original_filename), attachment])
      );

      for (const report of reports) {
        const sourceAttachment = attachmentsByName.get(normalizeFilename(report?.sourceAttachmentFilename)) || null;
        const labReport = await prisma.labReport.create({
          data: {
            email_id: email.id,
            test_id: test.id,
            attachment_id: sourceAttachment?.id ?? null,
            lot_number: report?.lotNumber ?? null,
            source_type: inferSourceType(report, sourceAttachment),
            source_attachment_filename: report?.sourceAttachmentFilename ?? sourceAttachment?.original_filename ?? null,
            status: 'PENDING_REVIEW',
            metadata_json: JSON.stringify(report?.metadata ?? null),
            results_json: JSON.stringify(report?.results ?? null),
            raw_ai_json: JSON.stringify(report),
          },
        });

        const moleculeResults = Array.isArray(report?.moleculeResults) ? report.moleculeResults : [];
        if (moleculeResults.length > 0) {
          await prisma.moleculeResult.createMany({
            data: moleculeResults.map((molecule: any) => mapMoleculeResult(labReport.id, molecule)),
          });
        }
      }
    }
  }
}

router.get('/:id', async (req, res) => {
  try {
    await backfillReportsFromAiLogs(req.params.id);

    const lot = await prisma.lot.findUnique({
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
  } catch (error: any) {
    console.error('Error fetching lot:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
