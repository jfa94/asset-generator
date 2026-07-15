# Reference: ad formats

Image dimensions, safe zones, and byte caps. Source of truth:
`src/domain/formats.ts`.

## Formats (`AD_FORMATS`)

| Platform      | Name        | Width | Height | Aspect | Safe zone            |
| ------------- | ----------- | ----- | ------ | ------ | -------------------- |
| `google-pmax` | `landscape` | 1200  | 628    | 1.91:1 | —                    |
| `google-pmax` | `square`    | 1200  | 1200   | 1:1    | —                    |
| `google-pmax` | `portrait`  | 960   | 1200   | 4:5    | —                    |
| `meta`        | `square`    | 1080  | 1080   | 1:1    | —                    |
| `meta`        | `feed`      | 1080  | 1350   | 4:5    | —                    |
| `meta`        | `story`     | 1080  | 1920   | 9:16   | top 0.14, bottom 0.2 |

The agent renders three variants per format per campaign.

## `AdFormat` shape

| Field      | Type                    | Description                                     |
| ---------- | ----------------------- | ----------------------------------------------- |
| `platform` | `google-pmax` \| `meta` | Target platform.                                |
| `name`     | string                  | Format name.                                    |
| `width`    | number                  | Pixel width.                                    |
| `height`   | number                  | Pixel height.                                   |
| `safeZone` | `SafeZone` (optional)   | Keep-clear fractions; present only when needed. |

### `SafeZone`

| Field    | Type   | Description                                                    |
| -------- | ------ | -------------------------------------------------------------- |
| `top`    | number | Fraction of height to keep clear at the top (platform chrome). |
| `bottom` | number | Fraction of height to keep clear at the bottom (CTA sticker).  |

Templates apply the safe zone as extra top/bottom padding so no copy or logo lands
under platform UI. Only the 9:16 Meta `story` format declares one.

## Constants

| Constant          | Value           | Meaning                                                                                      |
| ----------------- | --------------- | -------------------------------------------------------------------------------------------- |
| `LOGO_SIZE`       | 1200            | Side length of the square logo asset PMax requires.                                          |
| `MAX_IMAGE_BYTES` | 5 × 1024 × 1024 | Byte cap for Google responsive formats (5 MB). Renders over this are re-compressed by Sharp. |

See [Reference: render jobs](render-jobs.md) for how these feed the renderer and
[Explanation: rendering pipeline](../explanation/rendering-pipeline.md) for how
dimensions and the byte cap are verified.
