import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { normalizeMoleculeName } from '../services/compliance';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });
const COMPLIANCE_UNIT = 'mg/kg';

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

function jsonSnapshot(value: unknown) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function isMgKg(value: unknown) {
  const unit = optionalString(value) || COMPLIANCE_UNIT;
  return unit.toLowerCase() === COMPLIANCE_UNIT;
}

export function parseAliases(value: unknown) {
  if (typeof value !== 'string') return [];
  return value
    .split(/[;|,]/)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

export async function logComplianceChange(
  client: any,
  profileId: string,
  action: string,
  message: string,
  beforeValue?: unknown,
  afterValue?: unknown
) {
  return client.complianceChangeLog.create({
    data: {
      profile_id: profileId,
      action,
      message,
      before_json: jsonSnapshot(beforeValue),
      after_json: jsonSnapshot(afterValue),
      actor: 'settings_ui',
    },
  });
}

function includeComplianceProfile() {
  return {
    product: true,
    standard: true,
    limits: {
      orderBy: { updatedAt: 'desc' },
      include: { molecule: { include: { aliases: { orderBy: { alias: 'asc' } } } } },
    },
  } as const;
}

async function getComplianceProfileView(profileId: string) {
  const [profile, logs] = await Promise.all([
    prisma.complianceProfile.findUnique({
      where: { id: profileId },
      include: includeComplianceProfile(),
    }),
    prisma.complianceChangeLog.findMany({
      where: { profile_id: profileId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  return profile ? { ...profile, logs } : null;
}

async function findComplianceProfile(productId: string, standardId: string) {
  return prisma.complianceProfile.findFirst({
    where: { product_id: productId, standard_id: standardId },
    include: includeComplianceProfile(),
  });
}

async function ensureProfileForLegacyLimit(client: any, standardId: string, productId: string | null) {
  if (!productId) return null;
  const standard = await client.complianceStandard.findUnique({ where: { id: standardId } });
  if (!standard) return null;
  return client.complianceProfile.upsert({
    where: {
      product_id_standard_id: {
        product_id: productId,
        standard_id: standardId,
      },
    },
    update: {},
    create: {
      product_id: productId,
      standard_id: standardId,
      fallback_limit: standard.fallback_limit,
      fallback_unit: COMPLIANCE_UNIT,
    },
  });
}

async function backfillComplianceProfiles(client: any) {
  const legacyLimits = await client.complianceLimit.findMany({
    where: {
      product_id: { not: null },
      profile_id: null,
    },
    include: { product: true, standard: true },
  });
  const seen = new Set<string>();

  for (const limit of legacyLimits) {
    if (!limit.product_id) continue;
    const key = `${limit.product_id}:${limit.standard_id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const existing = await client.complianceProfile.findFirst({
      where: { product_id: limit.product_id, standard_id: limit.standard_id },
    });
    const profile = existing || await client.complianceProfile.create({
      data: {
        product_id: limit.product_id,
        standard_id: limit.standard_id,
        fallback_limit: limit.standard.fallback_limit,
        fallback_unit: COMPLIANCE_UNIT,
      },
    });

    await client.complianceLimit.updateMany({
      where: {
        product_id: limit.product_id,
        standard_id: limit.standard_id,
        profile_id: null,
      },
      data: { profile_id: profile.id, unit: COMPLIANCE_UNIT },
    });

    if (!existing) {
      await logComplianceChange(client, profile.id, 'PROFILE_BACKFILLED', `Created compliance profile from existing limits for ${limit.product.name} + ${limit.standard.name}.`, null, {
        product_id: limit.product_id,
        standard_id: limit.standard_id,
      });
    }
  }
}

async function upsertProfileLimit(client: any, input: {
  profile_id: string;
  molecule_id: string;
  limit_value: number;
  notes: string | null;
}) {
  const profile = await client.complianceProfile.findUnique({
    where: { id: input.profile_id },
    include: { standard: true, product: true },
  });
  if (!profile) throw new Error('Compliance profile not found.');

  const existing = await client.complianceLimit.findFirst({
    where: { profile_id: profile.id, molecule_id: input.molecule_id },
    include: { molecule: true },
  });
  if (existing) {
    return client.complianceLimit.update({
      where: { id: existing.id },
      data: {
        standard_id: profile.standard_id,
        product_id: profile.product_id,
        limit_value: input.limit_value,
        unit: COMPLIANCE_UNIT,
        notes: input.notes,
      },
      include: { standard: true, molecule: true, product: true },
    });
  }

  return client.complianceLimit.create({
    data: {
      profile_id: profile.id,
      standard_id: profile.standard_id,
      product_id: profile.product_id,
      molecule_id: input.molecule_id,
      limit_value: input.limit_value,
      unit: COMPLIANCE_UNIT,
      notes: input.notes,
    },
    include: { standard: true, molecule: true, product: true },
  });
}

export async function matchCsvMolecule(client: any, row: Record<string, string>) {
  const rawName = requiredString(row.molecule_name || row.molecule, 'molecule_name');
  const casNumber = optionalString(row.cas_number || row.cas);
  if (casNumber) {
    const molecule = await client.molecule.findFirst({
      where: { cas_number: casNumber },
      include: { aliases: { orderBy: { alias: 'asc' } } },
    });
    if (molecule) return { molecule, match_type: 'CAS', confidence: 'high' };
  }

  const normalized = normalizeMoleculeName(rawName);
  const byName = await client.molecule.findUnique({
    where: { normalized_name: normalized },
    include: { aliases: { orderBy: { alias: 'asc' } } },
  });
  if (byName) return { molecule: byName, match_type: 'NAME', confidence: 'high' };

  const alias = await client.moleculeAlias.findUnique({
    where: { normalized_alias: normalized },
    include: { molecule: { include: { aliases: { orderBy: { alias: 'asc' } } } } },
  });
  if (alias?.molecule) return { molecule: alias.molecule, match_type: 'ALIAS', confidence: 'medium' };

  return { molecule: null, match_type: 'NEW', confidence: 'none' };
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
    const molecule = await prisma.molecule.upsert({
      where: { normalized_name: normalizeMoleculeName(name) },
      update: {
        name,
        cas_number: optionalString(req.body.cas_number) || undefined,
        is_active: boolValue(req.body.is_active, true),
      },
      create: {
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

// Compliance profile workflow
router.get('/compliance/profiles', async (req, res) => {
  try {
    await backfillComplianceProfiles(prisma);
    const productId = typeof req.query.product_id === 'string' ? req.query.product_id.trim() : '';
    const standardId = typeof req.query.standard_id === 'string' ? req.query.standard_id.trim() : '';

    if (productId && standardId) {
      const profile = await findComplianceProfile(productId, standardId);
      const logs = profile
        ? await prisma.complianceChangeLog.findMany({
            where: { profile_id: profile.id },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
        : [];
      return res.json({ profile: profile ? { ...profile, logs } : null });
    }

    const profiles = await prisma.complianceProfile.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        product: true,
        standard: true,
        _count: { select: { limits: true } },
      },
    });
    res.json({ profiles });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/compliance/profiles', async (req, res) => {
  try {
    const productId = requiredString(req.body.product_id, 'product_id');
    const standardId = requiredString(req.body.standard_id, 'standard_id');
    const fallbackLimit = req.body.fallback_limit === undefined || req.body.fallback_limit === ''
      ? 0.01
      : numberValue(req.body.fallback_limit, 'fallback_limit');

    const profile = await prisma.$transaction(async (tx) => {
      const existing = await tx.complianceProfile.findFirst({
        where: { product_id: productId, standard_id: standardId },
        include: includeComplianceProfile(),
      });
      if (existing) return existing;

      const created = await tx.complianceProfile.create({
        data: {
          product_id: productId,
          standard_id: standardId,
          fallback_limit: fallbackLimit,
          fallback_unit: COMPLIANCE_UNIT,
        },
        include: includeComplianceProfile(),
      });
      await logComplianceChange(tx, created.id, 'PROFILE_CREATED', `Created compliance profile for ${created.product.name} + ${created.standard.name}.`, null, {
        fallback_limit: created.fallback_limit,
        fallback_unit: created.fallback_unit,
      });
      return created;
    });

    const view = await getComplianceProfileView(profile.id);
    res.json({ profile: view });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/compliance/profiles/:id/default', async (req, res) => {
  try {
    const fallbackLimit = numberValue(req.body.fallback_limit, 'fallback_limit');
    if (!isMgKg(req.body.fallback_unit)) {
      return res.status(400).json({ error: 'Only mg/kg is supported for compliance defaults.' });
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.complianceProfile.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new Error('Compliance profile not found.');
      const updated = await tx.complianceProfile.update({
        where: { id: req.params.id },
        data: { fallback_limit: fallbackLimit, fallback_unit: COMPLIANCE_UNIT },
      });
      await logComplianceChange(tx, existing.id, 'DEFAULT_UPDATED', `Updated default limit to ${fallbackLimit} ${COMPLIANCE_UNIT}.`, {
        fallback_limit: existing.fallback_limit,
        fallback_unit: existing.fallback_unit,
      }, {
        fallback_limit: updated.fallback_limit,
        fallback_unit: updated.fallback_unit,
      });
    });

    res.json({ profile: await getComplianceProfileView(req.params.id) });
  } catch (error: any) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

router.post('/compliance/profiles/:id/limits', async (req, res) => {
  try {
    if (!isMgKg(req.body.unit)) {
      return res.status(400).json({ error: 'Only mg/kg is supported for compliance limits.' });
    }

    await prisma.$transaction(async (tx) => {
      const limit = await upsertProfileLimit(tx, {
        profile_id: req.params.id,
        molecule_id: requiredString(req.body.molecule_id, 'molecule_id'),
        limit_value: numberValue(req.body.limit_value, 'limit_value'),
        notes: optionalString(req.body.notes),
      });
      await logComplianceChange(tx, req.params.id, 'LIMIT_UPSERTED', `Saved ${limit.molecule.name} at ${limit.limit_value} ${COMPLIANCE_UNIT}.`, null, {
        molecule_id: limit.molecule_id,
        limit_value: limit.limit_value,
        unit: limit.unit,
      });
    });

    res.json({ profile: await getComplianceProfileView(req.params.id) });
  } catch (error: any) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

router.put('/compliance/profiles/:id/limits/:limitId', async (req, res) => {
  try {
    if (!isMgKg(req.body.unit)) {
      return res.status(400).json({ error: 'Only mg/kg is supported for compliance limits.' });
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.complianceLimit.findFirst({
        where: { id: req.params.limitId, profile_id: req.params.id },
        include: { molecule: true },
      });
      if (!existing) throw new Error('Compliance limit not found.');
      const updated = await tx.complianceLimit.update({
        where: { id: existing.id },
        data: {
          molecule_id: requiredString(req.body.molecule_id, 'molecule_id'),
          limit_value: numberValue(req.body.limit_value, 'limit_value'),
          unit: COMPLIANCE_UNIT,
          notes: optionalString(req.body.notes),
        },
        include: { molecule: true },
      });
      await logComplianceChange(tx, req.params.id, 'LIMIT_UPDATED', `Updated ${updated.molecule.name} to ${updated.limit_value} ${COMPLIANCE_UNIT}.`, {
        molecule_id: existing.molecule_id,
        limit_value: existing.limit_value,
        unit: existing.unit,
        notes: existing.notes,
      }, {
        molecule_id: updated.molecule_id,
        limit_value: updated.limit_value,
        unit: updated.unit,
        notes: updated.notes,
      });
    });

    res.json({ profile: await getComplianceProfileView(req.params.id) });
  } catch (error: any) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

router.post('/compliance/profiles/:id/import/preview', upload.single('file'), async (req, res) => {
  try {
    const profileId = String(req.params.id);
    const profile = await prisma.complianceProfile.findUnique({ where: { id: profileId } });
    if (!profile) return res.status(404).json({ error: 'Compliance profile not found.' });
    if (!req.file) return res.status(400).json({ error: 'CSV file is required.' });

    const rows = parse(req.file.buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const previewRows = [];
    for (const [idx, row] of rows.entries()) {
      const errors: string[] = [];
      let limitValue: number | null = null;
      let moleculeName = row.molecule_name || row.molecule || '';
      const unit = optionalString(row.unit) || COMPLIANCE_UNIT;

      try {
        moleculeName = requiredString(moleculeName, 'molecule_name');
      } catch (error: any) {
        errors.push(error.message);
      }
      try {
        limitValue = numberValue(row.limit_value || row.limit || row.mrl, 'limit_value');
      } catch (error: any) {
        errors.push(error.message);
      }
      if (unit.toLowerCase() !== COMPLIANCE_UNIT) {
        errors.push(`Unsupported unit "${unit}". Use mg/kg.`);
      }

      let match = { molecule: null, match_type: 'NEW', confidence: 'none' } as any;
      if (moleculeName.trim()) {
        try {
          match = await matchCsvMolecule(prisma, row);
        } catch (error: any) {
          errors.push(error.message);
        }
      }

      previewRows.push({
        row_index: idx,
        row_number: idx + 2,
        molecule_name: moleculeName,
        cas_number: optionalString(row.cas_number || row.cas),
        aliases: parseAliases(row.aliases),
        limit_value: limitValue,
        unit: COMPLIANCE_UNIT,
        notes: optionalString(row.notes),
        matched_molecule: match.molecule,
        match_type: match.match_type,
        confidence: match.confidence,
        action: match.molecule ? 'use_existing' : 'create_new',
        errors,
      });
    }

    res.json({ rows: previewRows });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/compliance/profiles/:id/import/commit', async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ error: 'At least one reviewed row is required.' });

    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.complianceProfile.findUnique({ where: { id: req.params.id }, include: { product: true, standard: true } });
      if (!profile) throw new Error('Compliance profile not found.');

      let imported = 0;
      for (const row of rows) {
        const moleculeName = requiredString(row.molecule_name, 'molecule_name');
        const limitValue = numberValue(row.limit_value, 'limit_value');
        if (!isMgKg(row.unit)) throw new Error(`Only mg/kg is supported for ${moleculeName}.`);

        let molecule = null;
        const action = optionalString(row.action) || 'use_existing';
        if (action === 'create_new') {
          molecule = await tx.molecule.upsert({
            where: { normalized_name: normalizeMoleculeName(moleculeName) },
            update: { cas_number: optionalString(row.cas_number) || undefined },
            create: {
              name: moleculeName,
              normalized_name: normalizeMoleculeName(moleculeName),
              cas_number: optionalString(row.cas_number),
            },
          });
        } else {
          const moleculeId = requiredString(row.molecule_id || row.matched_molecule?.id, 'molecule_id');
          molecule = await tx.molecule.findUnique({ where: { id: moleculeId } });
          if (!molecule) throw new Error(`Molecule not found for ${moleculeName}.`);
        }

        const aliases = new Set<string>(parseAliases(row.aliases));
        if (action === 'map_existing' || (action === 'use_existing' && normalizeMoleculeName(moleculeName) !== molecule.normalized_name)) {
          aliases.add(moleculeName);
        }
        for (const alias of aliases) {
          await tx.moleculeAlias.upsert({
            where: { normalized_alias: normalizeMoleculeName(alias) },
            update: { molecule_id: molecule.id, alias, source: 'compliance_csv' },
            create: { molecule_id: molecule.id, alias, normalized_alias: normalizeMoleculeName(alias), source: 'compliance_csv' },
          });
        }

        await upsertProfileLimit(tx, {
          profile_id: profile.id,
          molecule_id: molecule.id,
          limit_value: limitValue,
          notes: optionalString(row.notes),
        });
        imported++;
      }

      await logComplianceChange(tx, profile.id, 'CSV_IMPORTED', `Imported ${imported} molecule limit${imported === 1 ? '' : 's'} from CSV review.`, null, {
        imported,
      });
      return { imported };
    });

    res.json({ ...result, profile: await getComplianceProfileView(req.params.id) });
  } catch (error: any) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

router.get('/compliance/profiles/:id/logs', async (req, res) => {
  try {
    const logs = await prisma.complianceChangeLog.findMany({
      where: { profile_id: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    const name = requiredString(req.body.name, 'name');
    const fallbackLimit = req.body.fallback_limit === undefined || req.body.fallback_limit === ''
      ? 0.01
      : numberValue(req.body.fallback_limit, 'fallback_limit');
    const fallbackUnit = optionalString(req.body.fallback_unit) || 'mg/kg';
    const standard = await prisma.complianceStandard.upsert({
      where: { code },
      update: {
        name,
        fallback_limit: fallbackLimit,
        fallback_unit: fallbackUnit,
        is_active: boolValue(req.body.is_active, true),
      },
      create: {
        name: requiredString(req.body.name, 'name'),
        code,
        fallback_limit: fallbackLimit,
        fallback_unit: fallbackUnit,
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
  const profile = await ensureProfileForLegacyLimit(prisma, input.standard_id, input.product_id);
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
        profile_id: profile?.id ?? existing.profile_id,
        limit_value: input.limit_value,
        unit: COMPLIANCE_UNIT,
        notes: input.notes,
      },
      include: { standard: true, molecule: true, product: true },
    });
  }
  return prisma.complianceLimit.create({
    data: {
      ...input,
      profile_id: profile?.id ?? null,
      unit: COMPLIANCE_UNIT,
    },
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
        profile_id: (await ensureProfileForLegacyLimit(prisma, requiredString(req.body.standard_id, 'standard_id'), optionalString(req.body.product_id)))?.id ?? null,
        standard_id: requiredString(req.body.standard_id, 'standard_id'),
        molecule_id: requiredString(req.body.molecule_id, 'molecule_id'),
        product_id: optionalString(req.body.product_id),
        limit_value: numberValue(req.body.limit_value, 'limit_value'),
        unit: COMPLIANCE_UNIT,
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
