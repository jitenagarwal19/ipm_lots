import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all AI Logs
router.get('/', async (req, res) => {
  try {
    const logs = await prisma.aILog.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
