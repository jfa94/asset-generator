import {describe, expect, it} from 'vitest'
import {buildHtml, type RenderSpec} from '@/services/render/html'

const renderSpec = (overrides: Partial<RenderSpec> = {}): RenderSpec => ({
    spec: {
        lockup: 'poster',
        palette: {background: '#fffbf5', text: '#064e3b', accent: '#b5541f'},
        copy: {headline: 'No subscriptions, no surprises', subline: 'One purchase.'},
    },
    width: 1200,
    height: 628,
    fonts: {display: 'Besley', body: 'Familjen Grotesk'},
    cssText: '@import url(https://fonts.example/css);',
    logoDataUri: 'data:image/png;base64,AAAA',
    imageDataUri: null,
    ...overrides,
})

describe('buildHtml', () => {
    it('renders a full document with the lockup markup', () => {
        const html = buildHtml(renderSpec())
        expect(html).toContain('<!doctype html>')
        expect(html).toContain('No subscriptions, no surprises')
        expect(html).toContain('width:1200px')
        expect(html).toContain('height:628px')
        expect(html).toContain('data:image/png;base64,AAAA')
    })

    it('inlines the brand css', () => {
        expect(buildHtml(renderSpec())).toContain('@import url(https://fonts.example/css);')
    })

    it('inlines the image data uri for image lockups', () => {
        const html = buildHtml(
            renderSpec({
                spec: {
                    lockup: 'image-hero',
                    palette: {background: '#fff', text: '#000', accent: '#f00'},
                    copy: {headline: 'See it work'},
                    imageFile: 'assets/shot.png',
                },
                imageDataUri: 'data:image/jpeg;base64,BBBB',
            })
        )
        expect(html).toContain('data:image/jpeg;base64,BBBB')
        expect(html).toContain('object-fit:cover')
    })

    it('applies safe zones through to the lockup padding', () => {
        const html = buildHtml(renderSpec({width: 1080, height: 1920, safeZone: {top: 0.14, bottom: 0.2}}))
        expect(html).toMatch(/padding:344\.4[\d.]*px 75\.6[\d.]*px 459\.6[\d.]*px/)
    })
})
