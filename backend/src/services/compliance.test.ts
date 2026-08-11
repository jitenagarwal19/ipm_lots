import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCompliancePreview, isDetectedMolecule, normalizeMoleculeName } from './compliance';
import { NOT_REQUIRED_SENTINEL } from '../lib/limits/kinds';

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
  it('prefers profile limits for the product and standard pair', async () => {
    const client = fakeClient({
      limits: [
        { standard_id: 'std-1', molecule_id: 'mol-1', product_id: 'product-1', limit_value: 0.02, unit: 'mg/kg' },
      ],
      profile: {
        id: 'profile-1',
        standard_id: 'std-1',
        product_id: 'product-1',
        fallback_limit: 0.03,
        fallback_unit: 'mg/kg',
        limits: [
          { standard_id: 'std-1', molecule_id: 'mol-1', product_id: 'product-1', limit_value: 0.015, unit: 'mg/kg' },
        ],
      },
    });

    const preview = await buildCompliancePreview(client, 'report-1', 'std-1');

    assert.equal(preview.rows[0].limitValue, 0.015);
    assert.equal(preview.rows[0].limitSource, 'PROFILE');
    assert.equal(preview.rows[0].isCompliant, true);
  });

  it('uses the profile default before the standard fallback', async () => {
    const client = fakeClient({
      limits: [],
      profile: {
        id: 'profile-1',
        standard_id: 'std-1',
        product_id: 'product-1',
        fallback_limit: 0.012,
        fallback_unit: 'mg/kg',
        limits: [],
      },
    });

    const preview = await buildCompliancePreview(client, 'report-1', 'std-1');

    assert.equal(preview.rows[0].limitValue, 0.012);
    assert.equal(preview.rows[0].limitSource, 'PROFILE_DEFAULT');
    assert.equal(preview.rows[0].fallbackUsed, true);
  });

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
    const client = fakeClient({ limits: [], profile: null });

    const preview = await buildCompliancePreview(client, 'report-1', 'std-1');

    assert.equal(preview.rows[0].limitValue, 0.01);
    assert.equal(preview.rows[0].limitUnit, 'mg/kg');
    assert.equal(preview.rows[0].fallbackUsed, true);
  });

  /**
   * Annex IV exemptions ("No MRL Required") are ~20% of the GB register. They
   * carry a sentinel rather than a published number, so both halves matter: the
   * verdict must be compliant, and the kind must travel so nothing prints the
   * sentinel as if it were a limit.
   */
  it('passes an exempt substance and carries its kind, not the sentinel', async () => {
    const client = fakeClient({
      limits: [],
      profile: {
        id: 'profile-1',
        standard_id: 'std-1',
        product_id: 'product-1',
        fallback_limit: 0.01,
        fallback_unit: 'mg/kg',
        limits: [{
          standard_id: 'std-1',
          molecule_id: 'mol-1',
          product_id: 'product-1',
          limit_value: NOT_REQUIRED_SENTINEL,
          unit: 'mg/kg',
          limit_kind: 'NOT_REQUIRED',
          source_value: 'No MRL Required',
        }],
      },
    });

    const preview = await buildCompliancePreview(client, 'report-1', 'std-1');

    assert.equal(preview.rows[0].isCompliant, true);
    assert.equal(preview.rows[0].limitKind, 'NOT_REQUIRED');
    assert.equal(preview.rows[0].limitSourceValue, 'No MRL Required');
    assert.equal(preview.rows[0].fallbackUsed, false, 'an exemption is a real answer, not a fallback');
  });

  it('keeps AT_LOD distinct from an ordinary limit of the same value', async () => {
    const client = fakeClient({
      limits: [],
      profile: {
        id: 'profile-1',
        standard_id: 'std-1',
        product_id: 'product-1',
        fallback_limit: 0.01,
        fallback_unit: 'mg/kg',
        limits: [{
          standard_id: 'std-1',
          molecule_id: 'mol-1',
          product_id: 'product-1',
          limit_value: 0.02,
          unit: 'mg/kg',
          limit_kind: 'AT_LOD',
          source_value: '0.02 *',
          residue_definition: 'Imidacloprid',
        }],
      },
    });

    const preview = await buildCompliancePreview(client, 'report-1', 'std-1');

    assert.equal(preview.rows[0].limitKind, 'AT_LOD');
    assert.equal(preview.rows[0].limitValue, 0.02);
    assert.equal(preview.rows[0].limitSourceValue, '0.02 *');
    // 0.015 measured against an at-LOD limit of 0.02 is a real detection that
    // is nonetheless under the limit.
    assert.equal(preview.rows[0].isCompliant, true);
  });

  it('fails a prohibited substance on detection alone', async () => {
    const client = fakeClient({
      limits: [],
      profile: {
        id: 'profile-1',
        standard_id: 'std-1',
        product_id: 'product-1',
        fallback_limit: 0.01,
        fallback_unit: 'mg/kg',
        limits: [{
          standard_id: 'std-1',
          molecule_id: 'mol-1',
          product_id: 'product-1',
          limit_value: 0,
          unit: 'mg/kg',
          limit_kind: 'PROHIBITED',
          source_value: 'Prohibited',
        }],
      },
    });

    const preview = await buildCompliancePreview(client, 'report-1', 'std-1');

    assert.equal(preview.rows[0].isCompliant, false);
    assert.equal(preview.rows[0].limitKind, 'PROHIBITED');
  });

  it('defaults a limit with no recorded kind to VALUE', async () => {
    const client = fakeClient({
      limits: [
        { standard_id: 'std-1', molecule_id: 'mol-1', product_id: 'product-1', limit_value: 0.02, unit: 'mg/kg' },
      ],
    });

    const preview = await buildCompliancePreview(client, 'report-1', 'std-1');

    assert.equal(preview.rows[0].limitKind, 'VALUE');
    assert.equal(preview.rows[0].isCompliant, true);
  });
});

function fakeClient({ limits, profile }: { limits: any[], profile?: any }) {
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
    complianceProfile: {
      findFirst: async ({ where }: { where: any }) => (
        profile &&
        profile.standard_id === where.standard_id &&
        profile.product_id === where.product_id
          ? profile
          : null
      ),
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
