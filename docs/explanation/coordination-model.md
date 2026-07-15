# Coordination model

This document explains why `run.json` is the sole interface between the cockpit UI
and the agent, how the handoff works, and the trade-offs of the design.

## The problem

Two independent actors must collaborate on one long-running task:

- A **Claude Code agent** that can read a repository, write copy, and drive a
  renderer — but that runs as a conversational process, not a service.
- A **human operator** who must approve creative decisions through a UI.

They run in different processes with different lifetimes. Either can be
interrupted. Neither should block the other from being restarted. A conventional
approach — a message queue, a database, a running API the agent calls — adds
infrastructure and a second source of truth, and couples the two lifetimes.

## The decision: one file is the interface

All coordination goes through a single JSON file per run,
`runs/<run-id>/run.json`. It carries the full run state and a `status` field that
is a forward-only state machine. The rule is strict and stated in the agent skill:
_the UI never generates anything; the agent never approves anything._ Ownership of
each transition is split accordingly (see
[Architecture overview](../architecture/overview.md) for the table).

Consequences:

- **Single source of truth.** There is no in-memory state to reconcile. Whatever
  is on disk is the run.
- **Independent lifetimes.** The UI is a stateless Next.js app that reads the file
  on each request (`dynamic = 'force-dynamic'`). The agent is a conversation. Kill
  either; the other is unaffected.
- **Trivially resumable.** A killed agent re-reads `run.json` and resumes from its
  status. A closed browser just re-reads on reload.

## Handoff mechanics

### Atomic writes

The store (`src/lib/state/store.ts`) never writes `run.json` in place. It writes a
`run.json.tmp` and renames it over the target. Rename is atomic on the filesystem,
so a concurrent reader — the UI request, the agent's file watch, or the wait
script — never observes a half-written file. Readers that do hit a torn moment
simply retry on the next event.

### Blocking the agent

After the agent finishes a phase it must wait for the operator. It does this by
running `scripts/wait-for.mjs <run-id> <status...>`, which blocks until
`run.json` reaches one of the target statuses. The script watches the run
_directory_ rather than the file, because the atomic rename replaces the file
inode; it also polls every two seconds because macOS `fs.watch` can miss renames.
When the status matches, the script prints it and exits, unblocking the agent.

### Advancing from the UI

The operator's actions run as Next.js server actions. `approveBriefAction`
persists the edited brief and themes and moves `awaiting-approval → generating`.
`submitReviewsAction` persists the reviewed campaigns and moves `reviewing →`
either `finalizing` (all approved) or `regenerating` (any redo). Both guard the
transition with `canTransition` from the domain layer, so a stale form cannot
force an illegal move.

### Polling for progress

While the agent works, the run page renders `AutoRefresh`, which calls
`router.refresh()` every two seconds. Because pages are dynamic and read the file
fresh, the operator sees status and asset changes without manual reload — again
with the file as the only source of truth.

## Trade-offs

- **No push, only poll.** Both sides poll (the UI every 2 s, the wait script every
  2 s plus watch events). This adds a small latency and some wasted reads, in
  exchange for zero coordination infrastructure and a design that cannot get out
  of sync.
- **Single operator, single machine.** The model assumes one local operator. It is
  not built for concurrent editors or remote access; there is no locking beyond
  atomic writes and forward-only transitions.
- **Coarse-grained state.** The whole run is one document rewritten on each
  change. For the size of a run this is simpler and safer than field-level updates,
  at the cost of rewriting the file each time.

These trade-offs fit the product: a fast, local, single-operator tool where
simplicity and resumability matter more than concurrency or real-time push.
