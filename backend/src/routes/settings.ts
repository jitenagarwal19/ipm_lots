import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Labs
router.get('/labs', async (req, res) => {
  const labs = await prisma.lab.findMany({
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

    const lab = await prisma.lab.create({
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
    await prisma.labContact.deleteMany({ where: { lab_id: id } });
    const lab = await prisma.lab.update({
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
  const products = await prisma.product.findMany();
  res.json(products);
});
router.post('/products', async (req, res) => {
  const product = await prisma.product.create({ data: { name: req.body.name } });
  res.json(product);
});
router.put('/products/:id', async (req, res) => {
  const product = await prisma.product.update({ where: { id: req.params.id }, data: { name: req.body.name } });
  res.json(product);
});

// Companies
router.get('/companies', async (req, res) => {
  const companies = await prisma.company.findMany();
  res.json(companies);
});
router.post('/companies', async (req, res) => {
  const company = await prisma.company.create({ data: { name: req.body.name } });
  res.json(company);
});
router.put('/companies/:id', async (req, res) => {
  const company = await prisma.company.update({ where: { id: req.params.id }, data: { name: req.body.name } });
  res.json(company);
});

// Vendors
router.get('/vendors', async (req, res) => {
  const vendors = await prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  res.json(vendors);
});
router.post('/vendors', async (req, res) => {
  const vendor = await prisma.vendor.create({ data: { name: req.body.name } });
  res.json(vendor);
});
router.put('/vendors/:id', async (req, res) => {
  const vendor = await prisma.vendor.update({ where: { id: req.params.id }, data: { name: req.body.name } });
  res.json(vendor);
});

// Staff (sampling)
router.get('/staff', async (req, res) => {
  const staff = await prisma.staff.findMany({ orderBy: { name: 'asc' } });
  res.json(staff);
});
router.post('/staff', async (req, res) => {
  const member = await prisma.staff.create({ data: { name: req.body.name } });
  res.json(member);
});
router.put('/staff/:id', async (req, res) => {
  const member = await prisma.staff.update({ where: { id: req.params.id }, data: { name: req.body.name } });
  res.json(member);
});

// Test Types
router.get('/test-types', async (req, res) => {
  const testTypes = await prisma.testType.findMany();
  res.json(testTypes);
});
router.post('/test-types', async (req, res) => {
  const testType = await prisma.testType.create({ data: { name: req.body.name, country_standard: req.body.country_standard } });
  res.json(testType);
});
router.put('/test-types/:id', async (req, res) => {
  const testType = await prisma.testType.update({ where: { id: req.params.id }, data: { name: req.body.name, country_standard: req.body.country_standard } });
  res.json(testType);
});

// Variants
router.get('/variants', async (req, res) => {
  const variants = await prisma.variant.findMany();
  res.json(variants);
});
router.post('/variants', async (req, res) => {
  const variant = await prisma.variant.create({ data: { name: req.body.name } });
  res.json(variant);
});
router.put('/variants/:id', async (req, res) => {
  const variant = await prisma.variant.update({ where: { id: req.params.id }, data: { name: req.body.name } });
  res.json(variant);
});

// System Settings
router.get('/system', async (req, res) => {
  const settings = await prisma.systemSetting.findMany();
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
    const setting = await prisma.systemSetting.upsert({
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
