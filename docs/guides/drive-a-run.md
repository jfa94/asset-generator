# Drive a run with the agent

This guide is the operator's playbook for running the `/new-run` agent skill end
to end. It assumes you have the cockpit UI available and a Claude Code session
open. For a first-time walkthrough, use [Getting started](../getting-started.md)
instead.

## 1. Ensure the cockpit is running

If nothing is listening on port 3000, start it:

```bash
pnpm dev
```

The agent will offer to start it for you if it is down.

## 2. Invoke the skill

In your Claude Code session:

```
/new-run
```

Provide the two inputs when prompted:

- `repoPath` — absolute path to the target product repo (must be absolute, ≤ 500
  chars)
- `campaignCount` — number of campaigns (default 3; server-side range 1–10)

You can instead create the run in the UI first (status `briefing`, matching
`repoPath`); the agent will adopt it.

## 3. Approve the brief and themes

When the run reaches `awaiting-approval`, the run page shows the brief and theme
forms. Everything is editable and your edits win — the agent re-reads `run.json`
after you approve and treats your version as authoritative.

Focus your edits on:

- **Voice** — this overrides generic ad best practice. If the voice says "no
  emoji", the agent will not use emoji.
- **Value props and offer** — the copy is generated from these.
- **Theme angles** — keep them genuinely distinct (benefit, proof, offer,
  problem, differentiation). Duplicated angles waste a campaign.

Click **Approve & generate**.

## 4. Let generation run

The agent writes and validates copy for all three platforms and renders three
image variants per format. It will not ship copy that fails validation or images
that fail the dimension/byte checks — it iterates until they pass. When done, the
run reaches `reviewing`.

## 5. Review

Follow [Review and regenerate](review-and-regenerate.md) to approve or flag each
asset.

## 6. Collect the output

When the run is `complete`, the run page shows the output path under
`~/Downloads/<product>-campaigns-<YYYY-MM-DD>/`, with one folder per campaign.

## Resuming after an interruption

All state is on disk in `run.json`. If the agent session is killed, re-invoke
`/new-run`; it re-reads the run and resumes from the current status. The blocking
wait script re-blocks safely, so no phase is skipped or repeated.
