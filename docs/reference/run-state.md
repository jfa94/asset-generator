# Reference: run state

The complete `run.json` schema, statuses, and transition rules. Source of truth:
`src/types/run.ts` (shape) and `src/domain/run.ts` (transitions). `run.json` lives
at `runs/<run-id>/run.json` and is the single interface between the cockpit UI and
the agent.

## `RunState`

| Field           | Type         | Presence                 | Description                                                                  |
| --------------- | ------------ | ------------------------ | ---------------------------------------------------------------------------- |
| `id`            | string       | always                   | Run id, `run-<base36 timestamp>`.                                            |
| `createdAt`     | string       | always                   | ISO-8601 creation timestamp.                                                 |
| `repoPath`      | string       | always                   | Absolute path to the target product repo (≤ 500 chars, validated on create). |
| `campaignCount` | number       | always                   | Number of campaigns to produce; integer 1–10, validated on create.           |
| `status`        | `RunStatus`  | always                   | Current lifecycle status (see below).                                        |
| `brief`         | `Brief`      | from `awaiting-approval` | The "what are we advertising" summary.                                       |
| `themes`        | `Theme[]`    | from `awaiting-approval` | One theme per campaign.                                                      |
| `campaigns`     | `Campaign[]` | from `reviewing`         | Generated copy and creative specs.                                           |
| `brand`         | `RunBrand`   | from `reviewing`         | Brand assets the agent copied into the run dir (see below).                  |
| `outputDir`     | string       | on `complete`            | Final Downloads path written by the agent.                                   |

## `RunStatus`

Ordered lifecycle; forward-only. `complete` is terminal.

`briefing` → `awaiting-approval` → `generating` → `reviewing` →
(`regenerating` → `reviewing`)\* → `finalizing` → `complete`

| Status              | Set by | Meaning                                                    |
| ------------------- | ------ | ---------------------------------------------------------- |
| `briefing`          | UI     | Run created; agent is inspecting the repo.                 |
| `awaiting-approval` | Agent  | Brief and themes drafted; awaiting operator approval.      |
| `generating`        | UI     | Approved; agent is writing copy and rendering images.      |
| `reviewing`         | Agent  | Assets ready for operator review.                          |
| `regenerating`      | UI     | Operator flagged redos; agent is regenerating them.        |
| `finalizing`        | UI     | Operator approved all; agent is writing Downloads folders. |
| `complete`          | Agent  | Final packs written; `outputDir` set.                      |

### Legal transitions

Defined by `canTransition(from, to)` in `src/domain/run.ts`:

| From                | To                           |
| ------------------- | ---------------------------- |
| `briefing`          | `awaiting-approval`          |
| `awaiting-approval` | `generating`                 |
| `generating`        | `reviewing`                  |
| `reviewing`         | `regenerating`, `finalizing` |
| `regenerating`      | `reviewing`                  |
| `finalizing`        | `complete`                   |
| `complete`          | (none)                       |

## `Brief`

| Field        | Type     | Description                                      |
| ------------ | -------- | ------------------------------------------------ |
| `product`    | string   | Product name.                                    |
| `audience`   | string   | Target audience description.                     |
| `valueProps` | string[] | Value propositions (typically 3–6).              |
| `offer`      | string   | The offer/promotion.                             |
| `landingUrl` | string   | Landing destination URL.                         |
| `voice`      | string   | Brand voice profile; overrides generic ad rules. |

## `Theme`

One per campaign.

| Field             | Type   | Description                                                           |
| ----------------- | ------ | --------------------------------------------------------------------- |
| `slug`            | string | `<nn>-<kebab>` identifier, e.g. `01-no-subscription`.                 |
| `name`            | string | Display name.                                                         |
| `angle`           | string | Persuasive strategy: benefit, proof, offer, problem, differentiation. |
| `tone`            | string | Tone notes.                                                           |
| `sampleHeadline`  | string | Example headline conveying the theme.                                 |
| `visualDirection` | string | Which lockups and palette emphasis to use.                            |

## `Campaign`

