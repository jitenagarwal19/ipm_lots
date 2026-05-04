const DEFAULT_FALLBACK_LIMIT = 0.01;
const DEFAULT_UNIT = 'mg/kg';

export function normalizeMoleculeName(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isDetectedMolecule(molecule: any) {
  if (molecule?.is_detected === true) return true;
  if (molecule?.is_detected === false) return false;
  const combined = `${molecule?.status || ''} ${molecule?.result || ''}`.toLowerCase();
  if (combined.includes('not detected') || combined.includes('non detect') || /\bnd\b/.test(combined)) {
    return false;
  }
  return combined.includes('detected') || /\d/.test(combined);
}

async function findMoleculeForResult(client: any, moleculeResult: any) {
  if (moleculeResult.molecule_id) {
    const linked = await client.molecule.findUnique({ where: { id: moleculeResult.molecule_id } });
    if (linked) return linked;
  }

  const cas = typeof moleculeResult.cas_number === 'string' ? moleculeResult.cas_number.trim() : '';
  if (cas) {
    const byCas = await client.molecule.findFirst({ where: { cas_number: cas } });
    if (byCas) return byCas;
  }

  const normalized = normalizeMoleculeName(moleculeResult.molecule_name);
  if (!normalized) return null;

  const byName = await client.molecule.findUnique({ where: { normalized_name: normalized } });
  if (byName) return byName;

  const alias = await client.moleculeAlias.findUnique({
    where: { normalized_alias: normalized },
    include: { molecule: true },
  });
  return alias?.molecule ?? null;
}

export async function findOrCreateMoleculeForResult(client: any, moleculeResult: any) {
  const existing = await findMoleculeForResult(client, moleculeResult);
  if (existing) {
    if (moleculeResult.molecule_id !== existing.id) {
      await client.moleculeResult.update({
        where: { id: moleculeResult.id },
        data: { molecule_id: existing.id },
      });
    }
    return existing;
  }

  const displayName = String(moleculeResult.molecule_name || '').trim() || 'Unknown molecule';
  const normalized = normalizeMoleculeName(displayName);
  if (!normalized) return null;

  const molecule = await client.molecule.upsert({
    where: { normalized_name: normalized },
    update: {
      cas_number: moleculeResult.cas_number || undefined,
    },
    create: {
      name: displayName,
      normalized_name: normalized,
      cas_number: moleculeResult.cas_number || null,
    },
  });

  await client.moleculeAlias.upsert({
    where: { normalized_alias: normalized },
    update: { molecule_id: molecule.id, alias: displayName },
    create: { molecule_id: molecule.id, alias: displayName, normalized_alias: normalized, source: 'lab_result' },
  });

  await client.moleculeResult.update({
    where: { id: moleculeResult.id },
    data: { molecule_id: molecule.id },
  });

  return molecule;
}

async function resolveLimit(client: any, standard: any, moleculeId: string | null, productId: string | null) {
  if (moleculeId) {
    if (productId) {
      const productLimit = await client.complianceLimit.findFirst({
        where: { standard_id: standard.id, molecule_id: moleculeId, product_id: productId },
      });
      if (productLimit) {
        return {
          value: productLimit.limit_value,
          unit: productLimit.unit,
          source: 'PRODUCT',
          fallbackUsed: false,
        };
      }
    }

    const globalLimit = await client.complianceLimit.findFirst({
      where: { standard_id: standard.id, molecule_id: moleculeId, product_id: null },
    });
    if (globalLimit) {
      return {
        value: globalLimit.limit_value,
        unit: globalLimit.unit,
        source: 'STANDARD',
        fallbackUsed: false,
      };
    }
  }

  return {
    value: typeof standard.fallback_limit === 'number' ? standard.fallback_limit : DEFAULT_FALLBACK_LIMIT,
    unit: standard.fallback_unit || DEFAULT_UNIT,
    source: 'FALLBACK',
    fallbackUsed: true,
  };
}

export async function buildCompliancePreview(client: any, reportId: string, standardId: string) {
  const [report, standard] = await Promise.all([
    client.labReport.findUnique({
      where: { id: reportId },
      include: {
        test: { include: { lot: true } },
        moleculeResults: { orderBy: { createdAt: 'asc' } },
        complianceChecks: {
          where: { standard_id: standardId },
          include: { moleculeResults: true, standard: true },
        },
      },
    }),
    client.complianceStandard.findUnique({ where: { id: standardId } }),
  ]);

  if (!report) throw new Error('Review report not found.');
  if (!standard) throw new Error('Compliance standard not found.');

  const productId = report.test?.lot?.product_id ?? null;
  const detected = (report.moleculeResults || []).filter(isDetectedMolecule);
  const rows = [];

  for (const moleculeResult of detected) {
    const molecule = await findOrCreateMoleculeForResult(client, moleculeResult);
    const limit = await resolveLimit(client, standard, molecule?.id ?? null, productId);
    const measuredValue = typeof moleculeResult.numeric_result === 'number'
      ? moleculeResult.numeric_result
      : parseNumber(moleculeResult.result);
    rows.push({
      moleculeResultId: moleculeResult.id,
      moleculeId: molecule?.id ?? null,
      moleculeName: moleculeResult.molecule_name,
      casNumber: moleculeResult.cas_number,
      result: moleculeResult.result,
      measuredValue,
      measuredUnit: moleculeResult.unit,
      limitValue: limit.value,
      limitUnit: limit.unit,
      limitSource: limit.source,
      fallbackUsed: limit.fallbackUsed,
      isDetected: true,
      isCompliant: measuredValue === null ? null : measuredValue <= limit.value,
    });
  }

  return {
    reportId: report.id,
    standard,
    existingCheck: report.complianceChecks[0] ?? null,
    rows,
  };
}

export async function recordComplianceAgreement(client: any, reportId: string, standardId: string, notes: string | null) {
  return client.$transaction(async (tx: any) => {
    const preview = await buildCompliancePreview(tx, reportId, standardId);
    const now = new Date();
    const check = await tx.labReportComplianceCheck.upsert({
      where: {
        lab_report_id_standard_id: {
          lab_report_id: reportId,
          standard_id: standardId,
        },
      },
      update: {
        status: 'COMPLIANT',
        is_compliant: true,
        notes,
        checked_at: now,
      },
      create: {
        lab_report_id: reportId,
        standard_id: standardId,
        status: 'COMPLIANT',
        is_compliant: true,
        notes,
        checked_at: now,
      },
    });

    await tx.labReportComplianceMoleculeResult.deleteMany({
      where: { compliance_check_id: check.id },
    });

    if (preview.rows.length > 0) {
      await tx.labReportComplianceMoleculeResult.createMany({
        data: preview.rows.map((row: any) => ({
          compliance_check_id: check.id,
          molecule_result_id: row.moleculeResultId,
          molecule_id: row.moleculeId,
          measured_value: row.measuredValue,
          measured_unit: row.measuredUnit,
          limit_value: row.limitValue,
          limit_unit: row.limitUnit,
          limit_source: row.limitSource,
          fallback_used: row.fallbackUsed,
          is_detected: row.isDetected,
          is_compliant: row.isCompliant,
        })),
      });
    }

    return tx.labReportComplianceCheck.findUnique({
      where: { id: check.id },
      include: {
        standard: true,
        moleculeResults: {
          include: {
            moleculeResult: true,
            molecule: true,
          },
        },
      },
    });
  });
}
