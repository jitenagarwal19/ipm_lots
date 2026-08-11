# GB MRL register — import record

The GB (Great Britain) MRL register is loaded from the per-commodity HSE
workbook exports in `uk mrls/`.

```bash
cd backend
npm run import:gb-mrls              # dry run — writes nothing, reports everything
npm run import:gb-mrls -- --commit  # writes, in one transaction
```

The importer is idempotent: re-running it re-reads the sheets and updates in
place. Everything runs inside a single transaction, so a failure leaves the
database untouched rather than half-loaded.

---

## What was loaded — 11 Aug 2026

| Source file | GB commodity | Our product(s) | Rows |
|---|---|---|---|
| `coriander-GB_MRLs-07_Oct_2025.xlsx` | Coriander seed | Coriander Seed Whole, Coriander Split | 647 × 2 |
| `cumin-GB_MRLs-30_Sep_2025.xlsx` | Cumin seed | Cumin Seed | 647 |
| `Fennel-GB_MRLs-07_Oct_2025.xlsx` | Fennel seed | Fennel Seed | 647 |
| `Fenugreek-GB_MRLs-07_Oct_2025.xlsx` | Fenugreek | Fenugreek Seed *(created)* | 647 |
| `Mustard seeds-GB_MRLs-07_Oct_2025.xlsx` | Mustard seeds | Mustard Seed | 646 |
| `Sesame seeds-GB_MRLs-07_Oct_2025.xlsx` | Sesame seeds | Sesame Seed *(created)* | 646 |
| `Turmeric-GB_MRLs-15_Feb_2025.xlsx` | Turmeric/curcuma | Turmeric Finger | 642 |
| `Ajwain-caraway-GB_MRLs-15_Feb_2025 (1).xlsx` | **Caraway** | Ajwain **(proxy)** | 642 |

**5,811 limit rows**, 647 distinct residue definitions, 608 new molecules.

Verified after loading by re-reading every workbook through an independent
parser and comparing all 5,811 rows cell by cell: zero mismatches.

---

## Judgment calls — these are legal, not technical

**Ajwain uses the Caraway register.** GB publishes no entry for ajwain
(*Trachyspermum ammi*). Caraway (*Carum carvi*) is the closest published
spice-seed commodity. Confirmed by Jiten, 11 Aug 2026. Every Ajwain row carries
`verification_status = PROXY_UNVERIFIED` and states the substitution in `notes`,
and the limits grid shows a ⚠ against each one. **Verify before any release
decision rests on it.**

**Chilli was deliberately not loaded.** `Chilli-GB_MRLs-07_Oct_2025.xlsx`
contains the register for *"Sweet peppers/bell peppers"* — a fresh vegetable,
not the dried spice. Its limits are on a fresh-weight basis, and drying
concentrates residues several-fold, so applying them to chilli lots would
understate residues and could produce a false PASS. Needs a re-export of the
correct GB commodity (dried chilli sits in the spice-fruits group).

**Two files are eight months older than the rest.** Turmeric and Ajwain/Caraway
are 15 Feb 2025 exports; the others are 30 Sep / 07 Oct 2025. `snapshot_date`
records this per row. Re-export and re-run to refresh.

**Cumin thiamethoxam was corrected.** The dashboard held 0.05 mg/kg — coriander's
value, evidently copied. The GB register sets cumin at 1.0. Corrected on import
and recorded in `ComplianceChangeLog`. This is not cosmetic: lot SE/SK/13MT
measured 0.048 mg/kg, which read as 96% of limit under the old value and reads
as 5% under the correct one.

---

## Molecule identity

Matching is exact on a normalised key — never substring, never fuzzy. Searching
the GB sheet for "bromide" returns both *1,2-dibromoethane* at 0.02 and
*Bromide ion* at 400; picking the wrong one is unrecoverable.

Resolution order for a register definition:

1. Exact match on the full residue definition (name or alias).
2. Exact match on the short name or trailing synonym — **but only against
   molecules that existed before the import**. Without that restriction the
   register attacks itself: the five `Paraffin Oil (CAS …)` rows are distinct
   substances sharing one short name, and the second would silently overwrite
   the first's limit.
3. Otherwise create a molecule named with the full definition, and register the
   short name as an alias when no other molecule owns it.

Two links were confirmed by hand because the register's name is longer than
ours (see `CONFIRMED_LINKS` in the importer):

- `Carbendazim` ← *Carbendazim and benomyl (sum of benomyl and carbendazim expressed as carbendazim)*
- `Metalaxyl` ← *Metalaxyl including other mixtures of constituent isomers including metalaxyl-M (sum of isomers)*

and one lab-name alias (`CONFIRMED_ALIASES`):

- *Endosulfan: Sum of α,β-endosulfan and endosulfan sulfate* → GB *Endosulfan (sum of alpha- and beta-isomers …)*

### Still unmapped — deliberately

Two names appear on lab reports with no corresponding GB register row:

- **3-Hydroxycarbofuran** — a carbofuran metabolite. GB's carbofuran definition
  is a sum; whether this metabolite falls inside it is a residue-definition
  judgment, not a name match.
