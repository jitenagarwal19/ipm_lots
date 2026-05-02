import { Router } from 'express';
import { db } from '../lib/db';

const router = Router();

export function parseJsonField(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function serializeReport(report: any) {
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
    const reports = await db.prisma.labReport.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        test: {
          include: {
            lot: true,
            lab: true,
            test_type: true,
          },
        },
        email: true,
        attachment: true,
        moleculeResults: true,
      },
    });

    res.json(reports.map(serializeReport));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const report = await db.prisma.labReport.findUnique({
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

router.post('/:id/approve', async (req, res) => {
  try {
    const { notes } = req.body || {};

    const report = await db.prisma.labReport.update({
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
      await db.prisma.test.update({
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
