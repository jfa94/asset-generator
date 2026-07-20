import type {CSSProperties, ReactElement} from 'react'
import type {CreativeSpec, LockupId, SafeZone, SlotName} from '@/types/creative'

// Layout rules baked in from the creative playbooks: one message per ad, small top-left
// logo lockup, generous negative space, safe zones on 9:16. No CTA pill — every target
// platform overlays its own CTA button.
// This module is client-safe (no react-dom/server): the same tree renders live in the
// cockpit for review/editing and via services/render at finalize.

export interface LockupFonts {
    display: string
    body: string
}

export interface LockupProps {
    spec: CreativeSpec
    width: number
    height: number
    safeZone?: SafeZone | undefined
    fonts: LockupFonts
    logoSrc: string | null
    imageSrc: string | null
    /** present → copy slots become contentEditable, committing on blur */
    onEdit?: ((slot: SlotName, value: string) => void) | undefined
}

interface Frame extends LockupProps {
    /** rem-like unit scaled to the canvas: 1u = 1% of the smaller canvas edge */
    u: number
    padTop: number
    padBottom: number
    padX: number
    /** wide canvases lay image + text side by side; tall ones stack them */
    wide: boolean
}

const frameOf = (p: LockupProps): Frame => {
    const u = Math.min(p.width, p.height) / 100
    const basePad = 7 * u
    return {
        ...p,
        u,
        padX: basePad,
        padTop: basePad + (p.safeZone?.top ?? 0) * p.height,
        padBottom: basePad + (p.safeZone?.bottom ?? 0) * p.height,
        wide: p.width > p.height,
    }
}

const px = (n: number): string => `${String(n)}px`

interface TxtProps {
    f: Frame
    slot: SlotName
    style: CSSProperties
    tag?: 'h1' | 'p' | 'div'
    children: string
}

/** Copy slot: plain element for the PNG path, contentEditable with commit-on-blur when editable. */
const Txt = ({f, slot, style, tag = 'p', children}: TxtProps): ReactElement => {
    const Tag = tag
    const {onEdit} = f
    return onEdit === undefined ? (
        <Tag style={style}>{children}</Tag>
    ) : (
        <Tag
            style={{...style, outline: 'none', cursor: 'text'}}
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
                onEdit(slot, e.currentTarget.textContent)
            }}
        >
            {children}
        </Tag>
    )
}

const Logo = ({logoSrc, u}: Frame): ReactElement | null =>
    logoSrc === null ? null : (
        <img
            src={logoSrc}
            alt=''
            style={{height: px(6 * u), width: 'auto', objectFit: 'contain', alignSelf: 'flex-start'}}
        />
    )

/** Image slot: cover-cropped; a dashed placeholder when the spec has no image yet. */
const SlotImage = ({f, style}: {f: Frame; style: CSSProperties}): ReactElement =>
    f.imageSrc === null ? (
        <div style={{...style, border: `${px(0.5 * f.u)} dashed ${f.spec.palette.accent}`, boxSizing: 'border-box'}} />
    ) : (
        <img src={f.imageSrc} alt='' style={{...style, objectFit: 'cover', display: 'block'}} />
    )

const canvasStyle = (f: Frame): CSSProperties => ({
    width: px(f.width),
    height: px(f.height),
    background: f.spec.palette.background,
    color: f.spec.palette.text,
    fontFamily: f.fonts.body,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
    padding: `${px(f.padTop)} ${px(f.padX)} ${px(f.padBottom)}`,
    overflow: 'hidden',
})

const display = (f: Frame, size: number): CSSProperties => ({
    fontFamily: f.fonts.display,
    fontWeight: 700,
    fontSize: px(size * f.u),
    lineHeight: 1.05,
    letterSpacing: '-0.02em',
    margin: 0,
})

const body = (f: Frame, size: number): CSSProperties => ({
    fontFamily: f.fonts.body,
    fontSize: px(size * f.u),
    lineHeight: 1.35,
    margin: 0,
    opacity: 0.85,
})

const col = (f: Frame, gap: number): CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    gap: px(gap * f.u),
})

// ── The seven lockups ───────────────────────────────────────────────────────

/** Hero headline carries the whole message. */
const Poster = (f: Frame): ReactElement => (
    <div style={canvasStyle(f)}>
        <Logo {...f} />
        <div style={col(f, 3)}>
            <Txt f={f} slot='headline' tag='h1' style={display(f, 11)}>
                {f.spec.copy.headline}
            </Txt>
            {f.spec.copy.subline !== undefined && (
                <Txt f={f} slot='subline' style={body(f, 3.6)}>
                    {f.spec.copy.subline}
                </Txt>
            )}
        </div>
    </div>
)

