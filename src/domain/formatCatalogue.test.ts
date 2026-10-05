import fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {AD_FORMATS} from '@/domain/formats'

interface FormatSpecView {
    platform: string
    name: string
    width: number
    height: number
    aspectRatio: string
    safeZone?: {top: number; bottom: number}
}

interface CatalogueModule {
    listFormats: () => FormatSpecView[]
    reduceAspectRatio: (width: number, height: number) => string
}

declare global {
    interface ImportMeta {
        glob<T>(pattern: string): Record<string, () => Promise<T>>
    }
}

// A lazy glob lets RED reach assertions before formatCatalogue.ts exists.
// Once implemented, the same call loads the real module under V8 coverage.
const catalogueModules = import.meta.glob<CatalogueModule>('./formatCatalogue.ts')

async function loadCatalogue(): Promise<CatalogueModule> {
    const load = catalogueModules['./formatCatalogue.ts']
    expect(load, 'src/domain/formatCatalogue.ts must exist').toBeTypeOf('function')
    if (load === undefined) {
        throw new Error('unreachable: formatCatalogue.ts is missing')
    }
    return load()
}

const BASE_KEYS = ['platform', 'name', 'width', 'height', 'aspectRatio']

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

const parseRatio = (ratio: string): [number, number] => {
    const match = /^(\d+):(\d+)$/.exec(ratio)
    expect(match).not.toBeNull()
    return [Number(match?.[1]), Number(match?.[2])]
}

describe('listFormats', () => {
    it('returns the six platform/name pairs in AD_FORMATS order', async () => {
        const {listFormats} = await loadCatalogue()
        const pairs = listFormats().map((spec) => [spec.platform, spec.name])
        expect(pairs).toEqual([
            ['google-pmax', 'landscape'],
            ['google-pmax', 'square'],
            ['google-pmax', 'portrait'],
            ['meta', 'square'],
            ['meta', 'feed'],
            ['meta', 'story'],
        ])
    })

    it('carries each AD_FORMATS width and height and the reduced aspect ratios in order', async () => {
        const {listFormats} = await loadCatalogue()
        const formats = listFormats()
        expect(formats.map((spec) => [spec.width, spec.height])).toEqual([
            [1200, 628],
            [1200, 1200],
            [960, 1200],
            [1080, 1080],
            [1080, 1350],
            [1080, 1920],
        ])
        expect(formats.map((spec) => [spec.width, spec.height])).toEqual(
            AD_FORMATS.map((format) => [format.width, format.height])
        )
        expect(formats.map((spec) => spec.aspectRatio)).toEqual(['300:157', '1:1', '4:5', '1:1', '4:5', '9:16'])
    })

    it('orders own keys as platform, name, width, height, aspectRatio, with a trailing safeZone only on meta story', async () => {
        const {listFormats} = await loadCatalogue()
        expect(listFormats().map((spec) => Object.keys(spec))).toEqual([
            BASE_KEYS,
            BASE_KEYS,
            BASE_KEYS,
            BASE_KEYS,
            BASE_KEYS,
            [...BASE_KEYS, 'safeZone'],
        ])
    })

    it('gives meta story the {top: 0.14, bottom: 0.2} safe zone and omits the key elsewhere', async () => {
        const {listFormats} = await loadCatalogue()
        const formats = listFormats()
        expect(formats[5]?.safeZone).toEqual({top: 0.14, bottom: 0.2})
        expect(formats.map((spec) => 'safeZone' in spec)).toEqual([false, false, false, false, false, true])
    })

    it('returns the full deep-equal specs', async () => {
        const {listFormats} = await loadCatalogue()
        expect(listFormats()).toEqual([
            {platform: 'google-pmax', name: 'landscape', width: 1200, height: 628, aspectRatio: '300:157'},
            {platform: 'google-pmax', name: 'square', width: 1200, height: 1200, aspectRatio: '1:1'},
            {platform: 'google-pmax', name: 'portrait', width: 960, height: 1200, aspectRatio: '4:5'},
            {platform: 'meta', name: 'square', width: 1080, height: 1080, aspectRatio: '1:1'},
            {platform: 'meta', name: 'feed', width: 1080, height: 1350, aspectRatio: '4:5'},
            {
                platform: 'meta',
                name: 'story',
                width: 1080,
                height: 1920,
                aspectRatio: '9:16',
                safeZone: {top: 0.14, bottom: 0.2},
            },
        ])
    })
})

