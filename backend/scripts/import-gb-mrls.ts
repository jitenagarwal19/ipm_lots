/**
 * Import the GB (Great Britain) MRL register into the compliance tables.
 *
 * Source: per-commodity "GB MRLs" workbook exports from the HSE register, one
 * file per commodity, in `uk mrls/`.
 *
 *   npx tsx scripts/import-gb-mrls.ts             # dry run — writes nothing
 *   npx tsx scripts/import-gb-mrls.ts --commit    # writes
 *
 * Correctness rules, in priority order:
 *
 *   1. Account for every input row. A row is imported, or it is reported with a
 *      reason. Nothing is silently skipped.
 *   2. Never guess a molecule. Matching is exact on a normalised key, or on a
 *      link explicitly listed in CONFIRMED_LINKS below. Substring and fuzzy
 *      matching are absent by design: searching the GB sheet for "bromide"
 *      returns both "1,2-dibromoethane" at 0.02 and "Bromide ion" at 400.
 *   3. Abort the whole run on a structural problem — an unexpected header, an
 *      unparseable cell, or two register rows resolving to one molecule. A
 *      partial import of regulatory data is worse than none.
 *   4. A proxy commodity mapping is recorded on every row it produces, never
 *      inferred and never hidden.
 */

import 'dotenv/config';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  parseLimitCell,
  parseEnforcementDate,
  parseResidueDefinition,
  normalizeMoleculeKey,
  type LimitKind,
} from '../src/lib/limits/parse';
import { storedLimitValue } from '../src/lib/limits/kinds';

const prisma = new PrismaClient();

const COMMIT = process.argv.includes('--commit');
const SOURCE_DIR = path.resolve(__dirname, '../../uk mrls');
const STANDARD_CODE = 'UK';
const UNIT = 'mg/kg';
const ACTOR = 'gb_mrl_import';

// ─────────────────────────────────────────────────────── what maps to what

interface FileMapping {
  file: string;
  /** Commodity the sheet must declare in A2. Asserted, never assumed. */
  expectedCommodity: string;
  /** Product names in our catalogue that this register applies to. */
  products: string[];
  /** Products to create if absent. Anything else must already exist. */
  createProducts?: string[];
  /**
   * Set when our product is not the sheet's commodity. Recorded on every row
   * so the judgment stays visible in the UI and in the audit trail.
   */
  proxy?: string;
}

/**
 * Confirmed with Jiten before this import ran.
 *
 * Chilli is deliberately absent: `Chilli-GB_MRLs-07_Oct_2025.xlsx` contains the
 * register for "Sweet peppers/bell peppers" — a fresh vegetable, not the dried
 * spice — so its limits are on a fresh-weight basis with no dehydration factor.
 * Loading it against chilli lots would understate residues. It needs a
 * re-export of the correct GB commodity.
 */
const MAPPINGS: FileMapping[] = [
  {
    file: 'coriander-GB_MRLs-07_Oct_2025.xlsx',
    expectedCommodity: 'Coriander seed',
    products: ['Coriander Seed Whole', 'Coriander Split'],
  },
  {
    file: 'cumin-GB_MRLs-30_Sep_2025.xlsx',
    expectedCommodity: 'Cumin seed',
    products: ['Cumin Seed'],
  },
  {
    file: 'Fennel-GB_MRLs-07_Oct_2025.xlsx',
    expectedCommodity: 'Fennel seed',
    products: ['Fennel Seed'],
  },
  {
    file: 'Fenugreek-GB_MRLs-07_Oct_2025.xlsx',
    expectedCommodity: 'Fenugreek',
    products: ['Fenugreek Seed'],
    createProducts: ['Fenugreek Seed'],
  },
  {
    file: 'Mustard seeds-GB_MRLs-07_Oct_2025.xlsx',
    expectedCommodity: 'Mustard seeds',
    products: ['Mustard Seed'],
  },
  {
    file: 'Sesame seeds-GB_MRLs-07_Oct_2025.xlsx',
    expectedCommodity: 'Sesame seeds',
    products: ['Sesame Seed'],
    createProducts: ['Sesame Seed'],
  },
  {
    file: 'Turmeric-GB_MRLs-15_Feb_2025.xlsx',
    expectedCommodity: 'Turmeric/curcuma',
    products: ['Turmeric Finger'],
  },
  {
    file: 'Ajwain-caraway-GB_MRLs-15_Feb_2025 (1).xlsx',
    expectedCommodity: 'Caraway',
    products: ['Ajwain'],
    proxy:
      'PROXY: GB publishes no entry for ajwain (Trachyspermum ammi). Limits taken from the GB register for Caraway (Carum carvi), the closest published spice-seed commodity. Confirmed by Jiten, 11 Aug 2026. Verify before any release decision rests on it.',
  },
];

