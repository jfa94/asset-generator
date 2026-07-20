# Reference: render jobs

The `jobs.json` file, the `RenderJobFile` shape, and the `RenderSpec` it expands
to. Source of truth: `src/services/render/cli.ts` (file format), `src/services/render/html.ts`
(inlined spec), and `src/types/creative.ts` (lockup, palette, and copy types).

Rendering happens only at finalize. During generation the cockpit previews
creatives live in the browser from the `CreativeSpec` on `run.json`; no PNGs
exist until the agent composes a `jobs.json` and runs `pnpm render`. See
[Explanation: rendering pipeline](../explanation/rendering-pipeline.md).

## `jobs.json`

An array of `RenderJobFile` entries, passed to `pnpm render <jobs.json>`. Each
entry is a flat render spec with **file references** (`cssPaths`, `logoPath`,
`imagePath`) in place of inlined content, plus an output path. The CLI reads the
files, inlines them, and renders.

## `RenderJobFile`

The flat on-disk shape the agent writes. The CLI (`loadJobs`) reads each file
reference and expands the entry into a `RenderSpec` before rendering.

| Field       | Type                       | Description                                                              |
| ----------- | -------------------------- | ------------------------------------------------------------------------ |
| `lockup`    | `LockupId`                 | Which lockup layout to render (see below).                               |
| `palette`   | `Palette`                  | Colors (see below).                                                      |
| `copy`      | `LockupCopy`               | Text slots (see below).                                                  |
| `width`     | number                     | Canvas width in pixels.                                                  |
| `height`    | number                     | Canvas height in pixels.                                                 |
| `safeZone`  | `{top, bottom}` (optional) | Keep-clear fractions of height (9:16 chrome).                            |
| `fonts`     | `{display, body}`          | Concrete font family names, loaded by `cssPaths`.                        |
| `cssPaths`  | string[]                   | CSS files, concatenated (newline-joined) and inlined as `cssText`.       |
| `logoPath`  | string \| null             | Logo file inlined as a data URI, or `null` for no logo.                  |
| `imagePath` | string \| null             | Image slot file inlined as a data URI, or `null` for a text-only lockup. |
| `outPath`   | string                     | Where the rendered PNG is written (parent dirs created).                 |

### File-reference MIME mapping

`cssPaths`, `logoPath`, and `imagePath` are inlined by file extension via
`src/utils/mime.ts`: `.png`, `.svg`, `.webp`, `.jpg`/`.jpeg`, `.css` map to their
MIME types; anything else uses `application/octet-stream`.

## `RenderSpec`

The fully-inlined spec the renderer consumes (`src/services/render/html.ts`).
`loadJobs` produces it by reading the file references above.

| Field          | Type                       | Description                                           |
| -------------- | -------------------------- | ----------------------------------------------------- |
| `spec`         | `CreativeSpec`             | `{lockup, palette, copy}` — the creative to render.   |
| `width`        | number                     | Canvas width in pixels.                               |
| `height`       | number                     | Canvas height in pixels.                              |
| `safeZone`     | `{top, bottom}` (optional) | Keep-clear fractions of height.                       |
| `fonts`        | `{display, body}`          | Concrete font family names, loaded by `cssText`.      |
| `cssText`      | string                     | Inlined stylesheet (typically the brand's fonts CSS). |
| `logoDataUri`  | string \| null             | Inlined logo, or `null`.                              |
| `imageDataUri` | string \| null             | Inlined image-slot asset, or `null`.                  |

`buildHtml(spec)` renders the `Lockup` React component to static markup with
`renderToStaticMarkup`, wraps it in a self-contained HTML document with `cssText`
inlined, and returns the string Puppeteer screenshots.

### `LockupId`

One of: `poster`, `screenshot-panel`, `screenshot-bleed`, `image-hero`, `stat`,
`proof`, `badge`. Exported as `LOCKUP_IDS`. Each lockup's required/optional copy
slots and whether it needs an image are declared in `LOCKUP_META`
(`src/lib/lockups/lockups.tsx`) — see [Reference: ad formats](ad-formats.md) and
the lockup bank for details.

### `Palette`

| Field        | Type   | Description               |
| ------------ | ------ | ------------------------- |
| `background` | string | Canvas background color.  |
| `text`       | string | Body/headline text color. |
| `accent`     | string | Accent color.             |

There is no CTA color: lockups render no CTA button — every target ad platform
overlays its own.

### `LockupCopy`

A flat bag of text slots. `headline` is always required; the rest are optional
and consumed only by the lockups that declare them in `LOCKUP_META`.

| Slot          | Type   | Used by                                    |
| ------------- | ------ | ------------------------------------------ |
| `headline`    | string | all lockups (required)                     |
| `subline`     | string | `poster`, `screenshot-panel`, `image-hero` |
| `proof`       | string | `proof`                                    |
| `attribution` | string | `proof`                                    |
| `badge`       | string | `badge`                                    |
| `stat`        | string | `stat`                                     |
| `statLabel`   | string | `stat`                                     |

Which slots a given lockup requires versus treats as optional is validated at
finalize by `missingSlots(spec)` (`src/lib/lockups/lockups.tsx`), which also
requires `imageFile` for image lockups.

## CLI behavior

- Usage: `pnpm render <jobs.json>` (throws `Usage: ...` if the path is missing).
- `loadJobs(path)` expands each `RenderJobFile` into a `{render, outPath}` job,
  inlining `cssPaths`, `logoPath`, and `imagePath`.
- Each result is logged to stderr: `rendered <outPath> (<w>x<h>, <bytes> bytes)`.
- On any failure the process exits non-zero and the batch aborts.

See [Guide: render images from the CLI](../guides/render-from-cli.md) for a worked
example and [Reference: ad formats](ad-formats.md) for valid dimensions and the
byte cap.
