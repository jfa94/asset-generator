import type {CSSProperties, ReactElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import type {TemplateId, TemplateSpec} from '@/lib/templates/types'

// Layout rules baked in from the creative playbooks: one message + one CTA per ad,
// small top-left logo lockup, generous negative space, safe zones on 9:16.

interface Frame {
    spec: TemplateSpec
    /** rem-like unit scaled to the canvas: 1u = 1% of the smaller canvas edge */
    u: number
    padTop: number
    padBottom: number
    padX: number
}

const frameOf = (spec: TemplateSpec): Frame => {
    const u = Math.min(spec.width, spec.height) / 100
    const basePad = 7 * u
    return {
        spec,
        u,
        padX: basePad,
        padTop: basePad + (spec.safeZone?.top ?? 0) * spec.height,
        padBottom: basePad + (spec.safeZone?.bottom ?? 0) * spec.height,
    }
}

const Logo = ({spec, u}: Frame): ReactElement | null =>
    spec.logoDataUri === null ? null : (
        <img
            src={spec.logoDataUri}
            alt=''
            style={{height: `${String(6 * u)}px`, width: 'auto', objectFit: 'contain', alignSelf: 'flex-start'}}
        />
    )

const CtaPill = ({spec, u}: Frame): ReactElement | null =>
    spec.copy.cta === undefined ? null : (
        <div
            style={{
                alignSelf: 'flex-start',
                background: spec.palette.ctaBackground,
                color: spec.palette.ctaText,
                fontFamily: spec.fonts.body,
                fontWeight: 700,
                fontSize: `${String(3.4 * u)}px`,
                padding: `${String(1.6 * u)}px ${String(4 * u)}px`,
                borderRadius: `${String(6 * u)}px`,
            }}
        >
            {spec.copy.cta}
        </div>
    )

const canvasStyle = (f: Frame): CSSProperties => ({
    width: `${String(f.spec.width)}px`,
    height: `${String(f.spec.height)}px`,
    background: f.spec.palette.background,
    color: f.spec.palette.text,
    fontFamily: f.spec.fonts.body,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
    padding: `${String(f.padTop)}px ${String(f.padX)}px ${String(f.padBottom)}px`,
    overflow: 'hidden',
})

const display = (f: Frame, size: number): CSSProperties => ({
    fontFamily: f.spec.fonts.display,
    fontWeight: 700,
    fontSize: `${String(size * f.u)}px`,
    lineHeight: 1.05,
    letterSpacing: '-0.02em',
    margin: 0,
})

const body = (f: Frame, size: number): CSSProperties => ({
    fontFamily: f.spec.fonts.body,
    fontSize: `${String(size * f.u)}px`,
    lineHeight: 1.35,
    margin: 0,
    opacity: 0.85,
})

// ── The five layouts ────────────────────────────────────────────────────────

/** Hero headline carries the whole message. */
const PosterType = (f: Frame): ReactElement => (
    <div style={canvasStyle(f)}>
        <Logo {...f} />
        <div style={{display: 'flex', flexDirection: 'column', gap: `${String(3 * f.u)}px`}}>
            <h1 style={display(f, 11)}>{f.spec.copy.headline}</h1>
            {f.spec.copy.subline !== undefined && <p style={body(f, 3.6)}>{f.spec.copy.subline}</p>}
        </div>
        <CtaPill {...f} />
    </div>
)

/** Rotated stamp badge carries the offer. */
const OfferStamp = (f: Frame): ReactElement => (
    <div style={canvasStyle(f)}>
        <Logo {...f} />
        <div style={{display: 'flex', alignItems: 'center', gap: `${String(6 * f.u)}px`}}>
            <div
                style={{
                    flexShrink: 0,
                    width: `${String(34 * f.u)}px`,
                    height: `${String(34 * f.u)}px`,
                    borderRadius: '50%',
                    border: `${String(0.8 * f.u)}px solid ${f.spec.palette.accent}`,
                    color: f.spec.palette.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    transform: 'rotate(-8deg)',
                    fontFamily: f.spec.fonts.display,
                    fontWeight: 700,
                    fontSize: `${String(5 * f.u)}px`,
                    lineHeight: 1.1,
                    padding: `${String(2 * f.u)}px`,
                    boxSizing: 'border-box',
                }}
            >
                {f.spec.copy.badge ?? ''}
            </div>
            <h1 style={display(f, 8)}>{f.spec.copy.headline}</h1>
        </div>
        <CtaPill {...f} />
    </div>
)

/** Social proof front and center. */
const ProofCard = (f: Frame): ReactElement => (
    <div style={canvasStyle(f)}>
        <Logo {...f} />
        <div style={{display: 'flex', flexDirection: 'column', gap: `${String(3 * f.u)}px`}}>
            <div style={{color: f.spec.palette.accent, fontSize: `${String(5 * f.u)}px`, letterSpacing: '0.1em'}}>
                ★★★★★
            </div>
            <p style={{...display(f, 7), fontWeight: 600}}>“{f.spec.copy.proof ?? f.spec.copy.headline}”</p>
            {f.spec.copy.attribution !== undefined && <p style={body(f, 3.2)}>{f.spec.copy.attribution}</p>}
        </div>
        <CtaPill {...f} />
    </div>
)

/** Plain product noun + CTA; the most direct layout. */
const DirectCta = (f: Frame): ReactElement => (
    <div style={{...canvasStyle(f), justifyContent: 'center', gap: `${String(5 * f.u)}px`}}>
        <Logo {...f} />
        <h1 style={display(f, 9)}>{f.spec.copy.headline}</h1>
        {f.spec.copy.subline !== undefined && <p style={body(f, 3.6)}>{f.spec.copy.subline}</p>}
        <CtaPill {...f} />
    </div>
)

/** One huge number does the persuading. */
const StatCallout = (f: Frame): ReactElement => (
    <div style={canvasStyle(f)}>
        <Logo {...f} />
        <div style={{display: 'flex', flexDirection: 'column', gap: `${String(2 * f.u)}px`}}>
            <div style={{...display(f, 20), color: f.spec.palette.accent}}>{f.spec.copy.stat ?? ''}</div>
            <p style={{...display(f, 5.5), fontWeight: 600}}>{f.spec.copy.statLabel ?? f.spec.copy.headline}</p>
        </div>
        <CtaPill {...f} />
    </div>
)

const TEMPLATES: Record<TemplateId, (f: Frame) => ReactElement> = {
    'poster-type': PosterType,
    'offer-stamp': OfferStamp,
    'proof-card': ProofCard,
    'direct-cta': DirectCta,
    'stat-callout': StatCallout,
}

/** Build the self-contained HTML document Puppeteer screenshots. */
export const buildHtml = (spec: TemplateSpec): string => {
    const markup = renderToStaticMarkup(TEMPLATES[spec.template](frameOf(spec)))
    return [
        '<!doctype html><html><head><meta charset="utf-8">',
        `<style>${spec.cssText}</style>`,
        '<style>html,body{margin:0;padding:0}</style>',
        '</head><body>',
        markup,
        '</body></html>',
    ].join('')
}
