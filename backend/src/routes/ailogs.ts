import { Router } from 'express';
import { db } from '../lib/db';

const router = Router();

// Get all AI Logs
router.get('/', async (req, res) => {
  try {
    const logs = await db.prisma.aILog.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
