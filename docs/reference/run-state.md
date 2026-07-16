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
| `campaigns`     | `Campaign[]` | from `reviewing`         | Generated copy and image assets.                                             |
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
| `visualDirection` | string | Which templates and palette emphasis to use.                          |

## `Campaign`

| Field         | Type                                          | Description                        |
| ------------- | --------------------------------------------- | ---------------------------------- |
| `slug`        | string                                        | Matches the theme slug.            |
| `copy`        | `CampaignCopy`                                | `{ rsa, pmax, meta }` copy slates. |
| `copyReviews` | `{ rsa: Review; pmax: Review; meta: Review }` | Per-slate review state.            |
| `images`      | `ImageAsset[]`                                | Rendered image assets.             |

### `ImageAsset`

| Field      | Type                    | Description                                                                                                                          |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `file`     | string                  | Path relative to the run directory.                                                                                                  |
| `platform` | `google-pmax` \| `meta` | Target platform.                                                                                                                     |
| `format`   | `AdFormatName`          | Format name: `landscape` \| `square` \| `portrait` \| `feed` \| `story`. Shared with `AdFormat.name`; defined in `src/types/run.ts`. |
| `variant`  | number                  | Variant index (1–3).                                                                                                                 |
| `review`   | `Review`                | Review state.                                                                                                                        |

### `Review`

| Field    | Type                              | Description                           |
| -------- | --------------------------------- | ------------------------------------- |
| `status` | `pending` \| `approved` \| `redo` | Operator decision.                    |
| `note`   | string                            | Redo instructions (used when `redo`). |

## Aggregate review helpers

Defined in `src/domain/run.ts`, used to decide the `reviewing` exit:

- `allApproved(campaigns)` — true when every copy review and every image review is
  `approved`; the UI routes to `finalizing`.
- `hasPending(campaigns)` — true when any review is still `pending`; the UI blocks
  submission until every asset has a decision.
- `hasNotelessRedo(campaigns)` — true when any review is `redo` with an empty note;
  the UI blocks submission until every redo carries a note for the agent.

## On-disk layout of a run

```
runs/<run-id>/
├── run.json                       # this schema
├── brandkit.json                  # extracted BrandKit (agent input)
├── jobs.json                      # render jobs for the batch
└── assets/<campaign-slug>/        # rendered PNGs, e.g. v1_1080x1080.png
```

Writes to `run.json` are atomic (temp file + rename) so watchers never read a torn
file.
