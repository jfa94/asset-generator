import {describe, expect, it} from 'vitest'
import {buildHtml} from '@/lib/templates/templates'
import {TEMPLATE_IDS, type TemplateSpec} from '@/lib/templates/types'

const spec = (overrides: Partial<TemplateSpec> = {}): TemplateSpec => ({
    template: 'poster-type',
    width: 1080,
    height: 1080,
    palette: {
        background: '#fffbf5',
        text: '#064e3b',
        accent: '#b5541f',
        ctaBackground: '#064e3b',
        ctaText: '#fffbf5',
    },
    fonts: {display: 'Besley', body: 'Familjen Grotesk'},
    cssText: '@import url(https://fonts.example/css);',
    logoDataUri: 'data:image/png;base64,AAAA',
    copy: {
        headline: 'No subscriptions, no surprises',
        subline: 'One purchase. Your data, gone from broker sites.',
        cta: 'Get started',
        proof: 'It just quietly works.',
        attribution: 'App Store review',
        badge: 'One-time $49',
        stat: '2,400+',
        statLabel: 'removals filed',
    },
    ...overrides,
})

describe('template ids', () => {
    it('pins the template library', () => {
        expect(TEMPLATE_IDS).toEqual(['poster-type', 'offer-stamp', 'proof-card', 'direct-cta', 'stat-callout'])
    })
})

describe('buildHtml', () => {
    it.each(TEMPLATE_IDS)('%s renders a full document with the headline or proof', (template) => {
        const html = buildHtml(spec({template}))
        expect(html).toContain('<!doctype html>')
        expect(html).toMatch(/No subscriptions, no surprises|It just quietly works|removals filed/)
        expect(html).toContain('width:1080px')
        expect(html).toContain('height:1080px')
    })

    it('escapes copy — no markup injection into the canvas', () => {
        const html = buildHtml(spec({copy: {headline: '<script>alert(1)</script>', cta: 'a & b'}}))
        expect(html).not.toContain('<script>alert(1)</script>')
        expect(html).toContain('&lt;script&gt;')
    })

    it('inlines the brand css', () => {
        expect(buildHtml(spec())).toContain('@import url(https://fonts.example/css);')
    })

    it('applies safe-zone padding on 9:16', () => {
        const html = buildHtml(spec({width: 1080, height: 1920, safeZone: {top: 0.14, bottom: 0.2}}))
        // top pad = 7% of 1080 (75.6) + 14% of 1920 (268.8) = 344.4; bottom = 75.6 + 384 = 459.6
        expect(html).toMatch(/padding:344\.4[\d.]*px 75\.6[\d.]*px 459\.6[\d.]*px/)
    })

    it('omits logo and CTA when absent', () => {
        const html = buildHtml(spec({logoDataUri: null, copy: {headline: 'Just a headline'}}))
        expect(html).not.toContain('<img')
        expect(html).not.toContain('Get started')
    })

    it('uses the palette and fonts', () => {
        const html = buildHtml(spec())
        expect(html).toContain('background:#fffbf5')
        expect(html).toContain('Besley')
        expect(html).toContain('Familjen Grotesk')
    })
})