/**
 * Register definitions that must attach to a molecule we already hold under a
 * shorter name. Each was checked to have exactly one candidate in the register;
 * the run aborts if that stops being true.
 */
const CONFIRMED_LINKS: Array<{ definition: string; molecule: string; rationale: string }> = [
  {
    definition: 'Carbendazim and benomyl (sum of benomyl and carbendazim expressed as carbendazim)',
    molecule: 'Carbendazim',
    rationale: 'GB sets the limit on the benomyl + carbendazim sum; labs report it as carbendazim.',
  },
  {
    definition: 'Metalaxyl including other mixtures of constituent isomers including metalaxyl-M (sum of isomers)',
    molecule: 'Metalaxyl',
    rationale: 'GB definition covers metalaxyl and metalaxyl-M as a sum; labs report it as metalaxyl.',
  },
];

/** Names our labs use that must resolve to a register definition. */
const CONFIRMED_ALIASES: Array<{ alias: string; definition: string; rationale: string }> = [
  {
    alias: 'Endosulfan: Sum of α,β-endosulfan and endosulfan sulfate',
    definition: 'Endosulfan (sum of alpha- and beta-isomers and endosulfan-sulphate expresses as endosulfan)',
    rationale: 'Same residue definition, written differently by the lab.',
  },
];

const EXPECTED_HEADER = [
  'Residue Definition',
  'MRL (mg/kg)',
  'Feasibility',
  'NABL',
  'Where MRL Applies',
  'Footnotes',
  'Regulation / Decision',
  'Enforcement Date',
];
const HEADER_ROW = 9;
const COMMODITY_ROW = 2;

// ─────────────────────────────────────────────────────── cell reading

/** Flatten an ExcelJS cell to plain text. Rich text and formulas included. */
function cellText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join('');
    }
    if ('text' in value && typeof (value as { text: unknown }).text === 'string') {
      return (value as { text: string }).text;
    }
    if ('result' in value) return cellText((value as { result: ExcelJS.CellValue }).result);
  }
  return null;
}

/**
 * Register's Feasibility / NABL flags.
 *
 * Real forms: "y", "n", and a qualified yes — "y (as CS2)", "y(as cycloxydim)",
 * "y (bispyribac- sodium)" — where the qualifier names the compound the lab
 * actually reports. The qualifier is kept, never discarded.
 *
 * Anything else yields `null` (unknown) plus a note, and is surfaced in the run
 * report. One real case: Dinocap in the Sesame sheet has a numeric 0 where all
 * eight other sheets say "y". Neither reading is safe to invent.
 */
