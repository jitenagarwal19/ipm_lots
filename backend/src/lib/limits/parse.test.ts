import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseLimitCell,
  parseEnforcementDate,
  parseResidueDefinition,
  normalizeMoleculeKey,
  toMgKg,
  type Result,
} from './parse';

/**
 * Every fixture below is a real value taken from:
 *   - IPM Limits.xlsx      → sheet "CORIANDER _ UK"  (GB MRL export, 07 Oct 2025)
 *   - Taiwan Standards.xlsx → sheets "MRL -Spices", "List of prohibition"
 *   - Coriander seed || Korea ||.pdf
 *
 * Cases invented to make the parser look good are worthless. Cases taken from
 * the files are the only ones that prove anything.
 */

function expectOk<T>(r: Result<T>): T {
  assert.equal(r.ok, true, `expected ok, got ${r.ok === false ? `${r.code}: ${r.detail}` : ''}`);
  return (r as { ok: true; value: T }).value;
}

function expectErr<T>(r: Result<T>, code: string) {
  assert.equal(r.ok, false, 'expected an error, got a value');
  assert.equal((r as { ok: false; code: string }).code, code);
}

describe('parseLimitCell — the four real forms', () => {
  it('reads a plain numeric MRL (51 of 648 GB coriander rows)', () => {
    const v = expectOk(parseLimitCell('2.0'));
    assert.deepEqual(v, { kind: 'VALUE', value: 2.0, sourceValue: '2.0' });
  });

  it('reads "0.05 *" as AT_LOD, not as a plain value (463 of 648 rows)', () => {
    const v = expectOk(parseLimitCell('0.05 *'));
    assert.equal(v.kind, 'AT_LOD');
    assert.equal(v.value, 0.05);
    // The asterisk must survive into the record: it says the limit sits at the
    // limit of determination, which changes how it interacts with the lab LOQ.
    assert.equal(v.sourceValue, '0.05 *');
  });

  it('reads Taiwan\'s "0.05*" without a space, same meaning', () => {
    const v = expectOk(parseLimitCell('0.05*'));
    assert.equal(v.kind, 'AT_LOD');
    assert.equal(v.value, 0.05);
  });

  it('reads "No MRL Required" as its own kind, never as null or zero (133 rows)', () => {
    const v = expectOk(parseLimitCell('No MRL Required'));
    assert.equal(v.kind, 'NOT_REQUIRED');
    assert.equal(v.value, null);
  });

  it('accepts native numeric cells (Taiwan stores floats, not strings)', () => {
    const v = expectOk(parseLimitCell(0.2));
    assert.deepEqual(v, { kind: 'VALUE', value: 0.2, sourceValue: '0.2' });
  });
});

describe('parseLimitCell — refuses rather than guesses', () => {
  it('rejects the header row embedded in the GB data region', () => {
    // "MRL (mg/kg)" appears once inside the 648 coriander rows. Parsed as a
    // value it would become a silent corruption; it must surface as an error.
    expectErr(parseLimitCell('MRL (mg/kg)'), 'HEADER_ROW');
  });

  it('rejects blank cells instead of defaulting them', () => {
    expectErr(parseLimitCell(''), 'EMPTY');
    expectErr(parseLimitCell('   '), 'EMPTY');
    expectErr(parseLimitCell(null), 'EMPTY');
    expectErr(parseLimitCell(undefined), 'EMPTY');
  });

  it('rejects forms that look numeric but are ambiguous', () => {
    // Each of these has a plausible reading and a wrong one. Refusing is correct;
    // a wrong reading here is unrecoverable and invisible.
    expectErr(parseLimitCell('<0.01'), 'UNRECOGNISED_FORM');
    expectErr(parseLimitCell('0.01-0.05'), 'UNRECOGNISED_FORM');
    expectErr(parseLimitCell('0,05'), 'UNRECOGNISED_FORM'); // European decimal comma
    expectErr(parseLimitCell('ND'), 'UNRECOGNISED_FORM');
    expectErr(parseLimitCell('n/a'), 'UNRECOGNISED_FORM');
    expectErr(parseLimitCell('-'), 'UNRECOGNISED_FORM');
    expectErr(parseLimitCell('0.05 **'), 'UNRECOGNISED_FORM');
    expectErr(parseLimitCell('*0.05'), 'UNRECOGNISED_FORM');
    expectErr(parseLimitCell('0.05 mg/kg'), 'UNRECOGNISED_FORM');
  });

  it('rejects negative and non-finite limits', () => {
    expectErr(parseLimitCell('-0.05'), 'UNRECOGNISED_FORM'); // sign not in the grammar
    expectErr(parseLimitCell(-1), 'NEGATIVE');
    expectErr(parseLimitCell(Number.NaN), 'NOT_FINITE');
    expectErr(parseLimitCell(Number.POSITIVE_INFINITY), 'NOT_FINITE');
  });

  it('never throws, whatever it is handed', () => {
    const hostile: unknown[] = [{}, [], true, Symbol('x'), () => {}, 0n];
    for (const input of hostile) {
      assert.doesNotThrow(() => parseLimitCell(input));
      assert.equal(parseLimitCell(input).ok, false);
    }
  });

  it('preserves zero as a real limit rather than treating it as absent', () => {
    const v = expectOk(parseLimitCell('0'));
    assert.equal(v.kind, 'VALUE');
    assert.equal(v.value, 0);
  });
});

