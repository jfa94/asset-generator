# Reference: copy limits

Per-platform copy field counts and character limits enforced by
`src/domain/validation/copy.ts`. All limits are validated both by the agent before
saving and by the UI before leaving the review phase.

## Validate unknown input

Import `validateCopy`, `CopyValidationResult` and `CopyShapeError` from
`@/domain/validation/copy`. `validateCopy(input: unknown): CopyValidationResult`
checks runtime shape before dispatching to the existing platform validator.
The input has a lowercase `platform` and a `copy` object:

| Platform | Required fields in `copy`                                                                |
| -------- | ---------------------------------------------------------------------------------------- |
| `rsa`    | `headlines`, `descriptions`, `paths`: string arrays                                      |
| `pmax`   | `shortHeadlines`, `longHeadlines`, `descriptions`: string arrays; `businessName`: string |
| `meta`   | `primaryTexts`, `headlines`, `descriptions`: string arrays                               |

For example:

```ts
const result = validateCopy({
    platform: 'meta',
    copy: {
        primaryTexts: ['Keep your data private.'],
        headlines: ['Own your privacy'],
        descriptions: ['One purchase'],
    },
})
// {platform: 'meta', valid: true, issues: []}
```

The result contains exactly `platform`, `valid` and `issues`, with `valid` true
exactly when the ordered `CopyIssue[]` is empty. Validation is deterministic and
does not change the input, including deeply frozen objects. Extra fields are ignored.

Null, arrays or scalar values in place of either object, unknown platforms,
missing fields, wrong field types and non-string list entries throw
`CopyShapeError`. Its message identifies the field, for example
`copy.headlines[1] must be a string`. RSA `paths` is required even when it is `[]`.

Empty arrays and empty, whitespace-only or overlong strings have valid shape:
they reach the platform rules below and return ordinary issues instead of throwing.
For example, Meta input with `primaryTexts: []` and otherwise valid fields returns
`{platform: 'meta', valid: false, issues: [{field: 'primaryTexts', message: 'needs 1-5 entries, got 0'}]}`.
Existing typed validators remain available with their original issue results and limits.

## Character counting

Character counts use Unicode grapheme segmentation (`Intl.Segmenter`), not UTF-16
code units. An emoji or combined character counts as one character, matching how
the ad platforms count. Each field is counted after trimming surrounding
whitespace; an empty (or whitespace-only) entry is reported as `is empty`.

## Google Responsive Search Ads (`validateRsa`, `RsaCopy`)

| Field          | Count (min–max) | Max chars per entry | Extra checks       |
| -------------- | --------------- | ------------------- | ------------------ |
| `headlines`    | 3–15            | 30                  | No near-duplicates |
| `descriptions` | 2–4             | 90                  | —                  |
| `paths`        | 0–2             | 15                  | —                  |

## Google Performance Max / Demand Gen (`validatePmax`, `PmaxCopy`)

| Field            | Count (min–max) | Max chars per entry | Extra checks       |
| ---------------- | --------------- | ------------------- | ------------------ |
| `shortHeadlines` | 3–15            | 30                  | No near-duplicates |
| `longHeadlines`  | 1–5             | 90                  | —                  |
| `descriptions`   | 2–5             | 90                  | —                  |
| `businessName`   | exactly 1       | 25                  | —                  |

## Meta Feed / Stories (`validateMeta`, `MetaCopy`)

| Field          | Count (min–max) | Max chars per entry |
| -------------- | --------------- | ------------------- |
| `primaryTexts` | 1–5             | 125                 |
| `headlines`    | 1–5             | 40                  |
| `descriptions` | 1–5             | 25                  |

The Meta primary-text limit of 125 is the visible length before the "See more"
truncation.

## Near-duplicate detection

RSA `headlines` and PMax `shortHeadlines` are checked pairwise for near-duplicates
because ad platforms discard headlines that are too similar. Two entries are
near-duplicates when, after lowercasing and stripping punctuation:

- they normalize to the same string, or
- their Jaccard word overlap (shared words ÷ union of words) is **≥ 0.8**.

Reported as `near-duplicates: "<a>" / "<b>"`.

## Issue shape

Each validator returns an array of `CopyIssue`:

| Field     | Type   | Description                                                 |
| --------- | ------ | ----------------------------------------------------------- |
| `field`   | string | The field (indexed, e.g. `headlines[3]`).                   |
| `message` | string | Human-readable reason, e.g. `exceeds 30 chars (34): "..."`. |

An empty array means the copy is valid. The UI joins issues into a single error
block prefixed with the campaign slug and platform, e.g.
`01-no-subscription rsa.headlines[3]: exceeds 30 chars (34): "..."`.

## Exported helpers

| Symbol                 | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `charCount(s)`         | Grapheme-aware character count.                            |
| `isNearDuplicate(a,b)` | Whether two strings are near-duplicates by the rule above. |
| `validateRsa(copy)`    | Validate an `RsaCopy`.                                     |
| `validatePmax(copy)`   | Validate a `PmaxCopy`.                                     |
| `validateMeta(copy)`   | Validate a `MetaCopy`.                                     |