function parseFlag(
  raw: string | null,
  field: string,
  rowNo: number,
  report: Report
): { value: boolean | null; note: string | null } {
  if (raw === null || raw.trim() === '') return { value: null, note: null };
  const text = raw.trim();
  const t = text.toLowerCase();

  if (t === 'y' || t === 'yes') return { value: true, note: null };
  if (t === 'n' || t === 'no') return { value: false, note: null };

  const qualified = /^([yn])\s*\((.+)\)$/i.exec(text);
  if (qualified) {
    return { value: qualified[1].toLowerCase() === 'y', note: qualified[2].trim() };
  }

  report.flagAnomalies.add(`row ${rowNo}: ${field} = ${JSON.stringify(raw)} — stored as unknown`);
  return { value: null, note: `source cell was ${JSON.stringify(raw)}, not y/n — treated as unknown` };
}

/** "GB MRLs: web export created on 07 Oct 2025" → Date. */
function parseSnapshotDate(sheetText: string[]): Date | null {
  const line = sheetText.find((t) => /web export created on/i.test(t));
  if (!line) return null;
  const m = /created on\s+(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/.exec(line);
  if (!m) return null;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = months.indexOf(m[2].slice(0, 3).toLowerCase());
  if (month < 0) return null;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
}

// ─────────────────────────────────────────────────────── parsed row

interface RegisterRow {
  rowNo: number;
  definition: string;
  shortName: string;
  synonym: string | null;
  isSum: boolean;
  kind: LimitKind;
  value: number | null;
  sourceValue: string;
  feasibility: boolean | null;
  feasibilityNote: string | null;
  nabl: boolean | null;
  nablNote: string | null;
  appliesTo: string | null;
  footnotes: string | null;
  regulationRef: string | null;
  enforcementDate: Date | null;
}

interface ParsedSheet {
  commodity: string;
  snapshotDate: Date | null;
  rows: RegisterRow[];
}

async function readSheet(file: string, expectedCommodity: string, report: Report): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(SOURCE_DIR, file));
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`${file}: no worksheet`);

  const commodity = (cellText(ws.getCell(COMMODITY_ROW, 1).value) || '').trim();
  if (commodity !== expectedCommodity) {
    throw new Error(
      `${file}: sheet declares commodity "${commodity}" but the mapping expects "${expectedCommodity}". ` +
        `Refusing to import — the file may have been replaced with a different commodity.`
    );
  }

  // Labels and their order must match. Case and internal spacing are not
  // significant: the Feb 2025 exports write "feasibility", the later ones
  // "Feasibility", with identical columns either way.
  const headerKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const header = EXPECTED_HEADER.map((_, i) => cellText(ws.getCell(HEADER_ROW, i + 1).value) || '');
  for (const [i, expected] of EXPECTED_HEADER.entries()) {
    if (headerKey(header[i]) !== headerKey(expected)) {
      throw new Error(
        `${file}: header column ${i + 1} is "${header[i].trim()}", expected "${expected}". Layout changed — refusing to import.`
      );
    }
  }

  const preamble: string[] = [];
  for (let r = 1; r < HEADER_ROW; r++) {
    for (let c = 1; c <= EXPECTED_HEADER.length; c++) {
      const t = cellText(ws.getCell(r, c).value);
      if (t) preamble.push(t);
    }
  }

  const rows: RegisterRow[] = [];
  for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
    const rawDefinition = cellText(ws.getCell(r, 1).value);
    if (!rawDefinition || rawDefinition.trim() === '') continue;

    const def = parseResidueDefinition(rawDefinition);
    if (!def.ok) throw new Error(`${file} row ${r}: residue definition — ${def.code}: ${def.detail}`);

    const limit = parseLimitCell(cellText(ws.getCell(r, 2).value));
    if (!limit.ok) throw new Error(`${file} row ${r}: MRL cell — ${limit.code}: ${limit.detail}`);

    const rawDate = cellText(ws.getCell(r, 8).value);
    let enforcementDate: Date | null = null;
    if (rawDate && rawDate.trim() !== '') {
      const parsed = parseEnforcementDate(rawDate);
      if (!parsed.ok) throw new Error(`${file} row ${r}: enforcement date — ${parsed.code}: ${parsed.detail}`);
      enforcementDate = parsed.value;
    }

    const footnotes = cellText(ws.getCell(r, 6).value);
    const regulationRef = cellText(ws.getCell(r, 7).value);
    const appliesTo = cellText(ws.getCell(r, 5).value);

    const feasibility = parseFlag(cellText(ws.getCell(r, 3).value), 'Feasibility', r, report);
    const nabl = parseFlag(cellText(ws.getCell(r, 4).value), 'NABL', r, report);

    rows.push({
      rowNo: r,
      definition: def.value.displayName,
      shortName: def.value.shortName,
      synonym: def.value.synonym,
      isSum: def.value.isSum,
      kind: limit.value.kind,
      value: limit.value.value,
      sourceValue: limit.value.sourceValue,
      feasibility: feasibility.value,
      feasibilityNote: feasibility.note,
      nabl: nabl.value,
      nablNote: nabl.note,
      appliesTo: appliesTo?.trim() || null,
      footnotes: footnotes?.trim() || null,
      regulationRef: regulationRef?.trim() || null,
      enforcementDate,
    });
  }

  return { commodity, snapshotDate: parseSnapshotDate(preamble), rows };
}

