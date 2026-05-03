import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

function parseJsonField(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializeReport(report: any) {
  return {
    ...report,
    metadata: parseJsonField(report.metadata_json),
    results: parseJsonField(report.results_json),
    rawAi: parseJsonField(report.raw_ai_json),
  };
}

router.get('/', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const reports = await prisma.labReport.findMany({
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
      },
    });

    // Unmapped reports have no Test (and therefore no Lot relation), but the
    // AI-extracted `lot_number` may still match a Lot row in the DB. Look it
    // up so the Mapping UI can show product/company/variant.
    const unmappedLotNumbers = Array.from(
      new Set(
        reports
          .filter(r => !r.test_id && r.lot_number)
          .map(r => r.lot_number as string)
      )
    );
    const lotMatches = unmappedLotNumbers.length
      ? await prisma.lot.findMany({
          where: { lot_number: { in: unmappedLotNumbers } },
          include: { product: true, variant: true, company: true },
        })
      : [];
    const lotMatchByNumber = new Map(lotMatches.map(lot => [lot.lot_number, lot]));

    const enriched = reports.map(report => ({
      ...serializeReport(report),
      lotMatch:
        !report.test_id && report.lot_number
          ? lotMatchByNumber.get(report.lot_number) ?? null
          : null,
    }));

    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const report = await prisma.labReport.findUnique({
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/map-to-test', async (req, res) => {
  try {
    const { testId } = req.body || {};
    if (typeof testId !== 'string' || testId.trim().length === 0) {
      return res.status(400).json({ error: 'testId is required.' });
    }

    const report = await prisma.labReport.findUnique({
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

    const test = await prisma.test.findUnique({ where: { id: testId } });
    if (!test) {
      return res.status(404).json({ error: 'Target test not found.' });
    }

    const [updatedReport, updatedTest] = await prisma.$transaction([
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
        data:
          test.status === 'AWAITING_REPORT' || test.status === 'INITIATED'
            ? { status: 'UNDER_REVIEW' }
            : {},
      }),
    ]);

    // Also link the parent Email to the test if (a) it has no test yet,
    // and (b) all sibling lab reports either point at the same test or
    // are still unmapped. Avoids accidentally re-pointing a multi-lot email.
    const siblingReports = await prisma.labReport.findMany({
      where: { email_id: report.email_id },
      select: { id: true, test_id: true },
    });
    const siblingTestIds = new Set(
      siblingReports.map(r => r.test_id).filter((id): id is string => Boolean(id))
    );
    if (siblingTestIds.size === 1) {
      await prisma.email.update({
        where: { id: report.email_id },
        data: { test_id: test.id },
      });
    }

    res.json({ success: true, report: updatedReport, test: updatedTest });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const { notes } = req.body || {};

    const report = await prisma.labReport.update({
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
      await prisma.test.update({
        where: { id: report.test_id },
        data: { status: 'COMPLETED' },
      });
    }

    res.json({ success: true, report });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
