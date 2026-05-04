import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { normalizeMoleculeName } from '../services/compliance';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function numberValue(value: unknown, field: string) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(n)) {
    throw new Error(`${field} must be a number.`);
  }
  return n;
}

function boolValue(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const v = value.trim().toLowerCase();
  if (['true', 'yes', '1'].includes(v)) return true;
  if (['false', 'no', '0'].includes(v)) return false;
  return fallback;
}

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

// Molecules
router.get('/molecules', async (req, res) => {
  const molecules = await prisma.molecule.findMany({
    orderBy: { name: 'asc' },
    include: { aliases: { orderBy: { alias: 'asc' } } },
  });
  res.json(molecules);
});

router.post('/molecules', async (req, res) => {
  try {
    const name = requiredString(req.body.name, 'name');
    const molecule = await prisma.molecule.create({
      data: {
        name,
        normalized_name: normalizeMoleculeName(name),
        cas_number: optionalString(req.body.cas_number),
        is_active: boolValue(req.body.is_active, true),
      },
      include: { aliases: true },
    });
    res.json(molecule);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/molecules/:id', async (req, res) => {
  try {
    const name = requiredString(req.body.name, 'name');
    const molecule = await prisma.molecule.update({
      where: { id: req.params.id },
      data: {
        name,
        normalized_name: normalizeMoleculeName(name),
        cas_number: optionalString(req.body.cas_number),
        is_active: boolValue(req.body.is_active, true),
      },
      include: { aliases: true },
    });
    res.json(molecule);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Molecule aliases
router.get('/molecule-aliases', async (req, res) => {
  const aliases = await prisma.moleculeAlias.findMany({
    orderBy: { alias: 'asc' },
    include: { molecule: true },
  });
  res.json(aliases);
});

router.post('/molecule-aliases', async (req, res) => {
  try {
    const alias = requiredString(req.body.alias, 'alias');
    const molecule_id = requiredString(req.body.molecule_id, 'molecule_id');
    const created = await prisma.moleculeAlias.create({
      data: {
        molecule_id,
        alias,
        normalized_alias: normalizeMoleculeName(alias),
        source: optionalString(req.body.source),
      },
      include: { molecule: true },
    });
    res.json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/molecule-aliases/:id', async (req, res) => {
  try {
    const alias = requiredString(req.body.alias, 'alias');
    const updated = await prisma.moleculeAlias.update({
      where: { id: req.params.id },
      data: {
        molecule_id: requiredString(req.body.molecule_id, 'molecule_id'),
        alias,
        normalized_alias: normalizeMoleculeName(alias),
        source: optionalString(req.body.source),
      },
      include: { molecule: true },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Compliance standards
router.get('/compliance-standards', async (req, res) => {
  const standards = await prisma.complianceStandard.findMany({ orderBy: { name: 'asc' } });
  res.json(standards);
});

router.post('/compliance-standards', async (req, res) => {
  try {
    const code = requiredString(req.body.code, 'code').toUpperCase();
    const standard = await prisma.complianceStandard.create({
      data: {
        code,
        name: requiredString(req.body.name, 'name'),
        fallback_limit: req.body.fallback_limit === undefined || req.body.fallback_limit === ''
          ? 0.01
          : numberValue(req.body.fallback_limit, 'fallback_limit'),
        fallback_unit: optionalString(req.body.fallback_unit) || 'mg/kg',
        is_active: boolValue(req.body.is_active, true),
      },
    });
    res.json(standard);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/compliance-standards/:id', async (req, res) => {
  try {
    const standard = await prisma.complianceStandard.update({
      where: { id: req.params.id },
      data: {
        code: requiredString(req.body.code, 'code').toUpperCase(),
        name: requiredString(req.body.name, 'name'),
        fallback_limit: numberValue(req.body.fallback_limit, 'fallback_limit'),
        fallback_unit: optionalString(req.body.fallback_unit) || 'mg/kg',
        is_active: boolValue(req.body.is_active, true),
      },
    });
    res.json(standard);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Compliance limits
router.get('/compliance-limits', async (req, res) => {
  const limits = await prisma.complianceLimit.findMany({
    orderBy: [{ updatedAt: 'desc' }],
    include: { standard: true, molecule: true, product: true },
  });
  res.json(limits);
});

async function upsertComplianceLimit(input: {
  standard_id: string;
  molecule_id: string;
  product_id: string | null;
  limit_value: number;
  unit: string;
  notes: string | null;
}) {
  const existing = await prisma.complianceLimit.findFirst({
    where: {
      standard_id: input.standard_id,
      molecule_id: input.molecule_id,
      product_id: input.product_id,
    },
  });
  if (existing) {
    return prisma.complianceLimit.update({
      where: { id: existing.id },
      data: {
        limit_value: input.limit_value,
        unit: input.unit,
        notes: input.notes,
      },
      include: { standard: true, molecule: true, product: true },
    });
  }
  return prisma.complianceLimit.create({
    data: input,
    include: { standard: true, molecule: true, product: true },
  });
}

router.post('/compliance-limits', async (req, res) => {
  try {
    const limit = await upsertComplianceLimit({
      standard_id: requiredString(req.body.standard_id, 'standard_id'),
      molecule_id: requiredString(req.body.molecule_id, 'molecule_id'),
      product_id: optionalString(req.body.product_id),
      limit_value: numberValue(req.body.limit_value, 'limit_value'),
      unit: optionalString(req.body.unit) || 'mg/kg',
      notes: optionalString(req.body.notes),
    });
    res.json(limit);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/compliance-limits/:id', async (req, res) => {
  try {
    const limit = await prisma.complianceLimit.update({
      where: { id: req.params.id },
      data: {
        standard_id: requiredString(req.body.standard_id, 'standard_id'),
        molecule_id: requiredString(req.body.molecule_id, 'molecule_id'),
        product_id: optionalString(req.body.product_id),
        limit_value: numberValue(req.body.limit_value, 'limit_value'),
        unit: optionalString(req.body.unit) || 'mg/kg',
        notes: optionalString(req.body.notes),
      },
      include: { standard: true, molecule: true, product: true },
    });
    res.json(limit);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/compliance-limits/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required.' });
    }

    const rows = parse(req.file.buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const errors: string[] = [];
    let imported = 0;

    for (const [idx, row] of rows.entries()) {
      try {
        const standardCode = requiredString(row.standard_code || row.standard, 'standard_code').toUpperCase();
        const standardName = optionalString(row.standard_name) || standardCode;
        const moleculeName = requiredString(row.molecule_name || row.molecule, 'molecule_name');
        const normalized = normalizeMoleculeName(moleculeName);
        const productName = optionalString(row.product_name || row.product);

        const standard = await prisma.complianceStandard.upsert({
          where: { code: standardCode },
          update: {
            name: standardName,
            fallback_limit: optionalString(row.fallback_limit) ? numberValue(row.fallback_limit, 'fallback_limit') : undefined,
            fallback_unit: optionalString(row.fallback_unit) || undefined,
          },
          create: {
            code: standardCode,
            name: standardName,
            fallback_limit: optionalString(row.fallback_limit) ? numberValue(row.fallback_limit, 'fallback_limit') : 0.01,
            fallback_unit: optionalString(row.fallback_unit) || optionalString(row.unit) || 'mg/kg',
          },
        });

        const molecule = await prisma.molecule.upsert({
          where: { normalized_name: normalized },
          update: { cas_number: optionalString(row.cas_number) || undefined },
          create: {
            name: moleculeName,
            normalized_name: normalized,
            cas_number: optionalString(row.cas_number),
          },
        });

        for (const rawAlias of (row.aliases || '').split(/[;|]/)) {
          const alias = rawAlias.trim();
          if (!alias) continue;
          await prisma.moleculeAlias.upsert({
            where: { normalized_alias: normalizeMoleculeName(alias) },
            update: { molecule_id: molecule.id, alias },
            create: { molecule_id: molecule.id, alias, normalized_alias: normalizeMoleculeName(alias), source: 'csv_import' },
          });
        }

        let product = null;
        if (productName) {
          product = await prisma.product.findFirst({ where: { name: productName } });
          if (!product) {
            product = await prisma.product.create({ data: { name: productName } });
          }
        }

        await upsertComplianceLimit({
          standard_id: standard.id,
          molecule_id: molecule.id,
          product_id: product?.id ?? null,
          limit_value: numberValue(row.limit_value || row.limit || row.mrl, 'limit_value'),
          unit: optionalString(row.unit) || standard.fallback_unit || 'mg/kg',
          notes: optionalString(row.notes),
        });
        imported++;
      } catch (error: any) {
        errors.push(`Row ${idx + 2}: ${error.message}`);
      }
    }

    res.json({ imported, errors });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
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