// ─────────────────────────────────────────────────────── molecule resolution

type Tx = Prisma.TransactionClient;

/** Molecule lookup by exact normalised key, over both names and aliases. */
async function findMolecule(tx: Tx, key: string) {
  if (!key) return null;
  const byName = await tx.molecule.findUnique({ where: { normalized_name: key } });
  if (byName) return byName;
  const alias = await tx.moleculeAlias.findUnique({
    where: { normalized_alias: key },
    include: { molecule: true },
  });
  return alias?.molecule ?? null;
}

const linkByDefinitionKey = new Map(
  CONFIRMED_LINKS.map((l) => [normalizeMoleculeKey(l.definition), l])
);

/**
 * Molecules that existed before this run. The short-name fallback below is only
 * allowed to match these.
 *
 * Without that restriction the register attacks itself: "Paraffin Oil (CAS
 * 64742-46-7)" is created and given the alias "paraffin oil", and the next row,
 * "Paraffin oil (CAS 64742-54-7)" — a different substance with its own limit —
 * then matches that alias and silently overwrites the first one's limit. Two
 * register rows are always two substances; only a molecule we already held can
 * legitimately absorb one.
 */
let preExistingMoleculeIds = new Set<string>();

/**
 * Resolve one register definition to a molecule, creating it when the register
 * describes a substance we have never seen. Exact matching only.
 */
async function resolveMolecule(tx: Tx, row: RegisterRow, report: Report) {
  const defKey = normalizeMoleculeKey(row.definition);

  const link = linkByDefinitionKey.get(defKey);
  if (link) {
    const target = await findMolecule(tx, normalizeMoleculeKey(link.molecule));
    if (!target) {
      throw new Error(
        `CONFIRMED_LINKS names molecule "${link.molecule}" for "${link.definition}", but no such molecule exists.`
      );
    }
    report.linkedMolecules.add(`${link.molecule} ← ${row.definition}`);
    await ensureAlias(tx, target.id, row.definition, report);
    return target;
  }

  // The full definition is the substance's identity — an exact match is always
  // the same substance, whenever the molecule was created.
  const byDefinition = await findMolecule(tx, defKey);
  if (byDefinition) {
    await ensureAlias(tx, byDefinition.id, row.definition, report);
    return byDefinition;
  }

  // Short name and synonym only connect the register to molecules we already
  // held, e.g. register "Bifenthrin (sum of isomers)" → our "Bifenthrin".
  for (const candidateKey of [normalizeMoleculeKey(row.shortName), row.synonym ? normalizeMoleculeKey(row.synonym) : '']) {
    if (!candidateKey) continue;
    const candidate = await findMolecule(tx, candidateKey);
    if (candidate && preExistingMoleculeIds.has(candidate.id)) {
      await ensureAlias(tx, candidate.id, row.definition, report);
      return candidate;
    }
  }

  const created = await tx.molecule.upsert({
    where: { normalized_name: defKey },
    update: {},
    create: { name: row.definition, normalized_name: defKey },
  });
  report.createdMolecules.add(row.definition);

  // Short label and synonym make lab-report names match. Skipped, not forced,
  // when another molecule already owns the alias — five GB "Paraffin Oil (CAS …)"
  // rows are distinct substances that share one short name.
  await ensureAlias(tx, created.id, row.shortName, report);
  if (row.synonym) await ensureAlias(tx, created.id, row.synonym, report);
  return created;
}

