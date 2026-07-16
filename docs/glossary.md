```yaml
context: root
purpose: Turn a product repo's design system into approved, ready-to-upload ad asset packs.
scope:
    in: campaign concepts, briefs, themes, brand kits, generated ad copy and images, the approval workflow
    out: publishing to ad platforms, ad performance measurement, video assets, localization
last-reviewed: 2026-07-15
```

### Campaign

- **type**: Aggregate Root
- **status**: accepted
- **definition**: One creative concept/angle (e.g. "privacy-first, dry wit") expressed across every supported ad platform. Not a platform buying structure — a Campaign here supplies creative that any number of platform campaigns can consume.
- **invariants**:
    - Has exactly one Theme.
    - Contains one Asset Group per supported platform.
    - All its assets share the Theme's tone and angle.
- **examples**: "01-privacy-first" holding RSA copy, PMax images+text, and Meta images+text, all in the same angle. Counter-example: a "Meta prospecting Q3" ad-account campaign — that is a platform structure, out of scope.
- **relationships**: produced by a Run; has one Theme; contains Asset Groups
- **synonyms**: informally "concept" or "angle" in ad literature

### Run

- **type**: Domain Event
- **status**: accepted
- **definition**: One end-to-end pass of the workflow: point at a product repo, choose how many Campaigns, review the Brief and Themes, approve, generate, review assets, finalize. All decisions and outputs of a Run persist on disk so it can be resumed.
- **invariants**:
    - Progresses only forward through: briefing → awaiting-approval → generating → reviewing → (regenerating → reviewing)* → finalizing → complete.
    - Assets are final only when every one is approved.
- **examples**: "3 campaigns for goodbyespy on 2026-07-15". Counter-example: regenerating one rejected image is part of the same Run, not a new one.
- **relationships**: produces Campaigns; consumes one Brand Kit and one Brief

### Brief

- **type**: Value Object
- **status**: accepted
- **definition**: The "what are we advertising" summary: product, audience, value propositions, offer, landing destination, and voice profile. Drafted automatically from the product repo, then corrected by the user at the approval gate.
- **invariants**:
    - Approved by the user before any asset generation starts.
- **examples**: "goodbyespy — one-time-purchase privacy app for consumers; offer: free trial; voice: plainspoken, no hype". Counter-example: a media plan with budgets and channels — out of scope.
- **relationships**: belongs to a Run; informs every Theme

### Theme

- **type**: Value Object
- **status**: accepted
- **definition**: The proposed identity of one Campaign: name, Angle, tone notes, a sample headline, and a visual direction. Proposed by the tool, edited/approved by the user before generation.
- **invariants**:
    - One Theme per Campaign.
    - Must be consistent with the Brief's voice profile.
- **examples**: "Price honesty — offer-led, deadpan tone, cream-on-green, stamp layout emphasis". Counter-example: a full copy slate — that is generated output, not a Theme.
- **relationships**: identifies a Campaign; carries one Angle; constrained by the Brief

### Brand Kit

- **type**: Value Object
- **status**: accepted
- **definition**: Everything the tool knows about a brand's identity, extracted from the product repo: color palette, typefaces, spacing/effects, logo marks, and voice guidance (stated or inferred). The single source for how assets look and sound.
- **invariants**:
    - Every visual property of a generated image traces back to the Brand Kit.
    - Voice guidance overrides generic advertising best practice when they conflict.
- **examples**: goodbyespy's greens/creams, Besley/Familjen Grotesk, waving-spy logo, "no emoji, sentence case" voice. Counter-example: platform image size rules — those are platform specs, not brand.
- **relationships**: consumed by a Run; skins Templates; constrains copy in every Asset Group

### Angle

- **type**: Policy
- **status**: accepted
- **definition**: The persuasive strategy of a Campaign — which lever the message pulls: benefit-led, proof-led, offer-led, or another recognized bucket. Campaigns in one Run should carry distinct Angles so the set covers genuinely different messages.
- **invariants**:
    - One primary Angle per Campaign.
- **examples**: benefit-led ("save hours"), proof-led ("4.8 stars from 2,400 reviews"), offer-led ("free trial, no card"). Counter-example: a tone like "playful" — that is voice, not an Angle.
- **relationships**: carried by a Theme; flavors every Variant and copy slate in the Campaign

### Variant

- **type**: Entity
- **status**: accepted
- **definition**: One distinct visual rendering within a Campaign — a specific Template treatment of the Campaign's message, produced in every required size. Variants differ in layout/composition, not in message.
- **invariants**:
    - Same Theme and Angle as its Campaign.
    - Exists in every aspect ratio its platform requires.
    - Individually approvable and regenerable.
- **examples**: "v2" = the offer-stamp treatment of the price-honesty campaign, rendered 1:1, 4:5, and 9:16. Counter-example: the 4:5 crop of v2 alone — that is one size of a Variant, not a Variant.
- **relationships**: belongs to an Asset Group; rendered from one Template

### Asset Group

- **type**: Entity
- **status**: accepted
- **definition**: The per-platform bundle inside a Campaign: the copy slate plus image Variants that one platform needs, complete enough to upload in a single sitting. Deliberately looser than Google's "asset group" (a Performance Max structure); here it exists for every platform, including text-only ones.
- **invariants**:
    - All copy respects its platform's field and length rules.
    - All images respect its platform's sizes and safe zones.
- **examples**: the `meta/` bundle: primary texts, headlines, descriptions, and 9 images. Counter-example: a mixed folder holding Google and Meta files together.
- **relationships**: belongs to a Campaign; contains Variants
- **synonyms**: Google Performance Max narrowly calls its buying unit "asset group"

### Template

- **type**: Value Object
- **status**: accepted
- **definition**: A fixed, hand-designed ad layout (headline placement, logo lockup, CTA block, safe-zone handling) that is skinned with a Brand Kit and filled with copy to produce a Variant. The library is deliberately small and built into the tool.
- **invariants**:
    - Encodes creative best practice: one message, one CTA, small logo, safe zones respected.
    - Contains no brand-specific values; all styling arrives via the Brand Kit.
- **examples**: poster-type, offer-stamp, proof-card, direct-cta, stat-callout. Counter-example: a bespoke layout authored for a single campaign.
- **relationships**: renders Variants; skinned by the Brand Kit
