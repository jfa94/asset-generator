import {renderToStaticMarkup} from 'react-dom/server'
import {describe, expect, it} from 'vitest'
import LockupPreview, {assetUrl} from '@/components/creative/LockupPreview'
import type {CreativeSpec} from '@/types/creative'
import type {RunBrand} from '@/types/run'

const brand: RunBrand = {
    cssFile: 'brand/brand.css',
    fonts: {display: 'Besley', body: 'Familjen Grotesk'},
    logoFile: 'brand/logo.png',
}

const spec: CreativeSpec = {
    lockup: 'poster',
    palette: {background: '#fffbf5', text: '#064e3b', accent: '#b5541f'},
    copy: {headline: 'No subscriptions'},
}

const markup = (overrides: Partial<Parameters<typeof LockupPreview>[0]> = {}): string =>
    renderToStaticMarkup(
        <LockupPreview
            runId='run-1'
            brand={brand}
            spec={spec}
            width={960}
            height={1200}
            displayWidth={320}
            {...overrides}
        />
    )

describe('assetUrl', () => {
    it('builds an /api/asset url with encoded params', () => {
        expect(assetUrl('run-1', 'brand/logo file.png')).toBe('/api/asset?run=run-1&f=brand%2Flogo%20file.png')
    })
})

describe('LockupPreview', () => {
    it('scales the full-size canvas into the display box', () => {
        const out = markup()
        // k = 320/960; box height = 1200k = 400
        expect(out).toContain('width:320px')
        expect(out).toContain('height:400px')
        expect(out).toContain(`transform:scale(${String(320 / 960)})`)
        expect(out).toContain('transform-origin:top left')
        expect(out).toContain('width:960px')
        expect(out).toContain('height:1200px')
    })

    it('resolves logo and image files through /api/asset', () => {
        const out = markup({spec: {...spec, lockup: 'image-hero', imageFile: 'assets/shot.png'}})
        expect(out).toContain('src="/api/asset?run=run-1&amp;f=brand%2Flogo.png"')
        expect(out).toContain('src="/api/asset?run=run-1&amp;f=assets%2Fshot.png"')
    })

    it('passes no logo when the brand has none', () => {
        const out = markup({brand: {...brand, logoFile: null}})
        expect(out).not.toContain('/api/asset?run=run-1&amp;f=brand%2Flogo.png')
    })

    it('renders editable slots only when onEdit is given', () => {
        expect(markup()).not.toMatch(/contenteditable/i)
        expect(markup({onEdit: () => undefined})).toMatch(/contenteditable/i)
    })
})
