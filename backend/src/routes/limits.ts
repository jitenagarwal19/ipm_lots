/**
 * MRL lookup — "what is the limit for <substance> in <product> for <market>".
 *
 * Read-only. The question is asked against every market at once, because the
 * commercially useful answer is not "does this pass in the UK" but "which of my
 * markets can this lot serve".
 *
 * Two things this endpoint is careful about:
 *
 *   - It distinguishes "we hold a limit" from "no limit on file, the regime
 *     default would apply" from "this product has no profile for that market".
 *     Collapsing those is how a default gets mistaken for a researched value.
 *   - It never returns a bare number for a limit that has no published number.
 *     `limit_kind` travels with every cell so the caller renders an exemption as
 *     an exemption, not as 1000000000 mg/kg.
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { normalizeMoleculeName } from '../services/compliance';

const router = Router();
const prisma = new PrismaClient();

const SEARCH_LIMIT = 25;

/**
 * GET /api/limits/search?q=chlorpyrifos
 *
 * Molecules whose name or any alias contains the query. Substring matching is
 * safe *here* — a human is choosing from the results — but never in the
 * limit-resolution path, where "bromide" matches both 1,2-dibromoethane at 0.02
 * and Bromide ion at 400.
 */
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) return res.json({ molecules: [] });

    const [byName, byAlias] = await Promise.all([
      prisma.molecule.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        take: SEARCH_LIMIT,
        orderBy: { name: 'asc' },
      }),
      prisma.moleculeAlias.findMany({
        where: { alias: { contains: q, mode: 'insensitive' } },
        take: SEARCH_LIMIT,
        include: { molecule: true },
      }),
    ]);

    const found = new Map<string, { id: string; name: string; cas_number: string | null; matchedAlias: string | null }>();
    for (const m of byName) {
      found.set(m.id, { id: m.id, name: m.name, cas_number: m.cas_number, matchedAlias: null });
    }
    for (const a of byAlias) {
      if (found.has(a.molecule_id)) continue;
      found.set(a.molecule_id, {
        id: a.molecule.id,
        name: a.molecule.name,
        cas_number: a.molecule.cas_number,
        matchedAlias: a.alias,
      });
    }

    const ids = [...found.keys()];
    const counts = ids.length
      ? await prisma.complianceLimit.groupBy({
          by: ['molecule_id'],
          where: { molecule_id: { in: ids } },
          _count: true,
        })
      : [];
    const countByMolecule = new Map(counts.map((c) => [c.molecule_id, c._count]));

    const needle = q.toLowerCase();
    const molecules = [...found.values()]
      .map((m) => ({ ...m, limitCount: countByMolecule.get(m.id) ?? 0 }))
      .sort((a, b) => {
        // Exact match first, then prefix match, then shortest name — so "chlorpyrifos"
        // ranks above "Chlorpyrifos-methyl" rather than alphabetically.
        const rank = (n: string) => {
          const low = n.toLowerCase();
          if (low === needle) return 0;
          if (low.startsWith(needle)) return 1;
          return 2;
        };
        return rank(a.name) - rank(b.name) || a.name.length - b.name.length || a.name.localeCompare(b.name);
      })
      .slice(0, SEARCH_LIMIT);

    res.json({ molecules });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/limits/molecule/:id
 *
 * Every market's answer for one substance, across every product.
 */
