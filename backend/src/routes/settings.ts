import { Router } from 'express';
import { db } from '../lib/db';

const router = Router();

// Labs
router.get('/labs', async (req, res) => {
  const labs = await db.prisma.lab.findMany({
    include: { contacts: true },
  });
  res.json(labs);
});

router.post('/labs', async (req, res) => {
  const { name, is_active, contacts } = req.body;
  if (contacts && contacts.length > 0) {
    const emails = contacts.map((c: any) => c.email.trim().toLowerCase());
    const uniqueEmails = new Set(emails);
    if (uniqueEmails.size !== emails.length) {
      return res.status(400).json({ error: "Duplicate email addresses are not allowed." });
    }
  }
  try {
    const cleanContacts = (contacts || []).map((c: any) => ({
      contact_name: c.contact_name,
      email: c.email,
      is_primary: c.is_primary || false
    }));

    const lab = await db.prisma.lab.create({
      data: { 
        name, 
        is_active,
        contacts: { create: cleanContacts }
      },
      include: { contacts: true }
    });
    res.json(lab);
  } catch (error) {
    console.error("POST /labs error:", error);
    res.status(500).json({ error: "Failed to create lab" });
  }
});

router.put('/labs/:id', async (req, res) => {
  const { id } = req.params;
  const { name, is_active, contacts } = req.body;
  if (contacts && contacts.length > 0) {
    const emails = contacts.map((c: any) => c.email.trim().toLowerCase());
    const uniqueEmails = new Set(emails);
    if (uniqueEmails.size !== emails.length) {
      return res.status(400).json({ error: "Duplicate email addresses are not allowed." });
    }
  }
  try {
    const cleanContacts = (contacts || []).map((c: any) => ({
      contact_name: c.contact_name,
      email: c.email,
      is_primary: c.is_primary || false
    }));

    // Delete old contacts and create new ones
    await db.prisma.labContact.deleteMany({ where: { lab_id: id } });
    const lab = await db.prisma.lab.update({
      where: { id },
      data: {
        name,
        is_active,
        contacts: { create: cleanContacts }
      },
      include: { contacts: true }
    });
    res.json(lab);
  } catch (error) {
    console.error("PUT /labs/:id error:", error);
    res.status(500).json({ error: "Failed to update lab" });
  }
});

// Products
router.get('/products', async (req, res) => {
  const products = await db.prisma.product.findMany();
  res.json(products);
});
router.post('/products', async (req, res) => {
  const product = await db.prisma.product.create({ data: { name: req.body.name } });
  res.json(product);
});
router.put('/products/:id', async (req, res) => {
  const product = await db.prisma.product.update({ where: { id: req.params.id }, data: { name: req.body.name } });
  res.json(product);
});

// Companies
router.get('/companies', async (req, res) => {
  const companies = await db.prisma.company.findMany();
  res.json(companies);
});
router.post('/companies', async (req, res) => {
  const company = await db.prisma.company.create({ data: { name: req.body.name } });
  res.json(company);
});
router.put('/companies/:id', async (req, res) => {
  const company = await db.prisma.company.update({ where: { id: req.params.id }, data: { name: req.body.name } });
  res.json(company);
});

// Test Types
router.get('/test-types', async (req, res) => {
  const testTypes = await db.prisma.testType.findMany();
  res.json(testTypes);
});
router.post('/test-types', async (req, res) => {
  const testType = await db.prisma.testType.create({ data: { name: req.body.name, country_standard: req.body.country_standard } });
  res.json(testType);
});
router.put('/test-types/:id', async (req, res) => {
  const testType = await db.prisma.testType.update({ where: { id: req.params.id }, data: { name: req.body.name, country_standard: req.body.country_standard } });
  res.json(testType);
});

// Variants
router.get('/variants', async (req, res) => {
  const variants = await db.prisma.variant.findMany();
  res.json(variants);
});
router.post('/variants', async (req, res) => {
  const variant = await db.prisma.variant.create({ data: { name: req.body.name } });
  res.json(variant);
});
router.put('/variants/:id', async (req, res) => {
  const variant = await db.prisma.variant.update({ where: { id: req.params.id }, data: { name: req.body.name } });
  res.json(variant);
});

// System Settings
router.get('/system', async (req, res) => {
  const settings = await db.prisma.systemSetting.findMany();
  const settingsMap = settings.reduce((acc: any, s) => {
    acc[s.key] = s.value;
    return acc;
  }, {});
  res.json(settingsMap);
});

router.put('/system/:key', async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  try {
    const setting = await db.prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
    res.json(setting);
  } catch (error) {
    console.error(`PUT /system/${key} error:`, error);
    res.status(500).json({ error: "Failed to update setting" });
  }
});

export default router;
