# Reference: commands

Package scripts (`package.json`) and helper tools. Package manager: pnpm 11; Node
≥ 26. The package-manager pin is pnpm 11.9.0; 11.13.0 is a broken release
rejected by pnpm's installer.

CI's gate contract selects the Ubuntu runner's installed Chrome for Puppeteer
render tests, including mutation jobs. Its AppArmor profile permits Chromium's
sandbox; the downloaded Chrome-for-Testing executable is blocked on this runner.
The setup step fails if installed Chrome is absent. Local runs keep Puppeteer's
default browser. See [Chromium's AppArmor guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md)
and [Puppeteer's executable-path setting](https://pptr.dev/api/puppeteer.configuration).

## Application

| Command                   | Description                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                | Start the Next.js cockpit UI at `http://localhost:3000`.          |
| `pnpm build`              | Production build of the cockpit.                                  |
| `pnpm start`              | Serve the production build.                                       |
| `pnpm render <jobs.json>` | Render a batch of image jobs (see [render jobs](render-jobs.md)). |

## Validate saved copy

```bash
pnpm validate-copy "campaign copy.json"
# Suppress pnpm's script-launch chatter for machine-readable stdout:
pnpm --silent validate-copy "campaign copy.json"
```

The command reads exactly one UTF-8 JSON file, relative to the caller's working
directory. It writes no files and does not change campaigns or runs. Missing or
extra arguments and unsupported options are usage errors. For filenames beginning
with `-`, use a relative path such as `./-copy.json`.

Input examples for each platform (all required fields must be present):

```json
{
    "platform": "rsa",
    "copy": {
        "headlines": ["Own your privacy", "No renewals, ever", "Data brokers, gone"],
        "descriptions": ["Buy once and keep control.", "Remove your personal data."],
        "paths": []
    }
}
```

```json
{
    "platform": "pmax",
    "copy": {
        "shortHeadlines": ["Own your privacy", "No renewals, ever", "Data brokers, gone"],
        "longHeadlines": ["Remove your data with one purchase"],
        "descriptions": ["Buy once and keep control.", "Remove your personal data."],
        "businessName": "GoodbyeSpy"
    }
}
```

```json
{
    "platform": "meta",
    "copy": {
        "primaryTexts": ["Keep your data private."],
        "headlines": ["Own your privacy"],
        "descriptions": ["One purchase"]
    }
}
```

The CLI uses the shared [copy validator and limits](copy-limits.md). Shape-valid
input prints exactly one JSON result followed by a newline, with empty stderr:

```json
{"platform": "meta", "valid": true, "issues": []}
```

For the Meta example with `primaryTexts` changed to `[]`, stdout is:

```json
{"platform": "meta", "valid": false, "issues": [{"field": "primaryTexts", "message": "needs 1-5 entries, got 0"}]}
```

| Exit code | Meaning                                                            | Streams                                                                |
| --------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `0`       | Copy passes platform rules.                                        | JSON result on stdout; empty stderr.                                   |
| `1`       | Shape is valid but copy violates platform rules.                   | JSON result with ordered field/message issues on stdout; empty stderr. |
| `2`       | Bad usage, unreadable file, malformed JSON or invalid input shape. | Empty stdout; concise diagnostic on stderr without a stack trace.      |

Null, arrays, unknown platforms, missing required fields and non-string list
entries are shape errors, distinct from ordinary copy-rule issues. For example,
an omitted RSA `paths` produces `copy.paths must be an array of strings` on stderr.
Extra fields are ignored. Repeated validation preserves input bytes and produces
identical results. These stream guarantees describe the CLI itself; use the
silent pnpm invocation above to suppress the package manager's own output.

## Quality commands

| Command              | Description                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| `pnpm typecheck`     | `tsc --noEmit`.                                                            |
| `pnpm lint`          | ESLint, zero warnings tolerated.                                           |
| `pnpm lint:fix`      | ESLint with autofix.                                                       |
| `pnpm format`        | Prettier write.                                                            |
| `pnpm format:check`  | Prettier check.                                                            |
| `pnpm test`          | Vitest run.                                                                |
| `pnpm test:watch`    | Vitest watch.                                                              |
| `pnpm test:coverage` | Vitest with V8 coverage.                                                   |
| `pnpm test:mutation` | Stryker mutation testing.                                                  |
| `pnpm deps:validate` | dependency-cruiser boundary validation over `src`.                         |
| `pnpm deps:graph`    | Write `docs/dependency-graph.svg` from the module graph.                   |
| `pnpm audit`         | Production dependency audit at high severity.                              |
| `pnpm quality`       | Full gate: typecheck, lint, format check, coverage, deps, audit, mutation. |

## Helper scripts

### `scripts/wait-for.mjs`

Blocks until a run reaches one of the given statuses, then prints the status and
exits 0. Used by the agent to park between phases.

```bash
node scripts/wait-for.mjs <run-id> <status[,status...]>
```

Watches the run directory (not the file) and polls every 2 s as a fallback, so it
survives the atomic rename the store uses and missed macOS watch events. Exits 2
on a usage error.

## Agent skill

The generation workflow itself is not a package script — it is the Claude Code
skill defined in `.claude/skills/new-run/SKILL.md`, invoked as `/new-run` in a
Claude Code session. See [Guide: drive a run](../guides/drive-a-run.md).
