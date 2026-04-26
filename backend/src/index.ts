import express from 'express';
import cors from 'cors';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Routes
import settingsRoutes from './routes/settings';
import testsRoutes from './routes/tests';
import webhooksRoutes from './routes/webhooks';
import emailRoutes from './routes/emails';

app.use('/api/settings', settingsRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/emails', emailRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

export { prisma };
