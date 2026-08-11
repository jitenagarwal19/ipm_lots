/**
 * Pure parsers for regulatory limit source files.
 *
 * Correctness rules for this module — every function here obeys all four:
 *
 *   1. Never throw. Every function returns a Result; the caller must handle failure.
 *   2. Never guess. Anything not matching a known form is an error with a reason
 *      code, never a best-effort value and never a default.
 *   3. Never silently drop. A row that cannot be parsed is reported, not skipped,
 *      so an import can account for every input row.
 *   4. No I/O, no clock, no randomness. Fully deterministic and exhaustively testable.
 *
 * A false PASS downstream is the failure mode that ships a rejected container.
 * Every ambiguity here resolves toward "refuse to answer", never toward a value.
 */

export type LimitKind = 'VALUE' | 'AT_LOD' | 'NOT_REQUIRED' | 'PROHIBITED';

export type ParseError =
  | 'EMPTY'
  | 'HEADER_ROW'
  | 'UNRECOGNISED_FORM'
  | 'NOT_FINITE'
  | 'NEGATIVE'
  | 'UNKNOWN_UNIT'
  | 'BAD_DATE_FORM'
  | 'DATE_OUT_OF_RANGE';

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: ParseError; detail: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(code: ParseError, detail: string): Result<T> => ({ ok: false, code, detail });

/**
 * Tokens that appear as column headers. The GB export repeats its header inside
 * the data region (1 occurrence in 648 rows for coriander), so a header token
 * reaching a value parser means row misalignment — an error, never a limit.
 */
const HEADER_TOKENS = new Set([
  'mrl (mg/kg)',
  'mrl',
  'residue definition',
  'enforcement date',
  'regulation / decision',
  'maximum residue limit (ppm)',
  'pesticide name',
  'crop category',
  'where mrl applies',
  'footnotes',
  'feasibility',
  'nabl',
]);

function isHeaderToken(raw: string): boolean {
  return HEADER_TOKENS.has(raw.trim().toLowerCase());
}

// ─────────────────────────────────────────────────────────── limit values

export interface ParsedLimit {
  kind: LimitKind;
  /** Null for NOT_REQUIRED and PROHIBITED, which carry no numeric limit. */
  value: number | null;
  /** The cell exactly as written, preserved for audit. */
  sourceValue: string;
}

/**
 * Parse a limit cell from a regulatory source.
 *
 * Recognised forms, drawn from the real GB and Taiwan files:
 *
 *   "2.0"               → VALUE 2.0
 *   "0.05 *"            → AT_LOD 0.05      (GB: space before asterisk)
 *   "0.05*"             → AT_LOD 0.05      (Taiwan: no space)
 *   "No MRL Required"   → NOT_REQUIRED     (Annex IV exempt)
 *
 * The asterisk means the MRL is set at the limit of determination — no approved
 * use. It is NOT decoration and must not be stripped and treated as a plain
 * value: it changes how the limit interacts with the lab's LOQ.
 *
 * Deliberately NOT accepted, because each is ambiguous and a wrong reading is
 * unrecoverable: "<0.01", "0.01-0.05", "0,05", "ND", "n/a", "-", "".
 */
