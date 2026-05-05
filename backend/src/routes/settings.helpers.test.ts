import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { logComplianceChange, matchCsvMolecule, parseAliases } from './settings';

describe('parseAliases', () => {
  it('splits comma, pipe, and semicolon aliases', () => {
    assert.deepEqual(parseAliases('Alpha, Beta|Gamma; Delta'), ['Alpha', 'Beta', 'Gamma', 'Delta']);
  });
});

describe('matchCsvMolecule', () => {
  it('matches CSV molecules by CAS before name or alias', async () => {
    const client = {
      molecule: {
        findFirst: async ({ where }: { where: any }) => (
          where.cas_number === '138261-41-3'
            ? { id: 'mol-cas', name: 'Imidacloprid', aliases: [] }
            : null
        ),
        findUnique: async () => ({ id: 'mol-name', name: 'Wrong name match', aliases: [] }),
      },
      moleculeAlias: {
        findUnique: async () => null,
      },
    };

    const match = await matchCsvMolecule(client, {
      molecule_name: 'Imidacloprid',
      cas_number: '138261-41-3',
    });

    assert.equal(match.molecule?.id, 'mol-cas');
    assert.equal(match.match_type, 'CAS');
    assert.equal(match.confidence, 'high');
  });

  it('falls back to alias matching when no canonical name exists', async () => {
    const client = {
      molecule: {
        findFirst: async () => null,
        findUnique: async () => null,
      },
      moleculeAlias: {
        findUnique: async ({ where }: { where: any }) => (
          where.normalized_alias === 'imida cloprid'
            ? { molecule: { id: 'mol-alias', name: 'Imidacloprid', aliases: [] } }
            : null
        ),
      },
    };

    const match = await matchCsvMolecule(client, { molecule_name: 'Imida-cloprid' });

    assert.equal(match.molecule?.id, 'mol-alias');
    assert.equal(match.match_type, 'ALIAS');
    assert.equal(match.confidence, 'medium');
  });
});

describe('logComplianceChange', () => {
  it('stores action metadata and JSON snapshots', async () => {
    let data: any = null;
    const client = {
      complianceChangeLog: {
        create: async (input: any) => {
          data = input.data;
          return input.data;
        },
      },
    };

    await logComplianceChange(
      client,
      'profile-1',
      'DEFAULT_UPDATED',
      'Updated default limit.',
      { fallback_limit: 0.01 },
      { fallback_limit: 0.02 }
    );

    assert.equal(data.profile_id, 'profile-1');
    assert.equal(data.action, 'DEFAULT_UPDATED');
    assert.equal(data.before_json, '{"fallback_limit":0.01}');
    assert.equal(data.after_json, '{"fallback_limit":0.02}');
  });
});
