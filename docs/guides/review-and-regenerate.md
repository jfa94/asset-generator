# Review and regenerate assets

This guide covers the review phase: approving assets, flagging redos with
instructions, editing copy inline, and driving the selective regeneration loop.
It assumes a run has reached the `reviewing` status and the review gallery is
showing.

## The review gallery

For each campaign the gallery shows:

- Every rendered **image**, grouped and captioned by platform, format, and
  variant.
- Every **copy slate** (RSA, PMax, Meta) with its fields shown as editable text.

Each image and each copy slate has its own approve/redo control.

## 1. Decide every asset

For each asset choose one:

- **Approve** — the asset is good as-is.
- **Redo** — the asset must be regenerated. A note field appears; describe what
  should change (for example, "warmer background", "lead with the price", "drop
  the exclamation"). The agent honors this note.

Every asset must have a decision. If any are left pending, submission is rejected
with "Every asset needs a decision (approve or redo)."

## 2. Edit copy inline (optional)

You can edit copy text directly in the gallery. Each list field is a textarea,
one entry per line; the PMax business name is a single input. Your edits are
persisted when you submit.

Edited copy is re-validated on submit. If any field breaks a platform limit, the
submission is rejected and the specific issues are listed (for example,
`01-no-subscription rsa.headlines[3]: exceeds 30 chars`). Fix the flagged fields
and resubmit. See [Reference: copy limits](../reference/copy-limits.md) for the
rules.

## 3. Submit

The submit button reflects your decisions:

- **Approve all & finalize** — shown when every asset is approved. Submitting
  advances the run to `finalizing`; the agent writes the final packs and the run
  becomes `complete`.
- **Send redos to agent** — shown when at least one asset is flagged. Submitting
  advances the run to `regenerating`.

## 4. The regeneration loop

When you send redos, the agent:

1. Regenerates **only** the flagged assets, honoring each note. A flagged copy
   slate is rewritten; a flagged image gets a new render at the same file path.
2. Leaves approved assets untouched.
3. Resets the regenerated assets' reviews to pending and returns the run to
   `reviewing`.

The gallery reappears with the new assets to decide on. Repeat from step 1 until
every asset is approved and you finalize.

## Notes

- Approved assets are never re-rendered, so approving early saves the agent work.
- Because state lives in `run.json`, you can close the browser and come back; the
  gallery reflects the current on-disk state.