describe('listFormats immutability', () => {
    it('returns values and safe zones that do not alias AD_FORMATS', async () => {
        const {listFormats} = await loadCatalogue()
        const formats = listFormats()
        expect(formats).toHaveLength(AD_FORMATS.length)
        formats.forEach((spec, index) => {
            expect(spec).not.toBe(AD_FORMATS[index])
        })
        expect(formats[5]?.safeZone).toEqual(AD_FORMATS[5]?.safeZone)
        expect(formats[5]?.safeZone).not.toBe(AD_FORMATS[5]?.safeZone)
    })

    it('leaves AD_FORMATS and the next result unchanged when a returned width and safeZone.top are mutated', async () => {
        const {listFormats} = await loadCatalogue()
        const snapshot = structuredClone(AD_FORMATS)
        const first = listFormats()
        const expectedNext = structuredClone(first)

        first.forEach((spec) => {
            spec.width = 1
        })
        const story = first[5]
        expect(story?.safeZone).toEqual({top: 0.14, bottom: 0.2})
        if (story?.safeZone !== undefined) {
            story.safeZone.top = 0.99
        }

        expect(AD_FORMATS).toEqual(snapshot)
        expect(AD_FORMATS[5]?.safeZone?.top).toBe(0.14)
        expect(AD_FORMATS[0]?.width).toBe(1200)
        const next = listFormats()
        expect(next).toEqual(expectedNext)
        expect(next[5]?.safeZone).toEqual({top: 0.14, bottom: 0.2})
        expect(next[0]?.width).toBe(1200)
    })

    it('returns deep-equal but distinct arrays across calls and leaves AD_FORMATS untouched', async () => {
        const {listFormats} = await loadCatalogue()
        const snapshot = structuredClone(AD_FORMATS)
        const first = listFormats()
        const second = listFormats()
        expect(second).toEqual(first)
        expect(second).not.toBe(first)
        second.forEach((spec, index) => {
            expect(spec).not.toBe(first[index])
        })
        expect(second[5]?.safeZone).not.toBe(first[5]?.safeZone)
        expect(AD_FORMATS).toEqual(snapshot)
    })
})

describe('reduceAspectRatio', () => {
    it('reduces 1200x628 to 300:157 and 1x1 to 1:1', async () => {
        const {reduceAspectRatio} = await loadCatalogue()
        expect(reduceAspectRatio(1200, 628)).toBe('300:157')
        expect(reduceAspectRatio(1, 1)).toBe('1:1')
    })

    it('reduces the other catalogue dimensions to their known ratios', async () => {
        const {reduceAspectRatio} = await loadCatalogue()
        expect(reduceAspectRatio(960, 1200)).toBe('4:5')
        expect(reduceAspectRatio(1080, 1920)).toBe('9:16')
        expect(reduceAspectRatio(1920, 1080)).toBe('16:9')
        expect(reduceAspectRatio(7, 3)).toBe('7:3')
    })

    it('returns coprime parts whose cross products match the input', async () => {
        const {reduceAspectRatio} = await loadCatalogue()
        fc.assert(
            fc.property(fc.integer({min: 1, max: 1_000_000}), fc.integer({min: 1, max: 1_000_000}), (w, h) => {
                const [a, b] = parseRatio(reduceAspectRatio(w, h))
                expect(a).toBeGreaterThan(0)
                expect(b).toBeGreaterThan(0)
                expect(gcd(a, b)).toBe(1)
                expect(a * h).toBe(b * w)
            })
        )
    })

    it('returns the same ratio when both sides are scaled by k in 1..1000', async () => {
        const {reduceAspectRatio} = await loadCatalogue()
        fc.assert(
            fc.property(
                fc.integer({min: 1, max: 1_000_000}),
                fc.integer({min: 1, max: 1_000_000}),
                fc.integer({min: 1, max: 1000}),
                (w, h, k) => {
                    expect(reduceAspectRatio(w * k, h * k)).toBe(reduceAspectRatio(w, h))
                }
            )
        )
    })

    it.each([0, -4, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        'throws RangeError for %s as the width',
        async (bad) => {
            const {reduceAspectRatio} = await loadCatalogue()
            expect(() => reduceAspectRatio(bad, 1080)).toThrow(RangeError)
        }
    )

    it.each([0, -4, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        'throws RangeError for %s as the height',
        async (bad) => {
            const {reduceAspectRatio} = await loadCatalogue()
            expect(() => reduceAspectRatio(1080, bad)).toThrow(RangeError)
        }
    )
})
