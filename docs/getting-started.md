# Getting started

This tutorial walks you through generating your first campaign asset pack, from an
empty checkout to finished folders in your Downloads directory. By the end you
will have driven one complete run through every phase: brief, generation, review,
and finalize.

## Prerequisites

- Node.js 26 or newer
- pnpm 11
- A Claude Code session (the agent that does the generation)
- A target product repository on disk that has either a
  `docs/design-system/_ds_manifest.json` (a Claude-Design package) or an
  `app/globals.css`-style global stylesheet with Tailwind v4 `@theme` tokens

## 1. Install dependencies

```bash
pnpm install
```

## 2. Start the cockpit UI

```bash
pnpm dev
```

The UI runs at `http://localhost:3000`. Leave it running.

## 3. Create a run

Open `http://localhost:3000`. In the form, enter:

- **Target repo path** — the absolute path to your product repository
- **Campaigns** — how many distinct campaigns to produce, 1–10 (default 3)

Click **New run**. You are redirected to the run page at
`http://localhost:3000/runs/<run-id>`. The run now exists on disk at
`runs/<run-id>/run.json` with status `briefing`.

## 4. Start the agent

In your Claude Code session, invoke the skill:

```
/new-run
```

Give it the same repo path and campaign count when asked (or let it adopt the run
you just created). The agent will:

1. Extract the brand kit from the repo into `runs/<run-id>/brandkit.json`.
2. Draft a brief (product, audience, value props, offer, landing URL, voice) and
   one theme per campaign.
3. Write both into `run.json`, set the status to `awaiting-approval`, and block.

Watch the run page — it polls automatically and will switch to the approval form
when the agent is ready.

## 5. Approve the brief and themes

On the run page, review the **Brief** and **Campaign themes** forms. Every field
is editable. Fix anything that is wrong — your edits are law; the agent re-reads
them. When satisfied, click **Approve & generate**.

The run status advances to `generating` and the agent unblocks.

## 6. Wait for generation

The agent now, for each theme:

- Writes copy slates for Google RSA, Google PMax, and Meta, and validates them
  until they pass every platform limit.
- Renders three image variants per format with Puppeteer, verifying each is
  pixel-exact and under the byte cap.

The run page shows a working indicator and switches to the review gallery when the
status reaches `reviewing`.

## 7. Review the assets

In the gallery you see, per campaign, every rendered image and every copy slate.
For each asset choose **Approve** or **Redo**. When you choose Redo, add a short
note describing what should change. You can also edit copy text inline.

Every asset must have a decision before you can submit.

## 8. Finalize or regenerate

Click the submit button at the bottom:

- If you approved everything, the status becomes `finalizing`. The agent writes
  the final campaign folders and the status becomes `complete`.
- If you flagged any redos, the status becomes `regenerating`. The agent
  regenerates only the flagged assets, honoring your notes, and returns the run to
  `reviewing`. Repeat step 7 until everything is approved.

## 9. Collect the output

When the run is `complete`, the run page shows the output path. Your finished
packs are at:

```
~/Downloads/<product>-campaigns-<YYYY-MM-DD>/
```

with one folder per campaign, each containing a README with upload notes, a
manifest, and the platform copy and image files ready to upload.

## Next steps

- [Drive a run with the agent](guides/drive-a-run.md) — the operator's playbook
- [Review and regenerate](guides/review-and-regenerate.md) — the selective redo loop
- [Architecture overview](architecture/overview.md) — how the pieces coordinate