export function parseLimitCell(raw: unknown): Result<ParsedLimit> {
  if (raw === null || raw === undefined) {
    return err('EMPTY', 'cell is null or undefined');
  }

  // openpyxl/xlsx yields real numbers for unadorned numeric cells (Taiwan does this).
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return err('NOT_FINITE', `numeric cell is ${raw}`);
    if (raw < 0) return err('NEGATIVE', `limit is negative: ${raw}`);
    return ok({ kind: 'VALUE', value: raw, sourceValue: String(raw) });
  }

  if (typeof raw !== 'string') {
    return err('UNRECOGNISED_FORM', `cell type is ${typeof raw}`);
  }

  const source = raw;
  const text = raw.trim();

  if (text === '') return err('EMPTY', 'cell is blank');
  if (isHeaderToken(text)) return err('HEADER_ROW', `header token in value column: "${text}"`);

  if (/^no\s+mrl\s+required$/i.test(text)) {
    return ok({ kind: 'NOT_REQUIRED', value: null, sourceValue: source });
  }

  if (/^prohibited$|^banned$/i.test(text)) {
    return ok({ kind: 'PROHIBITED', value: null, sourceValue: source });
  }

  // Exactly one trailing asterisk, optional single space. Two asterisks, a
  // leading asterisk, or any other trailing character is not a form we know.
  const atLod = /^(\d+(?:\.\d+)?)\s?\*$/.exec(text);
  if (atLod) {
    const n = Number(atLod[1]);
    if (!Number.isFinite(n)) return err('NOT_FINITE', `cannot parse "${text}"`);
    if (n < 0) return err('NEGATIVE', `limit is negative: ${text}`);
    return ok({ kind: 'AT_LOD', value: n, sourceValue: source });
  }

  const plain = /^(\d+(?:\.\d+)?)$/.exec(text);
  if (plain) {
    const n = Number(plain[1]);
    if (!Number.isFinite(n)) return err('NOT_FINITE', `cannot parse "${text}"`);
    if (n < 0) return err('NEGATIVE', `limit is negative: ${text}`);
    return ok({ kind: 'VALUE', value: n, sourceValue: source });
  }

  return err('UNRECOGNISED_FORM', `no known form matches "${text}"`);
}

// ─────────────────────────────────────────────────────────── units

/**
 * Explicit conversion table to the canonical mg/kg. There is no fallback: an
 * unrecognised unit is an error.
 *
 * ppm and mg/kg are dimensionally identical for solids, but the mapping is
 * stated explicitly rather than assumed — the two files genuinely use different
 * labels (GB "mg/kg", Taiwan "ppm") and an unexamined assumption here is how a
 * 1000x error enters. Pyrrolizidine alkaloids are reported in µg/kg.
 */
const UNIT_TO_MG_KG: Record<string, number> = {
  'mg/kg': 1,
  'mg kg-1': 1,
  ppm: 1,
  'µg/kg': 0.001,
  'ug/kg': 0.001,
  'μg/kg': 0.001, // U+03BC greek mu, distinct from U+00B5 micro sign above
  ppb: 0.001,
  'g/kg': 1000,
};

export function normalizeUnit(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Convert a value to canonical mg/kg. Unknown unit is an error, never a pass-through. */
export function toMgKg(value: number, unit: string): Result<number> {
  if (!Number.isFinite(value)) return err('NOT_FINITE', `value is ${value}`);
  const factor = UNIT_TO_MG_KG[normalizeUnit(unit)];
  if (factor === undefined) {
    return err('UNKNOWN_UNIT', `no conversion defined for unit "${unit}"`);
  }
  return ok(value * factor);
}

// ─────────────────────────────────────────────────────────── dates

/**
 * Parse a dd/mm/yyyy enforcement date.
 *
 * The GB export is unambiguously day-first: 338 of 648 coriander rows have a
 * first component greater than 12 (e.g. "28/10/2015", "17/01/2025"). Month-first
 * parsing would silently shift ~half the dataset's validity dates, which would
 * corrupt every point-in-time query without ever raising an error.
 *
 * Returned as a UTC midnight Date so validity comparisons carry no timezone.
 */
export function parseEnforcementDate(raw: unknown): Result<Date> {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return err('BAD_DATE_FORM', 'invalid Date object');
    return ok(new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate())));
  }
  if (typeof raw !== 'string') return err('BAD_DATE_FORM', `date cell type is ${typeof raw}`);

  const text = raw.trim();
  if (text === '') return err('EMPTY', 'date cell is blank');
  if (isHeaderToken(text)) return err('HEADER_ROW', `header token in date column: "${text}"`);

  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return err('BAD_DATE_FORM', `expected dd/mm/yyyy, got "${text}"`);

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);

  if (month < 1 || month > 12) return err('DATE_OUT_OF_RANGE', `month ${month} in "${text}"`);
  if (day < 1 || day > 31) return err('DATE_OUT_OF_RANGE', `day ${day} in "${text}"`);
  if (year < 1900 || year > 2200) return err('DATE_OUT_OF_RANGE', `year ${year} in "${text}"`);

  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects impossible calendar dates that survive range checks, e.g. 31/02/2020.
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) {
    return err('DATE_OUT_OF_RANGE', `"${text}" is not a real calendar date`);
  }
  return ok(date);
}

