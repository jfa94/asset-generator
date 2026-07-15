# Reference: render jobs

The `jobs.json` file, the `RenderJobFile` shape, and the `TemplateSpec` it expands
to. Source of truth: `src/services/render/cli.ts` (file format) and
`src/lib/templates/types.ts` (spec).

## `jobs.json`

An array of `RenderJobFile` entries, passed to `pnpm render <jobs.json>`. Each
entry is a `TemplateSpec` with **file references** in place of inlined content,
plus an output path. The CLI reads the files and inlines them before rendering.

## `RenderJobFile`

Extends `TemplateSpec` but replaces `cssText` and `logoDataUri` with:

| Field      | Type           | Description                                                        |
| ---------- | -------------- | ------------------------------------------------------------------ |
| `cssPaths` | string[]       | CSS files, concatenated (newline-joined) and inlined as `cssText`. |
| `logoPath` | string \| null | Logo file inlined as a data URI, or `null` for no logo.            |
| `outPath`  | string         | Where the rendered PNG is written (parent dirs created).           |

Plus all other `TemplateSpec` fields below.

### Logo MIME mapping

`logoPath` is inlined by extension: `.png`, `.svg`, `.webp`, `.jpg`/`.jpeg` map to
their MIME types; anything else uses `application/octet-stream`.

## `TemplateSpec`

The fully-inlined spec the renderer consumes.

| Field         | Type                       | Description                                           |
| ------------- | -------------------------- | ----------------------------------------------------- |
| `template`    | `TemplateId`               | Which layout to render (see below).                   |
| `width`       | number                     | Canvas width in pixels.                               |
| `height`      | number                     | Canvas height in pixels.                              |
| `safeZone`    | `{top, bottom}` (optional) | Keep-clear fractions of height (9:16 chrome).         |
| `palette`     | `TemplatePalette`          | Colors (see below).                                   |
| `fonts`       | `{display, body}`          | Concrete font family names, loaded by `cssText`.      |
| `cssText`     | string                     | Inlined stylesheet (typically the brand's fonts CSS). |
| `logoDataUri` | string \| null             | Inlined logo, or `null`.                              |
| `copy`        | `TemplateCopy`             | Text content (see below).                             |

### `TemplateId`

One of: `poster-type`, `offer-stamp`, `proof-card`, `direct-cta`, `stat-callout`.
Exported as `TEMPLATE_IDS`.

### `TemplatePalette`

| Field           | Type   | Description               |
| --------------- | ------ | ------------------------- |
| `background`    | string | Canvas background color.  |
| `text`          | string | Body/headline text color. |
| `accent`        | string | Accent color.             |
| `ctaBackground` | string | CTA pill background.      |
| `ctaText`       | string | CTA pill text color.      |

### `TemplateCopy`

| Field         | Type   | Presence | Used by            |
| ------------- | ------ | -------- | ------------------ |
| `headline`    | string | required | all                |
| `subline`     | string | optional | most               |
| `cta`         | string | optional | renders a CTA pill |
| `proof`       | string | optional | `proof-card`       |
| `attribution` | string | optional | `proof-card`       |
| `badge`       | string | optional | `offer-stamp`      |
| `stat`        | string | optional | `stat-callout`     |
| `statLabel`   | string | optional | `stat-callout`     |

## CLI behavior

- Usage: `pnpm render <jobs.json>` (throws `Usage: ...` if the path is missing).
- `loadJobs(path)` expands each `RenderJobFile` into a `{spec, outPath}` render
  job, inlining `cssPaths` and `logoPath`.
- Each result is logged to stderr: `rendered <outPath> (<w>x<h>, <bytes> bytes)`.
- On any failure the process exits non-zero and the batch aborts.

See [Guide: render images from the CLI](../guides/render-from-cli.md) for a worked
example and [Reference: ad formats](ad-formats.md) for valid dimensions and the
byte cap.
