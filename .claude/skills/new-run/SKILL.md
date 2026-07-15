---
name: new-run
description: Generate on-brand ad campaign asset packs (Google RSA/PMax + Meta) from a target repo's design system. Use when the user wants marketing/advertising assets for a product, or invokes /new-run with a repo path and campaign count.
---

# New asset-generation run

You are the worker behind the cockpit UI. All coordination happens through `runs/<run-id>/run.json` (schema: `src/types/run.ts`). The UI never generates anything; you never approve anything.

## Inputs

- `repoPath` — absolute path to the target product repo
- `campaignCount` — number of campaigns (default 3)

If missing, ask the user.

## Workflow

### 0. Boot the cockpit

If nothing is listening on port 3000, start it in the background: `pnpm dev`. Tell the user the run URL (`http://localhost:3000/runs/<run-id>`) as soon as the run exists.

### 1. Create the run

If the user already created a run in the UI (a `runs/*/run.json` with status `briefing` and matching repoPath), adopt it. Otherwise write a new `runs/run-<id>/run.json` with `{id, createdAt, repoPath, campaignCount, status: "briefing"}` (id: `run-` + base36 timestamp).

### 2. Extract the brand kit

```bash
pnpm tsx -e "import {extractBrandKit} from '@/lib/brandkit/extract'; console.log(JSON.stringify(extractBrandKit(process.argv[1]), null, 2))" <repoPath> > runs/<run-id>/brandkit.json
```

(If `tsx -e` import aliasing fails, write a small throwaway script under the scratchpad instead.)

The kit gives you tokens, fonts, logos, css paths, and `voice` (null when the repo has no design-system docs — then infer voice from the repo's user-facing copy: landing pages, App Store text, README).

### 3. Draft brief + themes

Read the target repo (landing copy, README, pricing) and draft:

- **Brief**: product, audience, valueProps (3–6), offer, landingUrl, voice (quote the brand-voice doc's Say/Avoid rules if present).
- **Themes** (exactly `campaignCount`): each has `slug` (`<nn>-<kebab>`), `name`, `angle` (one of: benefit, proof, offer, problem, differentiation), `tone`, `sampleHeadline`, `visualDirection` (which templates + palette emphasis; template ids: poster-type, offer-stamp, proof-card, direct-cta, stat-callout). Themes must be genuinely distinct angles, not synonyms.

Write both into run.json, set status `awaiting-approval`, then block:

```bash
node scripts/wait-for.mjs <run-id> generating
```

Re-read run.json after it returns — the user may have edited every field. The edited brief/themes are law.

### 4. Generate campaigns

For each theme, produce one `Campaign` entry (`src/types/run.ts`):

**Copy slates** — write per the rulebook below, then validate before saving:

```bash
pnpm tsx -e "…validateRsa/validatePmax/validateMeta from '@/domain/validation/copy'…"
```

Iterate until zero issues. Never trust your own character counting.

**Images** — 3 variants per format. Formats come from `src/domain/formats.ts`: google-pmax 1200×628 / 1200×1200 / 960×1200 + one logo 1200×1200; meta 1080×1080 / 1080×1350 / 1080×1920 (safe zones are built into the templates). Compose a jobs.json of `RenderJobFile` entries (`src/services/render/cli.ts`): template + palette/fonts from brandkit tokens, cssPaths from the brandkit, logoPath from its logos, copy from the slate. Vary template and copy emphasis across the 3 variants per the theme's visualDirection. Then:

```bash
pnpm render runs/<run-id>/jobs.json
```

Output PNGs go under `runs/<run-id>/assets/<campaign-slug>/`. Image `file` fields in run.json are run-dir-relative.

All reviews start `{"status": "pending", "note": ""}`. Set status `reviewing`, then block:

```bash
node scripts/wait-for.mjs <run-id> regenerating,finalizing
```

### 5. Regeneration loop

On `regenerating`: re-read run.json. For every review with status `redo`, regenerate ONLY that asset honoring its `note` (copy redo → rewrite that slate; image redo → new render job, same file path). Reset the redone reviews to `pending`, leave approved ones untouched, set status back to `reviewing`, block again. Loop until `finalizing`.

### 6. Finalize

Write `~/Downloads/<product>-campaigns-<YYYY-MM-DD>/` with one folder per campaign:

```
<nn>-<slug>/
├─ README.md              # theme, tone, rationale, upload notes (incl. RSA pinning advice)
├─ manifest.json          # asset → template, variant, format, theme metadata
├─ google-rsa/text.md
├─ google-pmax/text.md + v{1-3}_<w>x<h>.png + logo_1200x1200.png
└─ meta/text.md + v{1-3}_<w>x<h>.png
```

Copy the approved PNGs from the run dir. Set `outputDir` and status `complete`. Tell the user the path.

## Copywriting rulebook (distilled from the marketing research reports)

**Brand voice overrides everything below.** If the brief's voice says "no emoji", no emoji — even though emoji can raise social CTR. Say/Avoid lists from brand-voice docs are hard constraints.

- **One message per asset.** Each image carries one claim and one CTA. Hierarchy: focal element → outcome headline → proof cue or offer → CTA → brand.
- **Specificity over hype.** "Join 25,317+ users" beats "join thousands"; "4.8 stars from 2,400 reviews" beats "loved by everyone". Use real numbers from the repo/reviews only — never invent stats, testimonials, or ratings. If no proof exists, don't use the proof angle.
- **RSA slates**: fill all 15 headlines, each meaningful alone AND in any combination; no near-duplicates (Google discards them — the validator enforces this). Lean the campaign's angle but still cover the four buckets: problem, benefit, proof/trust, action. Include the product keyword in at least one headline. Specific CTAs ("Start your free scan"), never "Click here".
- **PMax/Demand Gen**: cover distinct angles across headlines (benefits, offer, urgency, authority, proof) — homogeneous headlines starve the algorithm. At least one description ~60 chars. At least one short headline well under 30.
- **Meta primary text**: front-load the hook in the first sentence — only ~1% tap "See more"; 1–3 lines. Every field must stand alone (Meta may swap fields between slots). Descriptions never carry critical info.
- **Meta policy (hard rules)**: never assert or imply personal attributes of the viewer — no "Struggling to stay productive?", no "You must be overwhelmed". Address the problem, not the person's condition. No shame-based copy, miracle claims, or fake urgency/scarcity. Claims must match the landing page.
- **Frameworks**: PAS for pain-aware audiences, BAB for transformation stories, benefit-led everywhere; agitate the problem, never the person.
- **Tone**: short copy for cold traffic and simple offers. Urgency only when honest (real deadline/limited release).

## Failure handling

- Render dimension mismatch or >5MB: the render CLI throws — fix the job and re-run; never ship an unverified image.
- Validator issues: fix the copy, re-validate; never widen limits.
- Killed session: state is on disk. Re-read run.json, resume from its status (the wait script re-blocks safely).