// ─────────────────────────────────────────────────────────── residue definitions

export interface ParsedResidueDefinition {
  /** Full text as published, minus editorial prefixes. Authoritative. */
  displayName: string;
  /** Compact label for grids. Equals displayName when nothing is separable. */
  shortName: string;
  /** True when the limit applies to a sum of components rather than one molecule. */
  isSum: boolean;
  /** A trailing synonym parenthetical, when present — a free alias. */
  synonym: string | null;
  /** The source marked this entry as newly added. */
  wasMarkedNew: boolean;
}

/** Phrases that make a trailing parenthetical a residue-definition qualifier, not a synonym. */
const SUM_MARKERS =
  /\b(sum of|sum,|combined|expressed as|including|include |and its salts|its conjugates|isomers)\b/i;

/**
 * Parse a GB-style residue definition.
 *
 *   "Acetamiprid"
 *     → short "Acetamiprid", isSum false
 *
 *   "Carbendazim and benomyl (sum of benomyl and carbendazim expressed as carbendazim)"
 *     → short "Carbendazim and benomyl", isSum true
 *
 *   "1,2-dibromoethane (ethylene dibromide)"
 *     → short "1,2-dibromoethane", synonym "ethylene dibromide", isSum false
 *
 *   "1,1-dichloro-2,2-bis(4-ethylphenyl)ethane"
 *     → short unchanged, isSum false
 *     The parenthesis is interior to the chemical name. Only a parenthetical
 *     that CLOSES the string is separable; stripping interior ones mangles the
 *     name and breaks matching.
 *
 *   "NEW: 2-amino-4-methoxy-... (AMTT), resulting from the use of tritosulfuron"
 *     → editorial "NEW:" prefix stripped, wasMarkedNew true
 *     30 of 648 coriander rows carry this. Left in place it produces a second,
 *     unmatchable molecule for a substance already present.
 */
export function parseResidueDefinition(raw: unknown): Result<ParsedResidueDefinition> {
  if (typeof raw !== 'string') {
    return err('UNRECOGNISED_FORM', `residue definition cell type is ${typeof raw}`);
  }

  let text = raw.trim();
  if (text === '') return err('EMPTY', 'residue definition is blank');
  if (isHeaderToken(text)) return err('HEADER_ROW', `header token in name column: "${text}"`);

  const wasMarkedNew = /^new:\s*/i.test(text);
  if (wasMarkedNew) text = text.replace(/^new:\s*/i, '').trim();
  if (text === '') return err('EMPTY', 'residue definition is empty after removing "NEW:" prefix');

  const displayName = text;
  const isSum = SUM_MARKERS.test(text);

  let shortName = text;
  let synonym: string | null = null;

  // Only a parenthetical that terminates the string is separable.
  if (text.endsWith(')')) {
    const open = findMatchingOpenParen(text);
    if (open > 0) {
      const head = text.slice(0, open).trim();
      const inner = text.slice(open + 1, -1).trim();
      if (head !== '') {
        shortName = head;
        if (!SUM_MARKERS.test(inner)) synonym = inner;
      }
    }
  }

  return ok({ displayName, shortName, isSum, synonym, wasMarkedNew });
}

/** Index of the '(' matching the final ')', or -1. Handles nesting. */
function findMatchingOpenParen(text: string): number {
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === ')') depth++;
    else if (ch === '(') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ─────────────────────────────────────────────────────────── molecule identity

/**
 * Canonical key for molecule and residue-definition matching.
 *
 * Used for EXACT comparison only. Substring or fuzzy matching must never appear
 * in the limit-resolution path: searching the GB coriander sheet for "Bromide"
 * returns both "1,2-dibromoethane (ethylene dibromide)" at 0.02 and "Bromide ion"
 * at 400 — a 20,000x spread, and picking the wrong one is unrecoverable.
 */
export function normalizeMoleculeKey(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