describe('parseEnforcementDate — day-first, proven by the data', () => {
  it('parses dd/mm/yyyy', () => {
    const d = expectOk(parseEnforcementDate('01/09/2008'));
    assert.equal(d.toISOString(), '2008-09-01T00:00:00.000Z');
  });

  it('reads 28/05/2025 as 28 May, not 5 April — 338 GB rows have day > 12', () => {
    // Month-first parsing would shift roughly half the dataset's validity dates
    // without raising a single error, corrupting every point-in-time query.
    const d = expectOk(parseEnforcementDate('28/05/2025'));
    assert.equal(d.getUTCDate(), 28);
    assert.equal(d.getUTCMonth(), 4); // May
  });

  it('parses the real acetamiprid and thiamethoxam enforcement dates', () => {
    assert.equal(expectOk(parseEnforcementDate('17/01/2025')).toISOString(), '2025-01-17T00:00:00.000Z');
    assert.equal(expectOk(parseEnforcementDate('19/03/2024')).toISOString(), '2024-03-19T00:00:00.000Z');
    assert.equal(expectOk(parseEnforcementDate('28/10/2015')).toISOString(), '2015-10-28T00:00:00.000Z');
  });

  it('rejects impossible calendar dates that pass range checks', () => {
    expectErr(parseEnforcementDate('31/02/2020'), 'DATE_OUT_OF_RANGE');
    expectErr(parseEnforcementDate('30/02/2020'), 'DATE_OUT_OF_RANGE');
    expectErr(parseEnforcementDate('00/01/2020'), 'DATE_OUT_OF_RANGE');
    expectErr(parseEnforcementDate('01/13/2020'), 'DATE_OUT_OF_RANGE'); // month 13
  });

  it('accepts a real leap day', () => {
    assert.equal(expectOk(parseEnforcementDate('29/02/2020')).getUTCDate(), 29);
  });

  it('rejects other date formats rather than inferring the order', () => {
    expectErr(parseEnforcementDate('2025-05-28'), 'BAD_DATE_FORM');
    expectErr(parseEnforcementDate('1/9/2008'), 'BAD_DATE_FORM');
    expectErr(parseEnforcementDate('28-05-2025'), 'BAD_DATE_FORM');
    expectErr(parseEnforcementDate('Enforcement Date'), 'HEADER_ROW');
  });
});

describe('parseResidueDefinition', () => {
  it('leaves a plain molecule name alone', () => {
    const v = expectOk(parseResidueDefinition('Acetamiprid'));
    assert.equal(v.shortName, 'Acetamiprid');
    assert.equal(v.displayName, 'Acetamiprid');
    assert.equal(v.isSum, false);
    assert.equal(v.synonym, null);
  });

  it('flags a sum definition and keeps the full text authoritative', () => {
    const raw = 'Carbendazim and benomyl (sum of benomyl and carbendazim expressed as carbendazim)';
    const v = expectOk(parseResidueDefinition(raw));
    assert.equal(v.isSum, true);
    assert.equal(v.shortName, 'Carbendazim and benomyl');
    assert.equal(v.displayName, raw);
    assert.equal(v.synonym, null, 'a sum qualifier is not a synonym');
  });

  it('recognises the other real GB sum forms', () => {
    for (const raw of [
      'Aldrin and Dieldrin (Aldrin and dieldrin combined expressed as dieldrin)',
      'Abamectin (sum of avermectin B1a, avermectin B1b and delta-8,9 isomer of avermectin B1a, expressed as avermectin B1a)',
      '2,4-D (sum of 2,4-D, its salts, its esters and its conjugates, expressed as 2,4-D)',
      'Bifenthrin (sum of isomers)',
      'Aldicarb (sum of aldicarb, its sulfoxide and its sulfone, expressed as aldicarb)',
    ]) {
      assert.equal(expectOk(parseResidueDefinition(raw)).isSum, true, raw);
    }
  });

  it('treats a trailing non-sum parenthetical as a synonym (59 GB rows)', () => {
    const v = expectOk(parseResidueDefinition('1,2-dibromoethane (ethylene dibromide)'));
    assert.equal(v.shortName, '1,2-dibromoethane');
    assert.equal(v.synonym, 'ethylene dibromide');
    assert.equal(v.isSum, false);
  });

  it('does NOT split a parenthesis interior to a chemical name', () => {
    // "bis(4-ethylphenyl)" is part of the name. Splitting on it produces a
    // mangled molecule that will never match a lab result.
    const raw = '1,1-dichloro-2,2-bis(4-ethylphenyl)ethane';
    const v = expectOk(parseResidueDefinition(raw));
    assert.equal(v.shortName, raw);
    assert.equal(v.synonym, null);
  });

  it('handles nested parentheses when the string does close with one', () => {
    const v = expectOk(parseResidueDefinition('Quintozene (Pentachloronitrobenzene (PCNB))'));
    assert.equal(v.shortName, 'Quintozene');
  });

  it('strips the editorial "NEW:" prefix (30 GB rows)', () => {
    const raw =
      'NEW: 2-amino-4-methoxy-6-(trifluormethyl)-1,3,5-triazine (AMTT), resulting from the use of tritosulfuron';
    const v = expectOk(parseResidueDefinition(raw));
    assert.equal(v.wasMarkedNew, true);
    assert.ok(!v.displayName.startsWith('NEW:'), 'prefix must not survive into the stored name');
    assert.ok(v.displayName.startsWith('2-amino'));
  });

  it('trims trailing whitespace (2 GB rows, e.g. "ABE-IT 56 ")', () => {
    assert.equal(expectOk(parseResidueDefinition('ABE-IT 56 ')).shortName, 'ABE-IT 56');
  });

  it('rejects blanks and header tokens', () => {
    expectErr(parseResidueDefinition(''), 'EMPTY');
    expectErr(parseResidueDefinition('   '), 'EMPTY');
    expectErr(parseResidueDefinition('Residue Definition'), 'HEADER_ROW');
    expectErr(parseResidueDefinition('NEW:'), 'EMPTY');
    expectErr(parseResidueDefinition(42), 'UNRECOGNISED_FORM');
  });
});

