# Reference: brand kit

The `BrandKit` shape and its extraction sources. Source of truth:
`src/lib/brandkit/` (`extract.ts`, `manifest.ts`, `cssFallback.ts`, `types.ts`).

## Extraction entry point

`extractBrandKit(repoPath)`:

1. Throws if `repoPath` does not exist.
2. Tries the **design-system manifest** extractor.
3. Falls back to the **CSS** extractor.
4. Throws if neither yields a kit:
   `No design system found ... expected docs/design-system/_ds_manifest.json or a globals.css`.

The agent runs this and writes the result to `runs/<run-id>/brandkit.json`.

## `BrandKit` shape

| Field      | Type                              | Description                                               |
| ---------- | --------------------------------- | --------------------------------------------------------- |
| `source`   | `design-system` \| `css-fallback` | Which extractor produced the kit.                         |
| `repoPath` | string                            | Absolute path of the source repo.                         |
| `tokens`   | `Token[]`                         | Design tokens.                                            |
| `fonts`    | `BrandFont[]`                     | Brand font families and their token names.                |
| `logos`    | string[]                          | Absolute logo file paths, best candidates first.          |
| `voice`    | string \| null                    | Brand voice guidance; `null` when the repo has none.      |
| `cssPaths` | string[]                          | Absolute CSS file paths, in load order, for the renderer. |

### `Token`

| Field   | Type        | Description                                                        |
| ------- | ----------- | ------------------------------------------------------------------ |
| `name`  | string      | Token name, e.g. `--color-brand`.                                  |
| `value` | string      | Token value.                                                       |
| `kind`  | `TokenKind` | `color` \| `font` \| `spacing` \| `radius` \| `shadow` \| `other`. |

### `BrandFont`

| Field    | Type     | Description                                                 |
| -------- | -------- | ----------------------------------------------------------- |
| `family` | string   | Font family name.                                           |
| `tokens` | string[] | Token names referencing this family, e.g. `--font-display`. |

## Source 1: design-system manifest

Used when `docs/design-system/_ds_manifest.json` exists (a Claude-Design package).

- **Tokens** — from the manifest `tokens[]`; unrecognized kinds map to `other`.
- **Fonts** — from `brandFonts[]`.
- **CSS paths** — `globalCssPaths[]`, resolved under `docs/design-system/`.
- **Logos** — image files in `docs/design-system/assets/`, ranked `logo*` first,
  then `icon*`, then the rest, alphabetically within a rank.
- **Voice** — assembled from `guidelines/brand-voice.html` (HTML stripped to
  text) and/or `SKILL.md`; `null` if neither exists.

Result `source` is `design-system`.

## Source 2: CSS fallback

Used when no manifest exists but a global stylesheet does. Candidate paths, in
order: `app/globals.css`, `src/app/globals.css`, `styles/globals.css`,
`src/styles/globals.css`.

- **Tokens** — every `--name: value;` declaration inside Tailwind v4 `@theme`
  blocks. Kind is inferred from the name prefix: `--color-*` → color, `--font-*`
  → font, `--spacing-*`/`--space-*` → spacing, `--radius-*` → radius,
  `--shadow-*` → shadow, otherwise `other`.
- **Fonts** — derived from font-kind tokens: a `var(--font-x)` reference or the
  first family in a list, normalized (quotes stripped, hyphens to spaces).
- **CSS paths** — the single stylesheet found.
- **Logos** — the first existing of `public/logo.svg`, `public/logo.png`,
  `public/icon.svg`, `public/icon.png`, `app/icon.png`, `public/favicon.png`.
- **Voice** — always `null`; the agent infers voice from the repo's user-facing
  copy.

Result `source` is `css-fallback`.