async function ensureAlias(tx: Tx, moleculeId: string, alias: string, report: Report) {
  const key = normalizeMoleculeKey(alias);
  if (!key) return;

  const owner = await tx.molecule.findUnique({ where: { normalized_name: key } });
  if (owner) {
    if (owner.id !== moleculeId) report.aliasConflicts.add(`${alias} (name of another molecule)`);
    return;
  }
  const existing = await tx.moleculeAlias.findUnique({ where: { normalized_alias: key } });
  if (existing) {
    if (existing.molecule_id !== moleculeId) report.aliasConflicts.add(`${alias} (alias of another molecule)`);
    return;
  }
  await tx.moleculeAlias.create({
    data: { molecule_id: moleculeId, alias, normalized_alias: key, source: 'gb_mrl_register' },
  });
  report.createdAliases.add(alias);
}

// ─────────────────────────────────────────────────────── report

interface Change {
  product: string;
  molecule: string;
  before: string;
  after: string;
  note: string;
}

interface Report {
  createdMolecules: Set<string>;
  createdAliases: Set<string>;
  aliasConflicts: Set<string>;
  linkedMolecules: Set<string>;
  /** Feasibility / NABL cells that were neither y nor n. Reported, never guessed. */
  flagAnomalies: Set<string>;
  createdProducts: Set<string>;
  createdProfiles: Set<string>;
  changes: Change[];
  perProduct: Map<string, { created: number; updated: number; unchanged: number; kinds: Record<string, number> }>;
}

function newReport(): Report {
  return {
    createdMolecules: new Set(),
    createdAliases: new Set(),
    aliasConflicts: new Set(),
    linkedMolecules: new Set(),
    flagAnomalies: new Set(),
    createdProducts: new Set(),
    createdProfiles: new Set(),
    changes: [],
    perProduct: new Map(),
  };
}

// ─────────────────────────────────────────────────────── import