| Field         | Type                                          | Description                                            |
| ------------- | --------------------------------------------- | ------------------------------------------------------ |
| `slug`        | string                                        | Matches the theme slug.                                |
| `copy`        | `CampaignCopy`                                | `{ rsa, pmax, meta }` copy slates.                     |
| `copyReviews` | `{ rsa: Review; pmax: Review; meta: Review }` | Per-slate review state.                                |
| `creatives`   | `Creative[]` (optional)                       | Creative specs, typically 3 distinct lockups/campaign. |

### `Creative`

One creative variant. A single `review` covers the variant across every output
format — review is per variant, not per rendered image.

| Field     | Type           | Description                                         |
| --------- | -------------- | --------------------------------------------------- |
| `variant` | number         | Variant index (1–3).                                |
| `spec`    | `CreativeSpec` | The lockup, palette, copy, and optional image slot. |
| `review`  | `Review`       | Review state for this variant.                      |

### `CreativeSpec`

Defined in `src/types/creative.ts`. A flat, JSON-safe bag validated at runtime by
`missingSlots` (`src/lib/lockups/lockups.tsx`).

| Field       | Type         | Presence           | Description                                                                |
| ----------- | ------------ | ------------------ | -------------------------------------------------------------------------- |
| `lockup`    | `LockupId`   | required           | Which of the seven lockups to render.                                      |
| `palette`   | `Palette`    | required           | `{background, text, accent}` from the brand kit.                           |
| `copy`      | `LockupCopy` | required           | Text slots; `headline` always present, rest per the lockup.                |
| `imageFile` | string       | image lockups only | Run-dir-relative image asset; required by image lockups per `LOCKUP_META`. |

See [Reference: render jobs](render-jobs.md) for the full `LockupId`, `Palette`,
and `LockupCopy` shapes.

### `RunBrand`

Defined in `src/types/run.ts`. Brand assets the agent copies into the run dir so
the cockpit preview and the renderer can load them; served through `/api/asset`.

| Field      | Type                              | Description                                                 |
| ---------- | --------------------------------- | ----------------------------------------------------------- |
| `cssFile`  | string                            | Run-dir-relative brand stylesheet (`@import`/`@font-face`). |
| `fonts`    | `{display: string; body: string}` | Concrete font family names loaded by `cssFile`.             |
| `logoFile` | string \| null                    | Run-dir-relative logo image; `null` when the repo has none. |

### `Review`

| Field    | Type                              | Description                           |
| -------- | --------------------------------- | ------------------------------------- |
| `status` | `pending` \| `approved` \| `redo` | Operator decision.                    |
| `note`   | string                            | Redo instructions (used when `redo`). |

## Aggregate review helpers

Defined in `src/domain/run.ts`, used to decide the `reviewing` exit. Each helper
folds over every copy review and every creative variant review in a campaign:

- `approvePending(campaigns)` — returns a copy of the campaigns with every
  `pending` review flipped to `approved`. Submit means "everything I didn't flag
  is fine", so the UI bulk-approves on submit rather than requiring an explicit
  decision on each item.
- `allApproved(campaigns)` — true when every review is `approved`; after
  `approvePending`, the UI routes to `finalizing`.
- `hasNotelessRedo(campaigns)` — true when any review is `redo` with an empty note;
  the UI blocks submission until every redo carries a note for the agent.

`STATUS_LABELS` (also in `src/domain/run.ts`) maps each `RunStatus` to a human
label and an `actor` (`agent` | `you` | `done`) so the UI can show who acts next.

## On-disk layout of a run

```
runs/<run-id>/
├── run.json                       # this schema
├── brandkit.json                  # extracted BrandKit (agent input)
├── brand/                         # brand assets copied in: cssFile, logo (RunBrand)
├── assets/                        # product imagery + rendered PNGs
│   └── <campaign-slug>/           # PNGs written at finalize, e.g. v1_1080x1080.png
└── jobs.json                      # render jobs, written at finalize
```

`brand/` and the product imagery under `assets/` are populated at generation so
the cockpit can preview creatives live. `jobs.json` and the rendered PNGs appear
only at finalize.

Writes to `run.json` are atomic (temp file + rename) so watchers never read a torn
file.
