# Rendering pipeline

This document explains why creatives are authored as React lockups and produced
as PNGs via Puppeteer and Sharp, and how the pipeline guarantees platform-valid
output. For the schemas see [Reference: render jobs](../reference/render-jobs.md);
for a worked run see [Guide: render images from the CLI](../guides/render-from-cli.md).

## One React tree, rendered twice

Ad creative is fundamentally typographic layout: a headline, an optional subline
or stat, a small logo lockup, an optional image slot, and generous negative space,
arranged to respect safe zones. HTML and CSS are an excellent fit — flexbox
handles the composition, CSS units scale cleanly to any canvas, and the brand's
own stylesheet (with its `@font-face`/`@import` font loading) can be inlined
verbatim so renders use the real brand fonts.

The lockups live in one client-safe module, `src/lib/lockups/lockups.tsx`
(no `react-dom/server` import), and the same `Lockup` component tree is rendered
in two places:

- **Live in the cockpit** — `LockupPreview` mounts `Lockup` in the browser and
  scales the full-size canvas down to a display box, so the operator reviews and
  inline-edits exactly what will ship.
- **To a PNG at finalize** — `buildHtml` (`src/services/render/html.ts`) calls
  `renderToStaticMarkup` on the same component, and Puppeteer screenshots it.

Rendering one tree twice means the preview cannot drift from the output: there is
no separate "print" layout to keep in sync. `react-dom/server` stays confined to
the services layer to keep the lockup bank client-safe.

The lockups are deliberately a small, fixed set of seven (`poster`,
`screenshot-panel`, `screenshot-bleed`, `image-hero`, `stat`, `proof`, `badge`).
They encode creative best practice — one message, small logo, generous space,
safe zones — and carry **no** brand-specific values. All styling arrives through
the `CreativeSpec` (lockup, palette, copy) plus fonts, inlined CSS, logo, and an
optional image, so the same lockup skins any brand. There is no CTA pill: every
target ad platform overlays its own CTA button.

## Why render only at finalize

During generation and the whole review loop, no PNGs exist — the agent writes only
creative specs, and the cockpit previews them live. Screenshotting is deferred to
finalize for two reasons:

- **The review loop stays fast.** Regenerating a flagged creative is a spec edit,
  not a batch of headless-Chrome screenshots. Operators can iterate on copy and
  layout without paying render cost each round.
- **Only approved work is rendered.** A run produces one PNG per approved creative
  per format (six formats), so deferring avoids rendering variants that get
  flagged or discarded.

## Why Puppeteer, then Sharp

Two tools, two jobs:

- **Puppeteer** renders the HTML in headless Chrome and screenshots it. It sets
  the viewport to the exact target dimensions, waits for the network to idle and
  for `document.fonts.ready`, then captures a PNG. Waiting on fonts matters: a
  screenshot taken before the brand font loads would ship in a fallback face.
- **Sharp** post-processes the PNG: it compresses (palette PNG, max compression)
  when the file exceeds the platform byte cap, and it reads back the final
  dimensions to verify them.

Chrome gives faithful layout and font rendering; Sharp gives fast, reliable image
inspection and compression. Neither does the other's job well, so the pipeline
uses each for its strength.

## The verification gate

`verifyPng` is the safety gate every image passes before it is written:

1. If the PNG is over `MAX_IMAGE_BYTES` (5 MB), re-compress it (palette PNG, max
   compression). If it is _still_ over the cap after compression, **throw** — the
   image is never written or silently shipped oversized.
2. Read the final width and height. If they do not exactly match the requested
   dimensions, **throw**.

The throw is the point. An off-by-one canvas, a lockup bug, or an unexpected
scaling factor would otherwise produce an image that a platform silently rejects
at upload time. Failing loudly at render time — and aborting the whole batch on the
first failure — means no unverified image ever reaches the final pack. This
mirrors the copy side, where invalid copy is rejected rather than trimmed to fit.

## Batch execution

`renderJobs` launches one shared browser for the whole batch and renders jobs
sequentially, closing each page after use and the browser at the end. Sharing the
browser amortizes its startup cost across the dozens of renders a run produces
(three creative variants across six formats per campaign, plus a logo asset).
Sequential
execution keeps memory bounded and makes the "abort on first failure" behavior
straightforward.

## The file-reference indirection

Jobs on disk (`jobs.json`) reference CSS, logo, and image files by path rather
than embedding them. The CLI (`loadJobs`) inlines those references into the
`RenderSpec` — concatenating the CSS and encoding the logo and image as data URIs
— just before rendering. This keeps `jobs.json` small and readable (the agent
composes it from run-dir paths) while the renderer still receives a fully
self-contained spec, so the screenshot has no external network dependencies to
wait on.

## The SSRF guard on the render browser

The brand's `cssText` is repo-controlled input, and its `@import` rules fetch
through Puppeteer at render time — a font CDN is the designed feature. That same
fetch capability is a server-side request forgery (SSRF) surface: a malicious or
mistaken stylesheet could point the headless browser at internal infrastructure.

To contain this, `renderOne` enables request interception and screens every
request URL through the exported `isBlockedRequestUrl`:

- **Allowed**: `data:` URIs (inlined logos and assets) and public `http(s)` hosts
  (the font CDNs the feature relies on).
- **Blocked**: any other scheme; `localhost`, `*.localhost`, and `*.internal`
  hosts; IPv6 literals; and private, loopback, and link-local IPv4 ranges
  (`0.*`, `10.*`, `127.*`, `169.254.*`, `172.16–31.*`, `192.168.*`). The WHATWG
  `URL` parser canonicalizes percent-encoded and alternate IPv4 forms to a dotted
  quad before the check, so obfuscated addresses do not slip through.

This is hostname-level defense, not full containment: DNS rebinding is out of
scope because Chrome DevTools Protocol exposes no pre-connect resolved-IP hook.
Real network isolation is a deployment concern — egress control on the environment
that runs the renderer.