async function importAll(tx: Tx, report: Report) {
  const standard = await tx.complianceStandard.findUnique({ where: { code: STANDARD_CODE } });
  if (!standard) throw new Error(`Compliance standard "${STANDARD_CODE}" not found.`);

  preExistingMoleculeIds = new Set((await tx.molecule.findMany({ select: { id: true } })).map((m) => m.id));
  console.log(`Molecules on file before import: ${preExistingMoleculeIds.size}`);

  for (const mapping of MAPPINGS) {
    const sheet = await readSheet(mapping.file, mapping.expectedCommodity, report);
    console.log(
      `\n${mapping.file}\n  commodity "${sheet.commodity}"  rows ${sheet.rows.length}  ` +
        `export ${sheet.snapshotDate ? sheet.snapshotDate.toISOString().slice(0, 10) : 'unknown'}`
    );

    // One molecule per register row, checked before any limit is written.
    const moleculeByRow = new Map<number, string>();
    const rowByMolecule = new Map<string, RegisterRow>();
    for (const row of sheet.rows) {
      const molecule = await resolveMolecule(tx, row, report);
      const clash = rowByMolecule.get(molecule.id);
      if (clash) {
        throw new Error(
          `${mapping.file}: rows ${clash.rowNo} ("${clash.definition}") and ${row.rowNo} ("${row.definition}") ` +
            `both resolve to molecule "${molecule.name}". One of them would overwrite the other — refusing to import.`
        );
      }
      rowByMolecule.set(molecule.id, row);
      moleculeByRow.set(row.rowNo, molecule.id);
    }

    for (const productName of mapping.products) {
      let product = await tx.product.findFirst({ where: { name: productName } });
      if (!product) {
        if (!mapping.createProducts?.includes(productName)) {
          throw new Error(`Product "${productName}" not found and not listed for creation.`);
        }
        product = await tx.product.create({ data: { name: productName } });
        report.createdProducts.add(productName);
      }

      let profile = await tx.complianceProfile.findFirst({
        where: { product_id: product.id, standard_id: standard.id },
      });
      if (!profile) {
        profile = await tx.complianceProfile.create({
          data: {
            product_id: product.id,
            standard_id: standard.id,
            fallback_limit: standard.fallback_limit,
            fallback_unit: UNIT,
          },
        });
        report.createdProfiles.add(`${productName} / ${STANDARD_CODE}`);
      }

      const stats = { created: 0, updated: 0, unchanged: 0, kinds: {} as Record<string, number> };

      for (const row of sheet.rows) {
        const moleculeId = moleculeByRow.get(row.rowNo)!;
        const molecule = await tx.molecule.findUnique({ where: { id: moleculeId } });
        const limitValue = storedLimitValue(row.kind, row.value);
        stats.kinds[row.kind] = (stats.kinds[row.kind] ?? 0) + 1;

        const notes = [`GB register, ${mapping.expectedCommodity}`, row.regulationRef, mapping.proxy]
          .filter(Boolean)
          .join(' | ');

        const data = {
          profile_id: profile.id,
          standard_id: standard.id,
          molecule_id: moleculeId,
          product_id: product.id,
          limit_value: limitValue,
          unit: UNIT,
          notes,
          limit_kind: row.kind,
          source_value: row.sourceValue,
          residue_definition: row.definition,
          is_sum_definition: row.isSum,
          enforcement_date: row.enforcementDate,
          regulation_ref: row.regulationRef,
          footnotes: row.footnotes,
          feasibility: row.feasibility,
          feasibility_note: row.feasibilityNote,
          nabl: row.nabl,
          nabl_note: row.nablNote,
          applies_to: row.appliesTo,
          source_commodity: mapping.expectedCommodity,
          source_file: mapping.file,
          snapshot_date: sheet.snapshotDate,
          verification_status: mapping.proxy ? 'PROXY_UNVERIFIED' : 'IMPORTED_UNVERIFIED',
        };

        const existing = await tx.complianceLimit.findFirst({
          where: { profile_id: profile.id, molecule_id: moleculeId },
        });

        if (!existing) {
          await tx.complianceLimit.create({ data });
          stats.created++;
          continue;
        }

        if (existing.limit_value !== limitValue || existing.limit_kind !== row.kind) {
          report.changes.push({
            product: productName,
            molecule: molecule!.name,
            before: `${existing.limit_value} ${existing.unit} (${existing.limit_kind})`,
            after: `${row.sourceValue} → ${limitValue} ${UNIT} (${row.kind})`,
            note: existing.notes ?? '',
          });
          stats.updated++;
        } else {
          stats.unchanged++;
        }
        await tx.complianceLimit.update({ where: { id: existing.id }, data });
      }

      report.perProduct.set(productName, stats);
      console.log(
        `    ${productName.padEnd(22)} created ${String(stats.created).padStart(3)}  ` +
          `updated ${String(stats.updated).padStart(3)}  unchanged ${String(stats.unchanged).padStart(3)}  ` +
          `[${Object.entries(stats.kinds).map(([k, v]) => `${k} ${v}`).join(', ')}]`
      );

      if (COMMIT) {
        await tx.complianceChangeLog.create({
          data: {
            profile_id: profile.id,
            action: 'GB_MRL_REGISTER_IMPORTED',
            message:
              `Imported ${sheet.rows.length} GB register rows for ${productName} from ${mapping.file} ` +
              `(commodity "${mapping.expectedCommodity}", export ` +
              `${sheet.snapshotDate ? sheet.snapshotDate.toISOString().slice(0, 10) : 'unknown'}). ` +
              `${stats.created} created, ${stats.updated} value-changed, ${stats.unchanged} unchanged.` +
              (mapping.proxy ? ` ${mapping.proxy}` : ''),
            before_json: null,
            after_json: JSON.stringify({
              file: mapping.file,
              commodity: mapping.expectedCommodity,
              rows: sheet.rows.length,
              ...stats,
            }),
            actor: ACTOR,
          },
        });
      }
    }
  }

  // Lab-report names that must reach a register definition.
  for (const entry of CONFIRMED_ALIASES) {
    const target = await findMolecule(tx, normalizeMoleculeKey(entry.definition));
    if (!target) {
      throw new Error(`CONFIRMED_ALIASES references unknown definition "${entry.definition}".`);
    }
    await ensureAlias(tx, target.id, entry.alias, report);
  }
}

