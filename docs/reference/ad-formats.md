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

At finalize the agent renders every approved creative variant (typically 3 per
campaign) across all six formats.

## `REPRESENTATIVE`

`REPRESENTATIVE` is a named entry in `AD_FORMATS` (the `google-pmax` `portrait`,
960×1200) used as the editable preview in the cockpit — portrait reads best at
card size. The review gallery shows each variant as a large, inline-editable
`REPRESENTATIVE` preview plus a strip of live thumbnails for the other five
formats. It is a normal format, so it is also rendered to PNG like the rest.

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

Lockups apply the safe zone as extra top/bottom padding so no copy or logo lands
under platform UI. Only the 9:16 Meta `story` format declares one.

## List formats from the CLI

`pnpm formats [--platform <platform>] [--aspect <W:H>] [--json]` prints the format catalogue without opening `src/domain/formats.ts`.
It is read-only: it writes no files, makes no network calls and touches no runs or campaigns.

| Option                  | Meaning                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `--platform <platform>` | List one platform only. Accepted values: `google-pmax` and `meta`.                 |
| `--aspect <W:H>`        | List formats with that aspect ratio, see [below](#filter-formats-by-aspect-ratio). |
| `--json`                | Print JSON instead of text.                                                        |

Each option may appear at most once, in any order. The value must follow `--platform` or `--aspect` as a separate argument and must
not start with `-`. Matching is exact: case-sensitive, with no trimming. `--help` and `--platform=meta` are usage errors.

Ratios are exact reductions of width and height. The landscape format, 1200x628, is `300:157`, which the table above
labels with the conventional `1.91:1`.

Text output has one line per format, `<platform> <name> <width>x<height> <ratio>`, in catalogue order, with no header and
no safe zone. `pnpm formats` prints:

```text
google-pmax landscape 1200x628 300:157
google-pmax square 1200x1200 1:1
google-pmax portrait 960x1200 4:5
meta square 1080x1080 1:1
meta feed 1080x1350 4:5
meta story 1080x1920 9:16
```

JSON output is one compact line whose only key is `formats`. Each object holds `platform`, `name`, `width`, `height` and
`aspectRatio`, plus `safeZone` (`top` and `bottom` fractions) only for the Meta `story` format. `pnpm formats --platform meta --json`
prints the following, shown here expanded by Prettier (the CLI itself writes it on one line):

```json
{
    "formats": [
        {
            "platform": "meta",
            "name": "square",
            "width": 1080,
            "height": 1080,
            "aspectRatio": "1:1"
        },
        {
            "platform": "meta",
            "name": "feed",
            "width": 1080,
            "height": 1350,
            "aspectRatio": "4:5"
        },
        {
            "platform": "meta",
            "name": "story",
            "width": 1080,
            "height": 1920,
            "aspectRatio": "9:16",
            "safeZone": {
                "top": 0.14,
                "bottom": 0.2
            }
        }
    ]
}
```

| Exit code | Meaning                                                                                                                        | Streams                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `0`       | The listing was printed.                                                                                                       | The listing on stdout, empty stderr.         |
| `2`       | Usage error (unknown flag, positional argument, missing or repeated option value), unknown platform or malformed aspect ratio. | Empty stdout, one diagnostic line on stderr. |

A usage error prints `Usage: pnpm formats [--platform <platform>] [--json]`. An unknown platform prints
`Unknown platform "tiktok". Accepted values: google-pmax, meta.` A malformed aspect ratio prints the message shown in
[Filter formats by aspect ratio](#filter-formats-by-aspect-ratio). When several apply, a usage error wins, then an unknown
platform, then a malformed ratio.

For scripts and other machine consumers, run `pnpm --silent formats`. Without `--silent`, pnpm prints its `$ <command>`
banner to stderr and, on a failure, an `[ELIFECYCLE] Command failed with exit code N.` line to stdout, which breaks the
empty-stdout guarantee above.

Caution: `pnpm format` (singular) is the Prettier writer (`prettier --write .`) and rewrites files in place. Mistyping it
for `pnpm formats` changes your working tree.

## Filter formats by aspect ratio

`--aspect <W:H>` keeps only the formats whose reduced ratio equals the requested one. `W` and `H` are positive integers
separated by one colon, with no spaces or signs. The request is reduced before it is compared, so `2:2`, `1:1` and
`1080:1080` all select the two `1:1` formats. Orientation matters: `16:9` does not match `9:16`.

Decimal ratios are rejected, so `1.91:1` is malformed. For the landscape format use `300:157`, or any multiple such as
`1200:628`.

`--aspect` combines with `--platform` and `--json` in any order, each at most once, and keeps only formats that match
every filter. `pnpm formats --aspect 2:2` prints:

```text
google-pmax square 1200x1200 1:1
meta square 1080x1080 1:1
```

`pnpm formats --aspect 9:16 --platform meta --json` prints the following, shown here expanded by Prettier (the CLI itself
writes it on one line):

```json
{
    "formats": [
        {
            "platform": "meta",
            "name": "story",
            "width": 1080,
            "height": 1920,
            "aspectRatio": "9:16",
            "safeZone": {
                "top": 0.14,
                "bottom": 0.2
            }
        }
    ]
}
```

A valid ratio that no format uses, such as `16:9`, is not an error: it exits `0` and prints nothing, or `{"formats":[]}`
with `--json`.

A malformed ratio exits `2` with empty stdout. `pnpm formats --aspect 9-16` prints this on stderr:

`Invalid aspect ratio "9-16". Expected W:H with positive integers, for example 9:16.`

## Format catalogue interface

Code that needs the same data imports it from `@/domain/formatCatalogue`, a pure module over `AD_FORMATS` with no I/O:

| Export                                                 | Purpose                                                                                                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listFormats(platform?: string, aspectRatio?: string)` | Returns a fresh `FormatSpec[]` in catalogue order. `undefined` skips a filter; `platform` must be an accepted platform and `aspectRatio` a `W:H` string. |
| `FormatSpec`                                           | `{platform, name, width, height, aspectRatio, safeZone?}`, with `safeZone` present only when the format has one.                                         |
| `UnknownPlatformError`                                 | Thrown by `listFormats` for any other string. Its message names the accepted values on one line.                                                         |
| `InvalidAspectRatioError`                              | Thrown by `listFormats` for a malformed `aspectRatio`. Its message quotes the value on one line.                                                         |
| `reduceAspectRatio(width, height)`                     | Returns the reduced `W:H` string. Throws `RangeError` unless both are positive integers.                                                                 |

Every call returns new objects, so mutating a result never changes `AD_FORMATS` or a later result.

## Constants

| Constant          | Value           | Meaning                                                                                                                                                  |
| ----------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOGO_SIZE`       | 1200            | Side length of the square logo asset PMax requires.                                                                                                      |
| `MAX_IMAGE_BYTES` | 5 × 1024 × 1024 | Byte cap for Google responsive formats (5 MB). Renders over this are re-compressed by Sharp; if still over the cap after compression, the render throws. |

See [Reference: render jobs](render-jobs.md) for how these feed the renderer and
[Explanation: rendering pipeline](../explanation/rendering-pipeline.md) for how
dimensions and the byte cap are verified.
