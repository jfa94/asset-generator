<!-- last-documented: 9125d3e31d87f65713d2d4015a208e26c1170e65 -->

# Asset Generator

A local, single-operator tool for turning a product's own design system into
upload-ready advertising asset packs. You point it at a product repository; it
extracts the brand's colors, fonts, logos, and voice, then produces per-campaign
packs of validated ad copy and token-skinned PNG renders for Google (Responsive
Search Ads + Performance Max) and Meta (Feed/Stories).

## What problem it solves

Producing on-brand ad creative is slow and error-prone: copy must respect each
platform's exact field counts and character limits, images must hit exact pixel
dimensions and safe zones, and everything must stay faithful to the brand. This
tool automates the mechanical parts and enforces the platform rules
programmatically, while keeping a human firmly in control of every creative
decision.

## How it works

The system is a coordination between two actors that never do each other's job:

- A **Claude Code agent**, driven by `.claude/skills/new-run/SKILL.md`, does all
  generation: it reads the target repo, drafts a brief and campaign themes,
  writes and validates copy, and composes creative specs. It renders PNGs only
  at the very end, during finalize.
- A **Next.js cockpit UI** does all approval: it lets the operator create runs,
  edit and approve the brief and themes, and review the generated creatives —
  previewed live in the browser — with per-variant approve/redo controls and
  inline copy editing.

Neither actor calls the other directly. They coordinate entirely through a single
JSON file per run — `runs/<run-id>/run.json` — which is the one source of truth.
The agent advances the run's status when it finishes a phase; the UI advances it
when the operator approves. A blocking helper script parks the agent until the
operator has acted.

The final output is a set of campaign folders written to
`~/Downloads/<product>-campaigns-<date>/`, each containing platform-ready copy
files and images plus upload notes.

## Who it is for

A solo marketer, founder, or designer who has a product repository with a design
system and wants a fast, brand-faithful first pass at ad creative — with full
editorial control and no dependency on external design tooling or ad-platform
APIs.

## Design philosophy

- **One file is the interface.** All state lives on disk in `run.json`, written
  atomically. Either actor can be killed and resumed from disk.
- **The human approves, the machine generates.** The UI never generates; the
  agent never approves.
- **Platform rules are enforced in code, not guidelines.** Copy is validated
  against real field/character limits; renders are verified pixel-exact and under
  the byte cap before they ship.
- **The brand is the source of truth.** Every visual property of an asset traces
  back to the extracted brand kit; brand voice overrides generic ad best practice.

## Documentation

Saved RSA, PMax and Meta copy can also be validated independently of a run with
`pnpm validate-copy <file.json>`. See the [command reference](reference/commands.md#validate-saved-copy)
for JSON input, output and exit codes, and the [copy reference](reference/copy-limits.md#validate-unknown-input)
for the reusable validation interface.

| Area                                                                           | Contents                                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| [Getting started](getting-started.md)                                          | Run your first end-to-end campaign generation              |
| [Architecture: overview](architecture/overview.md)                             | System context and the run.json coordination model         |
| [Architecture: components](architecture/components.md)                         | The major building blocks and how they connect             |
| [Guide: drive a run with the agent](guides/drive-a-run.md)                     | Operate the `/new-run` agent skill end to end              |
| [Guide: review and regenerate](guides/review-and-regenerate.md)                | Approve, flag, and selectively regenerate assets           |
| [Guide: render images from the CLI](guides/render-from-cli.md)                 | Run the renderer directly from a `jobs.json`               |
| [Reference: run state](reference/run-state.md)                                 | `run.json` schema, statuses, and transitions               |
| [Reference: copy limits](reference/copy-limits.md)                             | Per-platform copy field counts and character limits        |
| [Reference: ad formats](reference/ad-formats.md)                               | Image dimensions, safe zones, and byte caps                |
| [Reference: brand kit](reference/brand-kit.md)                                 | Brand-kit extraction sources and the `BrandKit` shape      |
| [Reference: render jobs](reference/render-jobs.md)                             | `jobs.json` / `RenderJobFile` / `RenderSpec` schema        |
| [Reference: commands](reference/commands.md)                                   | Package scripts and helper tools                           |
| [Explanation: coordination model](explanation/coordination-model.md)           | Why run.json is the sole interface, and how handoff works  |
| [Explanation: architecture boundaries](explanation/architecture-boundaries.md) | The enforced layering of the codebase                      |
| [Explanation: rendering pipeline](explanation/rendering-pipeline.md)           | Why one React lockup tree renders twice; Puppeteer + Sharp |
| [Glossary](glossary.md)                                                        | Ubiquitous-language domain terms (maintained separately)   |