- **4-Bromo-2-Chloro phenol** — a profenofos metabolite, not separately listed.

Both resolve to "no limit on file" and produce **CAN'T SAY**, not a PASS. That
is the correct behaviour until someone decides how they map.

---

## Schema additions

`ComplianceLimit` gained the columns the register needs. All are nullable or
defaulted, so hand-entered rows predating the import stay valid.

| Column | Holds |
|---|---|
| `limit_kind` | `VALUE` · `AT_LOD` · `NOT_REQUIRED` · `PROHIBITED` |
| `source_value` | The cell exactly as published — `"0.05 *"`, `"No MRL Required"` |
| `residue_definition`, `is_sum_definition` | What the limit is legally set on |
| `enforcement_date` | When it came into force |
| `regulation_ref` | `GB MRL 2025/011`, `Commission Regulation 149/2008` |
| `footnotes` | Fat-soluble flags, transitional provisions |
| `feasibility`, `nabl` + `_note` | Analytical feasibility and NABL availability, with the register's qualifier (`y (as CS2)`) |
| `applies_to` | Territory as stated (`GB`) |
| `source_commodity`, `source_file`, `snapshot_date` | Provenance and staleness |
| `verification_status` | `IMPORTED_UNVERIFIED` · `PROXY_UNVERIFIED` · `MANUAL_ENTRY` · `VERIFIED` |

### Why `limit_kind` matters more than it looks

`limit_value` is a non-null Float, but two kinds carry no published number:

- **`NOT_REQUIRED`** — Annex IV exempt (acetic acid, putrescine, biological
  agents). **133 of ~647 rows per commodity.** No MRL applies, so any level is
  lawful. Omitting these rows is not an option: an absent limit falls through to
  the 0.01 regime default and turns an exemption into a **false FAIL**.
- **`PROHIBITED`** — banned outright; detection alone fails.

Both store a sentinel (`NOT_REQUIRED_SENTINEL = 1e9`, `PROHIBITED_SENTINEL = 0`)
chosen so a naive `measured <= limit_value` still gives the legally correct
answer. The sentinel is never displayed — `backend/src/lib/limits/kinds.ts`
owns the rendering, and both the settings grid and the country-compliance panel
go through it.

`AT_LOD` shares its number with an ordinary limit but means something different:
the MRL is set at the limit of determination because no use is approved. A
result of 0.013 against an at-LOD limit of 0.05 is a real detection that is
nonetheless legal — worth surfacing, which is why the kind is kept.

**Editing a limit by hand clears every register field** (`MANUAL_ENTRY_FIELDS`
in `routes/settings.ts`). A typed-in number left behind `limit_kind =
NOT_REQUIRED` would render "No MRL required" and pass everything.

---

## Looking a limit up

**MRL Lookup** in the sidebar (`/limits`). Type a substance, get its limit in
every product and every market at once.

Deep links, so an answer can be bookmarked or pasted into an email:

```
/limits?q=chlorpyrifos                     search
/limits?q=chlorpyrifos&molecule=<id>       a specific substance, resolved
```

The grid distinguishes three states, and never collapses them:

| Shown | Means |
|---|---|
| `0.01 *` (green) | A researched limit. `*` = set at the limit of determination |
| `No MRL req.` | Annex IV exempt — no MRL applies |
| `default 0.01` (amber) | **No entry for this substance.** The regime default would be applied — an assumption, not a limit |
| `—` | This product has no profile for that market |

Clicking a cell shows the full record: the residue definition the limit is
legally set on, enforcement date, regulation reference, NABL and feasibility
flags, source commodity, register export date and verification status.

The same question over HTTP, when all three names are known:

```
GET /api/limits/resolve?molecule=chlorpyrifos&product=Coriander%20Seed%20Whole&standard=UK
GET /api/limits/search?q=chlorpyrifos
GET /api/limits/molecule/<id>
```

`resolve` matches the molecule **exactly** (name or alias, normalised) so it
cannot quietly answer about a neighbouring substance; the UI search is
substring, which is safe only because a human picks from the results.

---

## Known gaps

- **The UK regime default is still 0.01 mg/kg.** GB is properly `NO_DEFAULT` —
  every residue definition has an explicit row, so an unlisted substance means
  "no GB entry", not "0.01". Today an unlisted molecule falls to 0.01 and is
  flagged `fallbackUsed`, which surfaces as **CAN'T SAY** rather than a false
  PASS — honest, but the regime policy field from
  [limits-module-design.md](limits-module-design.md) §2 is the real fix.
- **No temporal versioning.** `enforcement_date` is stored, but there is one row
  per (product, molecule) — superseding a limit overwrites it. Reconstructing a
  decision made under an earlier limit is not yet possible.
- **Every imported row is `IMPORTED_UNVERIFIED`.** Nothing distinguishes a
  human-checked limit from a bulk-loaded one yet.
- **No dried-vs-fresh processing factors.** Relevant the moment a fresh-basis
  commodity (like the held-back chilli file) is loaded.
