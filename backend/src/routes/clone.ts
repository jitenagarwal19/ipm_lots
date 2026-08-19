/**
 * Clone one compliance profile's limits into another.
 *
 *   GET  /api/settings/compliance/clone/sources
 *   POST /api/settings/compliance/clone/preview   { source_profile_id, target_profile_id }
 *   POST /api/settings/compliance/clone/commit    { target_profile_id, source_profile_id, rows }
 *
 * A data-entry accelerator, not a statement of fact. Seeding 647 rows beats
 * typing them, but two limits that coincide across products or regimes are
 * independent regulatory facts — the copy must never masquerade as verified.
 * So every written row carries:
 *
 *   verification_status = COPIED_UNVERIFIED
 *   inherited_from      = "UK / Cumin Seed"
 *   copied_from_limit_id
 *
 * The register citations (regulation_ref, enforcement_date, applies_to,
 * source_commodity) DO travel, by explicit choice, so the source position is
 * visible while someone works through the list. That is precisely why the three
 * fields above are mandatory: a second-hand citation with nothing marking it as
 * second-hand is indistinguishable from a researched one.
 *
 * Nothing is written by preview. The client edits the staged rows and commits
 * the final set, so an abandoned clone leaves no trace.
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { serverLog } from '../lib/serverLog';

const router = Router();
const prisma = new PrismaClient();

const COPIED = 'COPIED_UNVERIFIED';

function label(profile: any) {
  return `${profile.standard.code} / ${profile.product.name}`;
}

/** Profiles that have something worth copying, for the source picker. */
router.get('/sources', async (_req, res) => {
  try {
    const profiles = await prisma.complianceProfile.findMany({
      include: {
        product: true,
        standard: true,
        _count: { select: { limits: true } },
      },
    });
    res.json({
      profiles: profiles
        .filter((p) => p._count.limits > 0)
        .map((p) => ({
          id: p.id,
          label: label(p),
          product: p.product.name,
          standard: p.standard.code,
          count: p._count.limits,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/preview', async (req, res) => {
  try {
    const sourceId = String(req.body?.source_profile_id ?? '');
    const targetId = String(req.body?.target_profile_id ?? '');
    if (!sourceId || !targetId) {
      return res.status(400).json({ error: 'source_profile_id and target_profile_id are required.' });
    }
    if (sourceId === targetId) {
      return res.status(400).json({ error: 'Source and target are the same profile.' });
    }

    const [source, target] = await Promise.all([
      prisma.complianceProfile.findUnique({
        where: { id: sourceId },
        include: { product: true, standard: true, limits: { include: { molecule: true } } },
      }),
      prisma.complianceProfile.findUnique({
        where: { id: targetId },
        include: { product: true, standard: true, limits: { include: { molecule: true } } },
      }),
    ]);
    if (!source) return res.status(404).json({ error: 'Source profile not found.' });
    if (!target) return res.status(404).json({ error: 'Target profile not found.' });

    const existingByMolecule = new Map(target.limits.map((l) => [l.molecule_id, l]));

    const rows = source.limits
      .map((l) => {
        const existing = existingByMolecule.get(l.molecule_id);
        return {
          source_limit_id: l.id,
          molecule_id: l.molecule_id,
          molecule_name: l.molecule.name,
          residue_definition: l.residue_definition,
          // proposed values, editable in the staging screen
          limit_value: l.limit_value,
          limit_kind: l.limit_kind,
          source_value: l.source_value,
          unit: l.unit,
          regulation_ref: l.regulation_ref,
          enforcement_date: l.enforcement_date,
          applies_to: l.applies_to,
          source_commodity: l.source_commodity,
          nabl: l.nabl,
          feasibility: l.feasibility,
          is_sum_definition: l.is_sum_definition,
          footnotes: l.footnotes,
          // conflict state
          conflict: Boolean(existing),
          existing: existing
            ? {
                limit_value: existing.limit_value,
                limit_kind: existing.limit_kind,
                verification_status: existing.verification_status,
              }
            : null,
          // default action: create when new, keep the target's own value when it
          // already has one. Never silently replace something already there.
          action: existing ? 'skip' : 'create',
        };
      })
      .sort((a, b) => {
        // Conflicts first — they are the rows needing a decision.
        if (a.conflict !== b.conflict) return a.conflict ? -1 : 1;
        return a.molecule_name.localeCompare(b.molecule_name);
      });

    res.json({
      source: { id: source.id, label: label(source), count: source.limits.length },
      target: { id: target.id, label: label(target), count: target.limits.length },
      crossRegime: source.standard_id !== target.standard_id,
      crossProduct: source.product_id !== target.product_id,
      rows,
    });
  } catch (error: any) {
    serverLog('[CLONE] preview failed:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/commit', async (req, res) => {
  try {
    const targetId = String(req.body?.target_profile_id ?? '');
    const sourceId = String(req.body?.source_profile_id ?? '');
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!targetId) return res.status(400).json({ error: 'target_profile_id is required.' });

    const [target, source] = await Promise.all([
      prisma.complianceProfile.findUnique({
        where: { id: targetId },
        include: { product: true, standard: true },
      }),
      sourceId
        ? prisma.complianceProfile.findUnique({
            where: { id: sourceId },
            include: { product: true, standard: true },
          })
        : Promise.resolve(null),
    ]);
    if (!target) return res.status(404).json({ error: 'Target profile not found.' });

    const inheritedFrom = source ? label(source) : null;
    const wanted = rows.filter((r: any) => r.action === 'create' || r.action === 'replace');

    const result = await prisma.$transaction(async (tx) => {
      let created = 0;
      let replaced = 0;

      for (const row of wanted) {
        const moleculeId = String(row.molecule_id ?? '');
        if (!moleculeId) continue;

        const value = Number(row.limit_value);
        if (!Number.isFinite(value)) {
          throw new Error(`"${row.molecule_name}" has a non-numeric limit.`);
        }

        const data = {
          profile_id: target.id,
          standard_id: target.standard_id,
          product_id: target.product_id,
          molecule_id: moleculeId,
          limit_value: value,
          unit: 'mg/kg',
          limit_kind: String(row.limit_kind || 'VALUE'),
          source_value: row.source_value ?? null,
          residue_definition: row.residue_definition ?? null,
          is_sum_definition: Boolean(row.is_sum_definition),
          // Citations travel. inherited_from + COPIED_UNVERIFIED are what stop
          // them reading as this regime's own sourcing.
          regulation_ref: row.regulation_ref ?? null,
          enforcement_date: row.enforcement_date ? new Date(row.enforcement_date) : null,
          applies_to: row.applies_to ?? null,
          source_commodity: row.source_commodity ?? null,
          nabl: typeof row.nabl === 'boolean' ? row.nabl : null,
          feasibility: typeof row.feasibility === 'boolean' ? row.feasibility : null,
          footnotes: row.footnotes ?? null,
          verification_status: COPIED,
          copied_from_limit_id: row.source_limit_id ?? null,
          inherited_from: inheritedFrom,
          notes: inheritedFrom
            ? `Copied from ${inheritedFrom}. Citations below are that regime's — not verified for ${label(target)}.`
            : 'Copied from another profile — not verified for this one.',
        };

        const existing = await tx.complianceLimit.findFirst({
          where: { profile_id: target.id, molecule_id: moleculeId },
        });

        if (existing) {
          if (row.action !== 'replace') continue;
          await tx.complianceLimit.update({ where: { id: existing.id }, data });
          replaced++;
        } else {
          await tx.complianceLimit.create({ data });
          created++;
        }
      }

      await tx.complianceChangeLog.create({
        data: {
          profile_id: target.id,
          action: 'CLONED_FROM_PROFILE',
          message:
            `Cloned ${created + replaced} limits into ${label(target)}` +
            (inheritedFrom ? ` from ${inheritedFrom}` : '') +
            `. ${created} created, ${replaced} replaced. All marked ${COPIED}.`,
          before_json: null,
          after_json: JSON.stringify({ source: inheritedFrom, created, replaced }),
          actor: 'clone_wizard',
        },
      });

      return { created, replaced };
    }, { timeout: 120_000 });

    res.json({ ok: true, ...result });
  } catch (error: any) {
    serverLog('[CLONE] commit failed:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;