/** Product screenshot in an accent-framed panel; headline sells, panel shows. */
const ScreenshotPanel = (f: Frame): ReactElement => (
    <div style={{...canvasStyle(f), flexDirection: f.wide ? 'row' : 'column', gap: px(4 * f.u)}}>
        <div style={{...col(f, 3), flex: 1, minWidth: 0, minHeight: 0, justifyContent: 'space-between'}}>
            <Logo {...f} />
            <div style={col(f, 2)}>
                <Txt f={f} slot='headline' tag='h1' style={display(f, 7)}>
                    {f.spec.copy.headline}
                </Txt>
                {f.spec.copy.subline !== undefined && (
                    <Txt f={f} slot='subline' style={body(f, 3.2)}>
                        {f.spec.copy.subline}
                    </Txt>
                )}
            </div>
        </div>
        <SlotImage
            f={f}
            style={{
                flex: 1.2,
                minWidth: 0,
                minHeight: 0,
                borderRadius: px(2 * f.u),
                border: `${px(0.5 * f.u)} solid ${f.spec.palette.accent}`,
            }}
        />
    </div>
)

/** Image bleeds to the canvas edge; a solid brand band carries logo + headline. */
const ScreenshotBleed = (f: Frame): ReactElement => {
    const band: CSSProperties = f.wide
        ? {top: 0, bottom: 0, left: 0, width: '42%', padding: `${px(f.padTop)} ${px(f.padX)} ${px(f.padBottom)}`}
        : {left: 0, right: 0, bottom: 0, padding: `${px(4 * f.u)} ${px(f.padX)} ${px(f.padBottom)}`}
    return (
        <div
            style={{
                width: px(f.width),
                height: px(f.height),
                position: 'relative',
                overflow: 'hidden',
                background: f.spec.palette.background,
                color: f.spec.palette.text,
                fontFamily: f.fonts.body,
            }}
        >
            <SlotImage f={f} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
            <div
                style={{
                    ...band,
                    position: 'absolute',
                    background: f.spec.palette.background,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: px(3 * f.u),
                    boxSizing: 'border-box',
                }}
            >
                <Logo {...f} />
                <Txt f={f} slot='headline' tag='h1' style={display(f, 7)}>
                    {f.spec.copy.headline}
                </Txt>
            </div>
        </div>
    )
}

/** Borderless imagery dominates; compact text block anchors it. */
const ImageHero = (f: Frame): ReactElement => (
    <div style={{...canvasStyle(f), flexDirection: f.wide ? 'row' : 'column', gap: px(4 * f.u)}}>
        <SlotImage f={f} style={{flex: 1.5, minWidth: 0, minHeight: 0, borderRadius: px(3 * f.u)}} />
        <div style={{...col(f, 3), flex: 1, minWidth: 0, justifyContent: 'flex-end'}}>
            <Logo {...f} />
            <Txt f={f} slot='headline' tag='h1' style={display(f, 8)}>
                {f.spec.copy.headline}
            </Txt>
            {f.spec.copy.subline !== undefined && (
                <Txt f={f} slot='subline' style={body(f, 3.2)}>
                    {f.spec.copy.subline}
                </Txt>
            )}
        </div>
    </div>
)

/** One huge number does the persuading. */
const Stat = (f: Frame): ReactElement => (
    <div style={canvasStyle(f)}>
        <Logo {...f} />
        <div style={col(f, 2)}>
            <Txt f={f} slot='stat' tag='div' style={{...display(f, 20), color: f.spec.palette.accent}}>
                {f.spec.copy.stat ?? ''}
            </Txt>
            <Txt f={f} slot='statLabel' style={{...display(f, 5.5), fontWeight: 600}}>
                {f.spec.copy.statLabel ?? f.spec.copy.headline}
            </Txt>
        </div>
    </div>
)

/** Social proof front and center. */
const Proof = (f: Frame): ReactElement => (
    <div style={canvasStyle(f)}>
        <Logo {...f} />
        <div style={col(f, 3)}>
            <div style={{color: f.spec.palette.accent, fontSize: px(5 * f.u), letterSpacing: '0.1em'}}>★★★★★</div>
            <Txt f={f} slot='proof' style={{...display(f, 7), fontWeight: 600}}>
                {f.spec.copy.proof ?? ''}
            </Txt>
            {f.spec.copy.attribution !== undefined && (
                <Txt f={f} slot='attribution' style={body(f, 3.2)}>
                    {f.spec.copy.attribution}
                </Txt>
            )}
        </div>
    </div>
)

