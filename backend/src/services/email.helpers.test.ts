import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  expandUndetectedMolecules,
  isPdfAttachment,
  mergeReportsForSameLot,
  shouldAnalyzeEmailBody,
  unionMergeReportsByLot,
} from './email';

describe('isPdfAttachment', () => {
  it('returns true for .pdf extensions regardless of case', () => {
    assert.equal(isPdfAttachment('Report.PDF'), true);
    assert.equal(isPdfAttachment('lot_123.pdf'), true);
  });

  it('returns false for image attachments and other types', () => {
    assert.equal(isPdfAttachment('photo.jpg'), false);
    assert.equal(isPdfAttachment('photo.JPEG'), false);
    assert.equal(isPdfAttachment('signature.png'), false);
    assert.equal(isPdfAttachment('readme.txt'), false);
    assert.equal(isPdfAttachment(''), false);
    assert.equal(isPdfAttachment(null), false);
    assert.equal(isPdfAttachment(undefined), false);
  });
});

describe('shouldAnalyzeEmailBody', () => {
  it('skips bodies that are too short', () => {
    assert.equal(shouldAnalyzeEmailBody(''), false);
    assert.equal(shouldAnalyzeEmailBody('Please find attached.'), false);
  });

  it('skips bodies without report-related keywords', () => {
    const longBody = 'Hello team, '.repeat(40);
    assert.equal(longBody.length > 200, true);
    assert.equal(shouldAnalyzeEmailBody(longBody), false);
  });

  it('analyzes long bodies that look like a lab summary', () => {
    const body =
      'Please find the lab certificate for Lot LOT-123. ' +
      'All listed pesticide residues were below the LOQ of 0.01 ppm. ' +
      'No analyte was detected above the specification limit. ' +
      'Sample condition was intact upon receipt.';
    assert.equal(body.length > 200, true);
    assert.equal(shouldAnalyzeEmailBody(body), true);
  });
});

describe('mergeReportsForSameLot', () => {
  it('fills missing metadata from incoming without overwriting existing', () => {
    const existing = {
      lotNumber: 'LOT-1',
      metadata: { reportId: 'A', labName: 'Acme', sampleId: null },
      moleculeResults: [{ moleculeName: 'Mol A', result: '0.05 ppm' }],
      undetectedMolecules: ['Mol B'],
    };
    const incoming = {
      lotNumber: 'LOT-1',
      metadata: { reportId: 'X-from-body', sampleId: 'S-1', clientName: 'In-house' },
      moleculeResults: [{ moleculeName: 'Mol C', result: '0.01 ppm' }],
      undetectedMolecules: ['Mol B', 'Mol D'],
      undetectedSharedDefaults: { reportingLimit: '0.01 ppm' },
    };

    const merged = mergeReportsForSameLot(existing, incoming);

    assert.equal(merged.lotNumber, 'LOT-1');
    assert.equal(merged.metadata.reportId, 'A', 'existing reportId should win');
    assert.equal(merged.metadata.labName, 'Acme');
    assert.equal(merged.metadata.sampleId, 'S-1', 'incoming sampleId fills the null');
    assert.equal(merged.metadata.clientName, 'In-house', 'new field gets added');

    const detectedNames = merged.moleculeResults.map((m: any) => m.moleculeName).sort();
    assert.deepEqual(detectedNames, ['Mol A', 'Mol C']);

    assert.deepEqual(merged.undetectedMolecules.sort(), ['Mol B', 'Mol D']);
    assert.equal(merged.undetectedSharedDefaults.reportingLimit, '0.01 ppm');
  });

  it('returns the other side when one input is null', () => {
    const r = { lotNumber: 'L', metadata: {} };
    assert.equal(mergeReportsForSameLot(null, r), r);
    assert.equal(mergeReportsForSameLot(r, null), r);
  });

  it('does not duplicate detected molecules with the same name (case-insensitive)', () => {
    const a = {
      lotNumber: 'L',
      moleculeResults: [{ moleculeName: 'Imidacloprid', result: '0.02 ppm' }],
    };
    const b = {
      lotNumber: 'L',
      moleculeResults: [{ moleculeName: 'imidacloprid', result: '0.03 ppm' }],
    };

    const merged = mergeReportsForSameLot(a, b);
    assert.equal(merged.moleculeResults.length, 1);
    assert.equal(merged.moleculeResults[0].result, '0.02 ppm');
  });
});

describe('unionMergeReportsByLot', () => {
  it('groups same-lot reports across the input array (case-insensitive)', () => {
    const reports = [
      { lotNumber: 'lot-1', moleculeResults: [{ moleculeName: 'A' }], undetectedMolecules: ['X'] },
      { lotNumber: 'LOT-1', moleculeResults: [{ moleculeName: 'B' }], undetectedMolecules: ['Y'] },
      { lotNumber: 'LOT-2', moleculeResults: [{ moleculeName: 'C' }] },
    ];
    const merged = unionMergeReportsByLot(reports);
    assert.equal(merged.length, 2);

    const lot1 = merged.find((r: any) => String(r.lotNumber).toLowerCase() === 'lot-1');
    assert.deepEqual(
      lot1.moleculeResults.map((m: any) => m.moleculeName).sort(),
      ['A', 'B']
    );
    assert.deepEqual(lot1.undetectedMolecules.sort(), ['X', 'Y']);
  });

  it('keeps reports without a lotNumber as separate entries', () => {
    const reports = [
      { lotNumber: null, moleculeResults: [] },
      { lotNumber: '', moleculeResults: [] },
      { lotNumber: 'LOT-Z', moleculeResults: [] },
    ];
    const merged = unionMergeReportsByLot(reports);
    assert.equal(merged.length, 3);
  });
});

describe('expandUndetectedMolecules', () => {
  it('expands a list of names into rows using the shared defaults', () => {
    const report = {
      undetectedMolecules: ['Chlorantraniliprole', 'Clothianidin'],
      undetectedSharedDefaults: {
        result: 'BLQ',
        reportingLimit: '0.01 ppm',
        specificationLimit: '< 0.10 ppm',
        method: 'GC-MS',
        isCompliant: true,
      },
    };
    const rows = expandUndetectedMolecules(report);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].moleculeName, 'Chlorantraniliprole');
    assert.equal(rows[0].result, 'BLQ');
    assert.equal(rows[0].reportingLimit, '0.01 ppm');
    assert.equal(rows[0].method, 'GC-MS');
    assert.equal(rows[0].isDetected, false);
    assert.equal(rows[0].isCompliant, true);
  });

  it('falls back to "Not Detected" when no shared result is provided', () => {
    const rows = expandUndetectedMolecules({ undetectedMolecules: ['Mol A'] });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].result, 'Not Detected');
    assert.equal(rows[0].isDetected, false);
  });

  it('returns an empty array when there are no undetected molecules', () => {
    assert.deepEqual(expandUndetectedMolecules({}), []);
    assert.deepEqual(expandUndetectedMolecules({ undetectedMolecules: [] }), []);
    assert.deepEqual(expandUndetectedMolecules({ undetectedMolecules: ['', '   '] }), []);
  });

  it('accepts object entries with an explicit casNumber', () => {
    const rows = expandUndetectedMolecules({
      undetectedMolecules: [{ moleculeName: 'Acetamiprid', casNumber: '135410-20-7' }],
      undetectedSharedDefaults: { reportingLimit: '0.01 ppm' },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].casNumber, '135410-20-7');
    assert.equal(rows[0].reportingLimit, '0.01 ppm');
  });
});
