export type TemplateId = 'poster-type' | 'offer-stamp' | 'proof-card' | 'direct-cta' | 'stat-callout'

export const TEMPLATE_IDS: TemplateId[] = ['poster-type', 'offer-stamp', 'proof-card', 'direct-cta', 'stat-callout']

export interface TemplateCopy {
    headline: string
    subline?: string
    cta?: string
    /** testimonial/proof line (proof-card) */
    proof?: string
    attribution?: string
    /** short offer text for the stamp (offer-stamp) */
    badge?: string
    /** the big number (stat-callout) */
    stat?: string
    statLabel?: string
}

export interface TemplatePalette {
    background: string
    text: string
    accent: string
    ctaBackground: string
    ctaText: string
}

export interface TemplateSpec {
    template: TemplateId
    width: number
    height: number
    /** fractions of height to keep clear (9:16 platform chrome) */
    safeZone?: {top: number; bottom: number}
    palette: TemplatePalette
    /** concrete font family names, loaded by cssText */
    fonts: {display: string; body: string}
    /** inlined stylesheet text (typically the brand's fonts.css with its @imports) */
    cssText: string
    logoDataUri: string | null
    copy: TemplateCopy
}
