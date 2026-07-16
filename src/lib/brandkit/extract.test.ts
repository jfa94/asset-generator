import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {basename, join} from 'node:path'
import {afterAll, describe, expect, it} from 'vitest'
import {extractBrandKit} from '@/lib/brandkit/extract'

const fixture = (name: string): string => join(import.meta.dirname, '__fixtures__', name)

describe('extractBrandKit from design-system manifest', () => {
    const kit = extractBrandKit(fixture('goodbyespy'))

    it('uses the design-system source', () => {
        expect(kit.source).toBe('design-system')
    })

    it('maps tokens with kinds', () => {
        const green = kit.tokens.find((t) => t.name === '--green-900')
        expect(green).toEqual({name: '--green-900', value: '#064E3B', kind: 'color'})
        expect(kit.tokens.length).toBeGreaterThan(50)
        const kinds = new Set(kit.tokens.map((t) => t.kind))
        expect(kinds).toContain('font')
        expect(kinds).toContain('shadow')
    })

    it('maps brand fonts with their tokens', () => {
        const display = kit.fonts.find((f) => f.family === 'Besley')
        expect(display?.tokens).toContain('--font-display')
        expect(kit.fonts.map((f) => f.family)).toContain('Familjen Grotesk')
    })

    it('finds logos, logo-named files first', () => {
        expect(kit.logos.length).toBeGreaterThan(0)
        expect(kit.logos[0]).toMatch(/\/logo[^/]*$/)
    })

    it('collects brand voice prose from guidelines and SKILL.md', () => {
        expect(kit.voice).toContain('No subscriptions, no surprises')
        expect(kit.voice).toContain('goodbyespy')
        // html markup must be stripped
        expect(kit.voice).not.toContain('<div')
    })

    it('resolves css paths in manifest load order', () => {
        expect(kit.cssPaths.length).toBeGreaterThan(2)
        expect(kit.cssPaths[0]).toMatch(/fonts\.css$/)
        for (const p of kit.cssPaths) {
            expect(p).toContain(fixture('goodbyespy'))
        }
    })
})

describe('extractBrandKit css fallback', () => {
    const kit = extractBrandKit(fixture('cssonly'))

    it('uses the css-fallback source', () => {
        expect(kit.source).toBe('css-fallback')
    })

    it('parses @theme declarations with kinds', () => {
        const brand = kit.tokens.find((t) => t.name === '--color-brand')
        expect(brand).toEqual({name: '--color-brand', value: '#064e3b', kind: 'color'})
        expect(kit.tokens.find((t) => t.name === '--shadow-poster')?.kind).toBe('shadow')
    })

    it('does not pick up declarations outside @theme blocks', () => {
        expect(kit.tokens.find((t) => t.name === '--focus-ring')).toBeUndefined()
    })

    it('derives font families from var refs', () => {
        const families = kit.fonts.map((f) => f.family)
        expect(families).toContain('besley')
        expect(kit.fonts.find((f) => f.family === 'besley')?.tokens).toContain('--font-display')
    })

    it('finds a logo under public/', () => {
        expect(kit.logos.map((p) => basename(p))).toContain('logo.png')
    })

    it('has no voice (agent infers later)', () => {
        expect(kit.voice).toBeNull()
    })

    it('keeps the final declaration when the trailing semicolon is missing', () => {
        const repo = mkdtempSync(join(tmpdir(), 'bk-css-'))
        try {
            mkdirSync(join(repo, 'app'), {recursive: true})
            writeFileSync(
                join(repo, 'app', 'globals.css'),
                '@theme {\n  --color-first: #fff;\n  --color-brand: #064e3b\n}\n'
            )
            expect(extractBrandKit(repo).tokens).toEqual([
                {name: '--color-first', value: '#fff', kind: 'color'},
                {name: '--color-brand', value: '#064e3b', kind: 'color'},
            ])
        } finally {
            rmSync(repo, {recursive: true, force: true})
        }
    })
})

describe('extractBrandKit errors', () => {
    const empty = mkdtempSync(join(tmpdir(), 'bk-'))
    afterAll(() => {
        rmSync(empty, {recursive: true, force: true})
    })

    it('throws for a missing repo', () => {
        expect(() => extractBrandKit(join(empty, 'nope'))).toThrow(/Repo not found/)
    })

    it('throws when neither manifest nor globals.css exists', () => {
        expect(() => extractBrandKit(empty)).toThrow(/No design system found/)
    })

    it('handles a manifest with missing optional fields', () => {
        const bare = mkdtempSync(join(tmpdir(), 'bk-bare-'))
        const ds = join(bare, 'docs', 'design-system')
        try {
            mkdirSync(ds, {recursive: true})
            writeFileSync(join(ds, '_ds_manifest.json'), '{}')
            const kit = extractBrandKit(bare)
            expect(kit.tokens).toEqual([])
            expect(kit.fonts).toEqual([])
            expect(kit.voice).toBeNull()
        } finally {
            rmSync(bare, {recursive: true, force: true})
        }
    })
})
