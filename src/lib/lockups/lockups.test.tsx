import {renderToStaticMarkup} from 'react-dom/server'
import {describe, expect, it} from 'vitest'
import {Lockup, LOCKUP_IDS, LOCKUP_META, missingSlots, type LockupProps} from '@/lib/lockups/lockups'
import type {CreativeSpec, LockupCopy, LockupId} from '@/types/creative'

const fullCopy: LockupCopy = {
    headline: 'No subscriptions, no surprises',
    subline: 'One purchase. Your data, gone from broker sites.',
    proof: 'It just quietly works.',
    attribution: 'App Store review',
    badge: 'One-time $49',
    stat: '2,400+',
    statLabel: 'removals filed',
}

const spec = (overrides: Partial<CreativeSpec> = {}): CreativeSpec => ({
    lockup: 'poster',
    palette: {background: '#fffbf5', text: '#064e3b', accent: '#b5541f'},
    copy: fullCopy,
    imageFile: 'assets/shot.png',
    ...overrides,
})

const props = (overrides: Partial<LockupProps> = {}): LockupProps => ({
    spec: spec(),
    width: 1080,
    height: 1080,
    fonts: {display: 'Besley', body: 'Familjen Grotesk'},
    logoSrc: 'data:image/png;base64,AAAA',
    imageSrc: 'data:image/png;base64,BBBB',
    ...overrides,
})

const html = (overrides: Partial<LockupProps> = {}): string => renderToStaticMarkup(<Lockup {...props(overrides)} />)

describe('lockup bank', () => {
    it('pins the lockup library', () => {
        expect(LOCKUP_IDS).toEqual([
            'poster',
            'screenshot-panel',
            'screenshot-bleed',
            'image-hero',
            'stat',
            'proof',
            'badge',
        ])
    })

    it.each(LOCKUP_IDS)('%s renders the canvas at size with its focal copy', (lockup) => {
        const out = html({spec: spec({lockup})})
        expect(out).toContain('width:1080px')
        expect(out).toContain('height:1080px')
        expect(out).toMatch(/No subscriptions, no surprises|2,400\+|It just quietly works/)
    })

    it.each(LOCKUP_IDS)('%s renders no CTA pill even when a stray cta key crosses the JSON boundary', (lockup) => {
        const copy = {...fullCopy, cta: 'Get started'} as LockupCopy
        expect(html({spec: spec({lockup, copy})})).not.toContain('Get started')
    })

    it('escapes copy — no markup injection into the canvas', () => {
        const out = html({spec: spec({copy: {headline: '<script>alert(1)</script>'}})})
        expect(out).not.toContain('<script>alert(1)</script>')
        expect(out).toContain('&lt;script&gt;')
    })

    it('applies safe-zone padding on 9:16', () => {
        // top pad = 7% of 1080 (75.6) + 14% of 1920 (268.8) = 344.4; bottom = 75.6 + 384 = 459.6
        const out = html({width: 1080, height: 1920, safeZone: {top: 0.14, bottom: 0.2}})
        expect(out).toMatch(/padding:344\.4[\d.]*px 75\.6[\d.]*px 459\.6[\d.]*px/)
    })

    it('uses palette and fonts', () => {
        const out = html()
        expect(out).toContain('background:#fffbf5')
        expect(out).toContain('Besley')
        expect(out).toContain('Familjen Grotesk')
    })

    it('omits the logo when absent', () => {
        const out = html({logoSrc: null, spec: spec({lockup: 'poster', copy: {headline: 'Just a headline'}})})
        expect(out).not.toContain('<img')
    })

    describe('image lockups', () => {
        const imageIds = LOCKUP_IDS.filter((id) => LOCKUP_META[id].image)

        it('marks exactly the three image lockups in the meta bank', () => {
            expect(imageIds).toEqual(['screenshot-panel', 'screenshot-bleed', 'image-hero'])
        })

        it.each(imageIds)('%s renders a cover-cropped <img> for the image slot', (lockup) => {
            const out = html({spec: spec({lockup})})
            expect(out).toContain('src="data:image/png;base64,BBBB"')
            expect(out).toContain('object-fit:cover')
        })

        it.each(imageIds)('%s renders a dashed placeholder when the image is missing', (lockup) => {
            const out = html({spec: spec({lockup}), imageSrc: null})
            expect(out).not.toContain('data:image/png;base64,BBBB')
            expect(out).toContain('dashed')
        })

        it.each(['screenshot-panel', 'image-hero'] as LockupId[])(
            '%s lays out row when wide, column when tall',
            (lockup) => {
                expect(html({spec: spec({lockup}), width: 1200, height: 628})).toContain('flex-direction:row')
                expect(html({spec: spec({lockup}), width: 1080, height: 1920})).toContain('flex-direction:column')
            }
        )

        it('screenshot-bleed places the text band left when wide, bottom when tall', () => {
            expect(html({spec: spec({lockup: 'screenshot-bleed'}), width: 1200, height: 628})).toContain('width:42%')
            expect(html({spec: spec({lockup: 'screenshot-bleed'}), width: 1080, height: 1920})).not.toContain(
                'width:42%'
            )
        })
    })

    describe('editable slots', () => {
        it('renders plain elements without onEdit — identical markup for the PNG path', () => {
            expect(html()).not.toMatch(/contenteditable/i)
        })

        it('renders contentEditable slots when onEdit is present', () => {
            const out = html({onEdit: () => undefined})
            expect(out).toMatch(/contenteditable/i)
        })
    })
})

describe('missingSlots', () => {
    const emptyCopy = {headline: ''} as LockupCopy

    it.each<[LockupId, string[]]>([
        ['poster', ['headline']],
        ['screenshot-panel', ['headline', 'imageFile']],
        ['screenshot-bleed', ['headline', 'imageFile']],
        ['image-hero', ['headline', 'imageFile']],
        ['stat', ['headline', 'stat']],
        ['proof', ['headline', 'proof']],
        ['badge', ['headline', 'badge']],
    ])('%s requires %j', (lockup, expected) => {
        const bare: CreativeSpec = {lockup, palette: spec().palette, copy: emptyCopy}
        expect(missingSlots(bare)).toEqual(expected)
    })

    it('accepts a complete spec', () => {
        for (const lockup of LOCKUP_IDS) {
            expect(missingSlots(spec({lockup}))).toEqual([])
        }
    })

    it('treats whitespace-only slots and imageFile as missing', () => {
        expect(missingSlots(spec({lockup: 'stat', copy: {...fullCopy, stat: '  '}}))).toEqual(['stat'])
        expect(missingSlots(spec({lockup: 'image-hero', imageFile: ' '}))).toEqual(['imageFile'])
    })
})
