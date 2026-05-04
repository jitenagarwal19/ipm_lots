import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCompliancePreview, isDetectedMolecule, normalizeMoleculeName } from './compliance';

describe('normalizeMoleculeName', () => {
  it('creates stable matching keys for lab spelling variants', () => {
    assert.equal(normalizeMoleculeName('  Imida-cloprid  '), 'imida cloprid');
    assert.equal(normalizeMoleculeName('Imidacloprid (CAS)'), 'imidacloprid cas');
  });
});

describe('isDetectedMolecule', () => {
  it('honors explicit detected flags and common not-detected text', () => {
    assert.equal(isDetectedMolecule({ is_detected: true, result: 'ND' }), true);
    assert.equal(isDetectedMolecule({ is_detected: false, result: '0.02' }), false);
    assert.equal(isDetectedMolecule({ result: 'Not Detected' }), false);
    assert.equal(isDetectedMolecule({ result: '0.02 mg/kg' }), true);
  });
});

describe('buildCompliancePreview', () => {
  it('prefers product limits over standard-wide limits', async () => {
    const client = fakeClient({
      limits: [
        { standard_id: 'std-1', molecule_id: 'mol-1', product_id: null, limit_value: 0.05, unit: 'mg/kg' },
        { standard_id: 'std-1', molecule_id: 'mol-1', product_id: 'product-1', limit_value: 0.02, unit: 'mg/kg' },
      ],
    });

    const preview = await buildCompliancePreview(client, 'report-1', 'std-1');

    assert.equal(preview.rows[0].limitValue, 0.02);
    assert.equal(preview.rows[0].limitSource, 'PRODUCT');
    assert.equal(preview.rows[0].isCompliant, true);
  });

  it('uses the standard fallback when no configured limit exists', async () => {
    const client = fakeClient({ limits: [] });

    const preview = await buildCompliancePreview(client, 'report-1', 'std-1');

    assert.equal(preview.rows[0].limitValue, 0.01);
    assert.equal(preview.rows[0].limitUnit, 'mg/kg');
    assert.equal(preview.rows[0].fallbackUsed, true);
  });
});

function fakeClient({ limits }: { limits: any[] }) {
  const molecule = { id: 'mol-1', name: 'Imidacloprid', normalized_name: 'imidacloprid', cas_number: null };
  return {
    labReport: {
      findUnique: async () => ({
        id: 'report-1',
        test: { lot: { product_id: 'product-1' } },
        complianceChecks: [],
        moleculeResults: [{
          id: 'mr-1',
          molecule_id: 'mol-1',
          molecule_name: 'Imidacloprid',
          numeric_result: 0.015,
          result: '0.015 mg/kg',
          unit: 'mg/kg',
          is_detected: true,
        }],
      }),
    },
    complianceStandard: {
      findUnique: async () => ({
        id: 'std-1',
        code: 'EU',
        name: 'EU MRL',
        fallback_limit: 0.01,
        fallback_unit: 'mg/kg',
      }),
    },
    molecule: {
      findUnique: async () => molecule,
    },
    moleculeResult: {
      update: async () => ({}),
    },
    complianceLimit: {
      findFirst: async ({ where }: { where: any }) => (
        limits.find((limit) =>
          limit.standard_id === where.standard_id &&
          limit.molecule_id === where.molecule_id &&
          limit.product_id === where.product_id
        ) || null
      ),
    },
  };
}
