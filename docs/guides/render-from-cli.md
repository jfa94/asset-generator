# Render images from the CLI

This guide shows how to run the renderer directly from a `jobs.json`, outside the
agent workflow — useful for testing a lockup, re-rendering a single asset, or
debugging a render failure. For the full schema see
[Reference: render jobs](../reference/render-jobs.md).

## Prerequisites

- Dependencies installed (`pnpm install`), which includes Puppeteer's headless
  Chrome.
- A `jobs.json` file: an array of `RenderJobFile` entries. Each entry is a flat
  render spec with file references (`cssPaths`, `logoPath`, `imagePath`) instead
  of inlined content, plus an `outPath`.

## 1. Write a jobs file

A minimal single-job example:

```json
[
    {
        "lockup": "poster",
        "width": 1080,
        "height": 1080,
        "palette": {
            "background": "#0b3d2e",
            "text": "#f5f0e1",
            "accent": "#e8b04b"
        },
        "fonts": {"display": "Besley", "body": "Familjen Grotesk"},
        "cssPaths": ["/abs/path/to/repo/app/globals.css"],
        "logoPath": "/abs/path/to/repo/public/logo.png",
        "imagePath": null,
        "copy": {
            "headline": "No subscriptions, no surprises",
            "subline": "One purchase. Yours for good."
        },
        "outPath": "runs/run-xyz/assets/01-no-subscription/v1_1080x1080.png"
    }
]
```

- `lockup` is one of the seven lockup ids; the copy slots it consumes are declared
  in `LOCKUP_META` (`src/lib/lockups/lockups.tsx`).
- `cssPaths` are concatenated and inlined; use the brand kit's CSS paths so brand
  fonts load.
- `logoPath` may be `null` for a logo-less layout; otherwise it is inlined as a
  data URI.
- `imagePath` is inlined as a data URI for image lockups (`screenshot-panel`,
  `screenshot-bleed`, `image-hero`); use `null` for text-only lockups.
- `outPath` is where the PNG is written; parent directories are created.
- For 9:16 story formats, add `"safeZone": {"top": 0.14, "bottom": 0.2}` so
  content stays clear of platform chrome.

## 2. Run the renderer

```bash
pnpm render path/to/jobs.json
```

Each rendered file is logged to stderr with its dimensions and byte size.

## 3. Handle failures

The CLI throws and aborts the batch on the first failure:

- **Dimension mismatch** — the rendered PNG did not match the requested
  `width`/`height`. Check the lockup and viewport; do not ship the image.
- **Over the byte cap** — files above 5 MB are first re-compressed by Sharp; only
  if they still fail the dimension check does the job throw. The byte cap itself
  is enforced by compression, not by rejection.

Fix the offending job and re-run. The renderer uses one shared browser for the
whole batch and closes it when done.
