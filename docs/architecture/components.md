# Components

This document describes the major building blocks in more detail than the
[overview](overview.md), focusing on responsibilities and the data that flows
between them. It is language-agnostic; for the enforced layering rules see
[Explanation: architecture boundaries](../explanation/architecture-boundaries.md).

## The run lifecycle as data

A run is a single `RunState` object that accretes fields as it progresses:

```mermaid
sequenceDiagram
    participant O as Operator
    participant UI as Cockpit UI
    participant F as run.json
    participant A as Agent
    participant D as Downloads

    O->>UI: create run (repoPath, campaignCount)
    UI->>F: status = briefing
    A->>F: read, extract brand kit
    A->>F: brief + themes, status = awaiting-approval
    A-->>A: block (wait-for generating)
    O->>UI: edit + approve brief/themes
    UI->>F: brief + themes, status = generating
    A->>F: campaigns (copy + images), status = reviewing
    A-->>A: block (wait-for regenerating,finalizing)
    O->>UI: approve / redo each asset
    alt any redo
        UI->>F: campaigns, status = regenerating
        A->>F: regenerate flagged, status = reviewing
    else all approved
        UI->>F: campaigns, status = finalizing
        A->>D: write campaign packs
        A->>F: outputDir, status = complete
    end
```

## Brand-kit extraction

Two extractors feed a single entry point (`extractBrandKit`):

- **Manifest extractor** (`manifest.ts`) — reads
  `docs/design-system/_ds_manifest.json` (a Claude-Design package): tokens,
  brand fonts, global CSS paths, ranked logo assets, and voice text assembled from
  a `brand-voice.html` and/or `SKILL.md`.
- **CSS fallback** (`cssFallback.ts`) — when no manifest exists, parses Tailwind
  v4 `@theme` blocks out of a global stylesheet, classifies each `--token` by
  prefix, derives font families, and probes conventional logo locations. Voice is
  `null` (the agent then infers it from the repo's user-facing copy).

The manifest source is preferred; the fallback is used only when it is absent.
The result is a `BrandKit` consumed both by the agent (for copy voice and render
inputs) and, downstream, by the render pipeline via each job's palette, fonts,
CSS paths, and logo.

## Copy validation

`src/domain/validation/copy.ts` validates the three copy shapes
(`RsaCopy`, `PmaxCopy`, `MetaCopy`) against platform field counts and per-field
character limits. Character counting uses grapheme segmentation, not UTF-16 code
units, so emoji and combined characters count the way the platforms count them.
RSA and PMax short headlines are additionally checked for near-duplicates using
Jaccard word overlap, because ad platforms discard near-duplicate headlines.

Validation is invoked in two places: by the agent before it saves copy, and by the
UI's `submitReviewsAction` as a gate before leaving the review phase — so
operator inline-edits cannot ship invalid copy.

## Render pipeline

The pipeline runs only at finalize; during review the cockpit previews the same
lockups live in the browser (see Cockpit UI below).

```mermaid
graph LR
    Jobs[jobs.json RenderJobFile array] --> CLI[render CLI loadJobs]
    CLI -->|inline cssPaths + logoPath + imagePath| Spec[RenderSpec]
    Spec --> Build[buildHtml renderToStaticMarkup Lockup]
    Build --> Puppeteer[Puppeteer screenshot PNG]
    Puppeteer --> Verify[verifyPng: compress if over cap, assert dimensions]
    Verify --> Out[PNG on disk]
```

The CLI reads file references (`cssPaths`, `logoPath`, `imagePath`) and inlines
them into a `RenderSpec` (CSS text and data URIs). `buildHtml` renders one of the
seven lockups to static markup with `renderToStaticMarkup` and wraps it in a
self-contained HTML document. Puppeteer screenshots it at the exact viewport size;
Sharp compresses if the PNG exceeds the byte cap and then asserts the output is
pixel-exact, throwing otherwise. One shared browser renders all jobs; the first
failure aborts the batch.

## Cockpit UI

Server components read state through the store and render one of three
interactive surfaces based on `status`:

- **Home** (`page.tsx`) — a "How it works" strip, run list, and create form.
- **Approval form** (`ApprovalForm.tsx`) — editable brief and themes; submitting
  runs `approveBriefAction`.
- **Review gallery** (`ReviewGallery.tsx`) — a client component holding local
  campaign state. Per campaign it shows each creative variant (`CreativeCard`) as
  a large editable `REPRESENTATIVE` preview plus a live strip of the other
  formats, and each copy slate. `LockupPreview` mounts the shared `Lockup`
  component and scales it to fit; `ReviewControls` drives per-variant/per-slate
  approve/redo. Copy edits are inline (contentEditable on the preview, textareas
  on the slates). Submitting runs `submitReviewsAction`, which bulk-approves
  anything left pending.

While the agent works, `AutoRefresh` (`src/components/AutoRefresh.tsx`) polls and
re-renders so the operator sees status changes without manual refresh. Run-dir
files (rendered PNGs, brand CSS, logo, product imagery) are served by the
`/api/asset` route, which reads them through the store's path-guarded reader and
sets the content type from `src/utils/mime.ts`.