router.get('/molecule/:id', async (req, res) => {
  try {
    const molecule = await prisma.molecule.findUnique({
      where: { id: req.params.id },
      include: { aliases: { orderBy: { alias: 'asc' } } },
    });
    if (!molecule) return res.status(404).json({ error: 'Molecule not found.' });

    const [standards, products, limits, profiles] = await Promise.all([
      prisma.complianceStandard.findMany({ where: { is_active: true }, orderBy: { code: 'asc' } }),
      prisma.product.findMany({ orderBy: { name: 'asc' } }),
      prisma.complianceLimit.findMany({
        where: { molecule_id: molecule.id },
        include: { profile: { include: { product: true } }, product: true },
      }),
      prisma.complianceProfile.findMany({ include: { product: true } }),
    ]);

    // (product, standard) -> the limit we hold
    const limitAt = new Map<string, (typeof limits)[number]>();
    for (const l of limits) {
      const productId = l.product_id ?? l.profile?.product_id ?? null;
      if (!productId) continue;
      limitAt.set(`${productId}:${l.standard_id}`, l);
    }
    const profileAt = new Map(profiles.map((p) => [`${p.product_id}:${p.standard_id}`, p]));

    const rows = products
      .map((product) => {
        const cells: Record<string, unknown> = {};
        for (const standard of standards) {
          const key = `${product.id}:${standard.id}`;
          const limit = limitAt.get(key);
          const profile = profileAt.get(key);

          if (limit) {
            cells[standard.id] = {
              state: 'LIMIT',
              limit_value: limit.limit_value,
              limit_kind: limit.limit_kind,
              unit: limit.unit,
              source_value: limit.source_value,
              residue_definition: limit.residue_definition,
              is_sum_definition: limit.is_sum_definition,
              enforcement_date: limit.enforcement_date,
              regulation_ref: limit.regulation_ref,
              footnotes: limit.footnotes,
              feasibility: limit.feasibility,
              feasibility_note: limit.feasibility_note,
              nabl: limit.nabl,
              nabl_note: limit.nabl_note,
              source_commodity: limit.source_commodity,
              snapshot_date: limit.snapshot_date,
              verification_status: limit.verification_status,
              notes: limit.notes,
            };
          } else if (profile) {
            // Configured for this market, but this substance is not in the
            // table — the regime default is what would be applied, and that is
            // an assumption, not a researched limit.
            cells[standard.id] = {
              state: 'REGIME_DEFAULT',
              limit_value: profile.fallback_limit,
              unit: profile.fallback_unit,
            };
          } else {
            cells[standard.id] = { state: 'NO_PROFILE' };
          }
        }
        const configured = standards.some(
          (s) => (cells[s.id] as { state: string }).state !== 'NO_PROFILE'
        );
        return { product: { id: product.id, name: product.name }, cells, configured };
      })
      // Products with nothing set up for any market are noise in this view.
      .filter((row) => row.configured);

    res.json({
      molecule: {
        id: molecule.id,
        name: molecule.name,
        cas_number: molecule.cas_number,
        aliases: molecule.aliases.map((a) => a.alias),
      },
      standards: standards.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        fallback_limit: s.fallback_limit,
        fallback_unit: s.fallback_unit,
      })),
      rows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/limits/resolve?molecule=chlorpyrifos&product=Coriander&standard=UK
 *
 * The one-shot form of the same question, for callers that already know all
 * three names. Matching on molecule is exact-normalised (name or alias) so this
 * cannot quietly answer about a different substance; product and standard match
 * on name/code, case-insensitively.
 */
router.get('/resolve', async (req, res) => {
  try {
    const moleculeName = String(req.query.molecule ?? '').trim();
    const productName = String(req.query.product ?? '').trim();
    const standardCode = String(req.query.standard ?? '').trim();
    if (!moleculeName || !productName || !standardCode) {
      return res.status(400).json({ error: 'molecule, product and standard are all required.' });
    }

    const key = normalizeMoleculeName(moleculeName);
    const molecule =
      (await prisma.molecule.findUnique({ where: { normalized_name: key } })) ??
      (await prisma.moleculeAlias
        .findUnique({ where: { normalized_alias: key }, include: { molecule: true } })
        .then((a) => a?.molecule ?? null));
    if (!molecule) return res.status(404).json({ error: `No molecule matches "${moleculeName}" exactly.` });

    const [product, standard] = await Promise.all([
      prisma.product.findFirst({ where: { name: { equals: productName, mode: 'insensitive' } } }),
      prisma.complianceStandard.findFirst({ where: { code: { equals: standardCode, mode: 'insensitive' } } }),
    ]);
    if (!product) return res.status(404).json({ error: `No product named "${productName}".` });
    if (!standard) return res.status(404).json({ error: `No regulation with code "${standardCode}".` });

    const limit = await prisma.complianceLimit.findFirst({
      where: {
        molecule_id: molecule.id,
        standard_id: standard.id,
        OR: [{ product_id: product.id }, { profile: { product_id: product.id } }],
      },
    });

    if (!limit) {
      const profile = await prisma.complianceProfile.findFirst({
        where: { product_id: product.id, standard_id: standard.id },
      });
      return res.json({
        molecule: molecule.name,
        product: product.name,
        standard: standard.code,
        state: profile ? 'REGIME_DEFAULT' : 'NO_PROFILE',
        limit_value: profile?.fallback_limit ?? null,
        unit: profile?.fallback_unit ?? null,
      });
    }

    res.json({
      molecule: molecule.name,
      product: product.name,
      standard: standard.code,
      state: 'LIMIT',
      limit_value: limit.limit_value,
      limit_kind: limit.limit_kind,
      unit: limit.unit,
      source_value: limit.source_value,
      residue_definition: limit.residue_definition,
      enforcement_date: limit.enforcement_date,
      regulation_ref: limit.regulation_ref,
      verification_status: limit.verification_status,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