/** Rotated stamp badge carries the offer. */
const Badge = (f: Frame): ReactElement => (
    <div style={canvasStyle(f)}>
        <Logo {...f} />
        <div style={{display: 'flex', alignItems: 'center', gap: px(6 * f.u)}}>
            <Txt
                f={f}
                slot='badge'
                tag='div'
                style={{
                    flexShrink: 0,
                    width: px(34 * f.u),
                    height: px(34 * f.u),
                    borderRadius: '50%',
                    border: `${px(0.8 * f.u)} solid ${f.spec.palette.accent}`,
                    color: f.spec.palette.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    transform: 'rotate(-8deg)',
                    fontFamily: f.fonts.display,
                    fontWeight: 700,
                    fontSize: px(5 * f.u),
                    lineHeight: 1.1,
                    padding: px(2 * f.u),
                    boxSizing: 'border-box',
                }}
            >
                {f.spec.copy.badge ?? ''}
            </Txt>
            <Txt f={f} slot='headline' tag='h1' style={display(f, 8)}>
                {f.spec.copy.headline}
            </Txt>
        </div>
    </div>
)

const LOCKUPS: Record<LockupId, (f: Frame) => ReactElement> = {
    poster: Poster,
    'screenshot-panel': ScreenshotPanel,
    'screenshot-bleed': ScreenshotBleed,
    'image-hero': ImageHero,
    stat: Stat,
    proof: Proof,
    badge: Badge,
}

export interface LockupMeta {
    archetype: 'typography' | 'image' | 'stat' | 'proof' | 'offer'
    /** copy slots that must be non-empty (headline is always required) */
    required: SlotName[]
    optional: SlotName[]
    /** requires spec.imageFile */
    image: boolean
    /** when the agent should pick this lockup */
    when: string
}

/** The machine-readable bank the agent reads to choose lockups per theme. */
export const LOCKUP_META: Record<LockupId, LockupMeta> = {
    poster: {
        archetype: 'typography',
        required: ['headline'],
        optional: ['subline'],
        image: false,
        when: 'default typographic hero; a strong short headline carries any theme',
    },
    'screenshot-panel': {
        archetype: 'image',
        required: ['headline'],
        optional: ['subline'],
        image: true,
        when: 'a product UI screenshot exists; show the product doing the work',
    },
    'screenshot-bleed': {
        archetype: 'image',
        required: ['headline'],
        optional: [],
        image: true,
        when: 'imagery strong enough to survive edge-to-edge cover cropping',
    },
    'image-hero': {
        archetype: 'image',
        required: ['headline'],
        optional: ['subline'],
        image: true,
        when: 'emotive brand imagery or mascot art; the image sets the mood, the headline anchors it',
    },
    stat: {
        archetype: 'stat',
        required: ['headline', 'stat'],
        optional: ['statLabel'],
        image: false,
        when: 'one real, impressive number exists (users, removals, rating) — never invent it',
    },
    proof: {
        archetype: 'proof',
        required: ['headline', 'proof'],
        optional: ['attribution'],
        image: false,
        when: 'a real quote or review exists — never invent testimonials',
    },
    badge: {
        archetype: 'offer',
        required: ['headline', 'badge'],
        optional: [],
        image: false,
        when: 'a concrete offer fits a short stamp (price, guarantee, discount)',
    },
}

export const LOCKUP_IDS = Object.keys(LOCKUP_META) as LockupId[]

/** Runtime validation for specs crossing the run.json boundary; returns missing slot names. */
export const missingSlots = (spec: CreativeSpec): string[] => {
    const meta = LOCKUP_META[spec.lockup]
    const copy: Partial<Record<SlotName, string>> = spec.copy
    const missing: string[] = meta.required.filter((s) => (copy[s] ?? '').trim() === '')
    if (meta.image && (spec.imageFile ?? '').trim() === '') {
        missing.push('imageFile')
    }
    return missing
}

/** Render one creative at a given canvas size; the same tree serves live preview and PNG render. */
export const Lockup = (props: LockupProps): ReactElement => LOCKUPS[props.spec.lockup](frameOf(props))