function printReport(report: Report) {
  const line = (s: string) => console.log(s);
  line('\n' + '─'.repeat(78));
  line(COMMIT ? 'COMMITTED' : 'DRY RUN — nothing was written');
  line('─'.repeat(78));

  line(`\nProducts created:  ${report.createdProducts.size}`);
  report.createdProducts.forEach((p) => line(`    + ${p}`));
  line(`Profiles created:  ${report.createdProfiles.size}`);
  report.createdProfiles.forEach((p) => line(`    + ${p}`));
  line(`Molecules created: ${report.createdMolecules.size}`);
  line(`Aliases created:   ${report.createdAliases.size}`);

  line(`\nConfirmed links applied: ${report.linkedMolecules.size}`);
  report.linkedMolecules.forEach((l) => line(`    ${l}`));

  if (report.flagAnomalies.size > 0) {
    line(`\nFeasibility / NABL cells that were neither y nor n — stored as unknown: ${report.flagAnomalies.size}`);
    [...report.flagAnomalies].sort().forEach((a) => line(`    ? ${a}`));
  }

  if (report.aliasConflicts.size > 0) {
    line(`\nAliases not created — already owned by a different molecule: ${report.aliasConflicts.size}`);
    [...report.aliasConflicts].sort().forEach((a) => line(`    ! ${a}`));
    line('    (expected for the five GB "Paraffin Oil (CAS …)" entries, which share a short name)');
  }

  if (report.changes.length > 0) {
    line(`\nVALUE CHANGES to limits already on file: ${report.changes.length}`);
    for (const c of report.changes) {
      line(`    ${c.product} · ${c.molecule}`);
      line(`        was:  ${c.before}   ${c.note ? `[${c.note}]` : ''}`);
      line(`        now:  ${c.after}`);
    }
  } else {
    line('\nNo existing limit changed value.');
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const s of report.perProduct.values()) {
    created += s.created;
    updated += s.updated;
    unchanged += s.unchanged;
  }
  line(`\nTotal limit rows: ${created + updated + unchanged}  (created ${created}, changed ${updated}, unchanged ${unchanged})`);
  line('─'.repeat(78));
}

async function main() {
  const report = newReport();
  try {
    await prisma.$transaction(
      async (tx) => {
        await importAll(tx, report);
        if (!COMMIT) throw new DryRun();
      },
      { timeout: 600_000, maxWait: 60_000 }
    );
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  printReport(report);
  if (!COMMIT) console.log('\nRe-run with --commit to write.\n');
}

class DryRun extends Error {}

main()
  .catch((e) => {
    console.error('\nIMPORT ABORTED — nothing was written.\n');
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
