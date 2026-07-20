# Review and regenerate assets

This guide covers the review phase: approving assets, flagging redos with
instructions, editing copy inline, and driving the selective regeneration loop.
It assumes a run has reached the `reviewing` status and the review gallery is
showing.

## The review gallery

No PNGs exist yet — during generation the agent only writes creative specs. The
gallery previews each creative **live in the browser**, rendering the same lockup
component that the finalize step later screenshots to PNG.

For each campaign the gallery shows:

- Every **creative variant**: a large, editable `REPRESENTATIVE` (portrait
  960×1200) preview plus a strip of live thumbnails for the other five formats,
  captioned with its lockup and variant.
- Every **copy slate** — Google Search ads (RSA), Google Performance Max, and
  Meta (Facebook/Instagram) — with its fields shown as editable text.

Each creative variant and each copy slate has its own approve/redo control. A
creative is reviewed once for the whole variant, not once per format.

## 1. Decide the variants and slates

For each creative variant and copy slate choose one:

- **Approve** — good as-is.
- **Redo** — must be regenerated. A note field appears; describe what should
  change (for example, "warmer background", "lead with the price", "use the
  screenshot lockup instead"). The agent honors this note.

You do not have to touch everything. Anything you leave alone counts as approved
when you submit — the submit action bulk-approves every pending item.

Every redo must carry a note — a note gives the regenerating agent something to
act on. If any redo has an empty note, submission is rejected with "Every redo
needs a note for the agent."

## 2. Edit copy inline (optional)

You can edit two kinds of copy directly in the gallery:

- **Creative copy** — click any text in the large representative preview and type;
  the edit commits when the field loses focus (on blur). This changes the
  variant's `spec.copy`, and every thumbnail re-renders to match.
- **Platform slates** — each list field is a textarea, one entry per line; the
  PMax business name is a single input.

Your edits are persisted when you submit.

Edited copy and creative specs are re-validated only on the **finalize** path —
when everything ends up approved. Copy is checked against platform limits, and
each creative is checked with `missingSlots` (required copy slots filled, image
present for image lockups). If anything fails, the submission is rejected and the
specific issues are listed — for example `01-no-subscription rsa.headlines[3]:
exceeds 30 chars` or `01-no-subscription v2 (stat): missing stat`. Fix the flagged
items and resubmit. See [Reference: copy limits](../reference/copy-limits.md) for
the copy rules.

The redo path deliberately skips this check: redos exist to repair bad copy, so
blocking them on the same limits would deadlock a run whose flagged assets carry
invalid copy. Your edits are still persisted, and the copy is re-validated the next
time you try to finalize.

## 3. Submit

A single submit button reflects your decisions:

- **Approve all & finalize** — shown when nothing is flagged. Submitting
  bulk-approves every pending item and advances the run to `finalizing`; the agent
  renders the PNGs, writes the final packs, and the run becomes `complete`.
- **Send redos, approve the rest** — shown when at least one item is flagged.
  Submitting bulk-approves the unflagged items and advances the run to
  `regenerating`.

## 4. The regeneration loop

When you send redos, the agent:

1. Revises **only** the flagged items, honoring each note. A flagged copy slate is
   rewritten; a flagged creative has its spec revised (lockup, copy, palette, or
   image, as the note demands). No PNGs are rendered.
2. Leaves approved items untouched — including any inline copy edits you made.
3. Resets the revised reviews to pending and returns the run to `reviewing`.

The gallery reappears with the revised creatives to decide on. Repeat from step 1
until nothing is flagged and you finalize.

## Notes

- A submission is bounded as a trust boundary: at most 24 campaigns and a 512 KB
  serialized payload. Oversized submissions are rejected with "Submission is too
  large." (a normal run stays well under both.)
- Nothing is rendered until you finalize, so the review loop stays fast — the
  agent only revises specs, never re-screenshots during regeneration.
- Because state lives in `run.json`, you can close the browser and come back; the
  gallery reflects the current on-disk state.