describe('toMgKg — unit conversion is explicit or it fails', () => {
  it('treats ppm and mg/kg as equal, by declared mapping not assumption', () => {
    assert.equal(expectOk(toMgKg(0.05, 'mg/kg')), 0.05);
    assert.equal(expectOk(toMgKg(0.05, 'ppm')), 0.05);
    assert.equal(expectOk(toMgKg(0.05, 'PPM')), 0.05);
  });

  it('converts the pyrrolizidine-alkaloid µg/kg case correctly', () => {
    // Real: PA sum 1202 µg/kg on cumin lot SE/KW/1166. Read as mg/kg it is
    // 1000x over-stated; the conversion must be applied, not assumed away.
    assert.equal(expectOk(toMgKg(1202, 'µg/kg')), 1.202);
    assert.equal(expectOk(toMgKg(1202, 'μg/kg')), 1.202); // greek mu variant
    assert.equal(expectOk(toMgKg(1202, 'ug/kg')), 1.202);
    assert.equal(expectOk(toMgKg(1202, 'ppb')), 1.202);
  });

  it('refuses an unknown unit instead of passing the number through', () => {
    expectErr(toMgKg(1, 'mg/l'), 'UNKNOWN_UNIT');
    expectErr(toMgKg(1, ''), 'UNKNOWN_UNIT');
    expectErr(toMgKg(1, '%'), 'UNKNOWN_UNIT');
    expectErr(toMgKg(1, 'mg'), 'UNKNOWN_UNIT');
  });
});

describe('normalizeMoleculeKey — exact matching only', () => {
  it('produces a stable key across spelling and spacing variants', () => {
    assert.equal(normalizeMoleculeKey('  Imida-cloprid '), 'imida cloprid');
    assert.equal(normalizeMoleculeKey('Lambda-Cyhalothrin'), 'lambda cyhalothrin');
    assert.equal(normalizeMoleculeKey('2,4-D'), '2 4 d');
  });

  it('keeps distinct substances distinct — the bromide trap', () => {
    // Substring matching "Bromide" against the GB coriander sheet returns both
    // "1,2-dibromoethane (ethylene dibromide)" at 0.02 and "Bromide ion" at 400.
    // A 20,000x spread. These keys must never collide, and matching must be exact.
    const a = normalizeMoleculeKey('Bromide ion');
    const b = normalizeMoleculeKey('1,2-dibromoethane (ethylene dibromide)');
    assert.notEqual(a, b);
    assert.ok(!a.includes(b) && !b.includes(a) || a !== b);
    assert.equal(a, 'bromide ion');
  });

  it('does not collapse different molecules to the same key', () => {
    const names = [
      'Chlorpyrifos',
      'Chlorpyrifos methyl',
      'Endosulfan-alpha',
      'Endosulfan-beta',
      'Endosulfan sulfate',
      'Fenthion sulfone',
      'Fenthion sulfoxide',
      'Phorate sulfone',
      'Phorate sulfoxide',
    ];
    const keys = names.map(normalizeMoleculeKey);
    assert.equal(new Set(keys).size, names.length, 'every distinct name needs a distinct key');
  });
});
