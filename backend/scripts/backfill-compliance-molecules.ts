import { PrismaClient } from '@prisma/client';
import { normalizeMoleculeName } from '../src/services/compliance';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.moleculeResult.findMany({
    where: { molecule_id: null },
    orderBy: { createdAt: 'asc' },
  });
  let linked = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row.molecule_name.trim();
    const normalized = normalizeMoleculeName(name);
    if (!normalized) {
      skipped++;
      continue;
    }

    const molecule = await prisma.molecule.upsert({
      where: { normalized_name: normalized },
      update: { cas_number: row.cas_number || undefined },
      create: {
        name,
        normalized_name: normalized,
        cas_number: row.cas_number,
      },
    });

    await prisma.moleculeAlias.upsert({
      where: { normalized_alias: normalized },
      update: { molecule_id: molecule.id, alias: name },
      create: {
        molecule_id: molecule.id,
        alias: name,
        normalized_alias: normalized,
        source: 'backfill',
      },
    });

    await prisma.moleculeResult.update({
      where: { id: row.id },
      data: { molecule_id: molecule.id },
    });
    linked++;
  }

  console.log(`Linked ${linked} molecule results. Skipped ${skipped}.`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
