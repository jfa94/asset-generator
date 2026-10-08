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

interface AspectCatalogueModule {
    listFormats: (platform?: string, aspectRatio?: string) => FormatSpecView[]
    reduceAspectRatio: (width: number, height: number) => string
    UnknownPlatformError: new (...args: never[]) => Error
    InvalidAspectRatioError: new (...args: never[]) => Error
}

declare global {
    interface ImportMeta {
        glob<T>(pattern: string): Record<string, () => Promise<T>>
    }
}

// A lazy glob loads the module so RED fails on assertions, not on a missing export.
const catalogueModules = import.meta.glob<Partial<AspectCatalogueModule>>('./formatCatalogue.ts')

async function loadModule(): Promise<Partial<AspectCatalogueModule>> {
    const load = catalogueModules['./formatCatalogue.ts']
    expect(load, 'src/domain/formatCatalogue.ts must exist').toBeTypeOf('function')
    if (load === undefined) {
        throw new Error('unreachable: formatCatalogue.ts is missing')
    }
    return load()
}

type ListingModule = Pick<AspectCatalogueModule, 'listFormats' | 'reduceAspectRatio'>

// Listing tests need only the functions, so RED reaches their behavior assertions.
async function loadListing(): Promise<ListingModule> {
    const catalogue = await loadModule()
    expect(catalogue.listFormats, 'formatCatalogue.ts must export listFormats').toBeTypeOf('function')
    expect(catalogue.reduceAspectRatio, 'formatCatalogue.ts must export reduceAspectRatio').toBeTypeOf('function')
    return catalogue as ListingModule
}

async function loadCatalogue(): Promise<AspectCatalogueModule> {
    const catalogue: Partial<AspectCatalogueModule> = await loadListing()
    expect(catalogue.UnknownPlatformError, 'formatCatalogue.ts must export UnknownPlatformError').toBeTypeOf('function')
    expect(catalogue.InvalidAspectRatioError, 'formatCatalogue.ts must export InvalidAspectRatioError').toBeTypeOf(
        'function'
    )
    return catalogue as AspectCatalogueModule
}

function captureError(run: () => unknown): unknown {
    try {
        run()
    } catch (error) {
        return error
    }
    return undefined
}

const invalidMessage = (value: string): string =>
    `Invalid aspect ratio ${JSON.stringify(value)}. Expected W:H with positive integers, for example 9:16.`

function expectInvalidAspect(catalogue: AspectCatalogueModule, value: string, platform?: string): void {
    const error = captureError(() => catalogue.listFormats(platform, value))
    expect(error, `listFormats(${String(platform)}, ${JSON.stringify(value)}) must throw`).toBeInstanceOf(
        catalogue.InvalidAspectRatioError
    )
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(RangeError)
    expect((error as Error).name).toBe('InvalidAspectRatioError')
    expect((error as Error).message).toBe(invalidMessage(value))
}

const BASE_KEYS = ['platform', 'name', 'width', 'height', 'aspectRatio']

const PMAX_LANDSCAPE = {platform: 'google-pmax', name: 'landscape', width: 1200, height: 628, aspectRatio: '300:157'}
const PMAX_SQUARE = {platform: 'google-pmax', name: 'square', width: 1200, height: 1200, aspectRatio: '1:1'}
const PMAX_PORTRAIT = {platform: 'google-pmax', name: 'portrait', width: 960, height: 1200, aspectRatio: '4:5'}
const META_SQUARE = {platform: 'meta', name: 'square', width: 1080, height: 1080, aspectRatio: '1:1'}
const META_FEED = {platform: 'meta', name: 'feed', width: 1080, height: 1350, aspectRatio: '4:5'}
const META_STORY = {
    platform: 'meta',
    name: 'story',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    safeZone: {top: 0.14, bottom: 0.2},
}

const ALL_SPECS = [PMAX_LANDSCAPE, PMAX_SQUARE, PMAX_PORTRAIT, META_SQUARE, META_FEED, META_STORY]
const ALL_KEYS = [BASE_KEYS, BASE_KEYS, BASE_KEYS, BASE_KEYS, BASE_KEYS, [...BASE_KEYS, 'safeZone']]

const UNKNOWN_TIKTOK = 'Unknown platform "tiktok". Accepted values: google-pmax, meta.'

describe('listFormats aspect-ratio filter: matching', () => {
    it('returns exactly google-pmax square then meta square for 2:2', async () => {
        const {listFormats} = await loadListing()
        expect(listFormats(undefined, '2:2')).toEqual([
            {platform: 'google-pmax', name: 'square', width: 1200, height: 1200, aspectRatio: '1:1'},
            {platform: 'meta', name: 'square', width: 1080, height: 1080, aspectRatio: '1:1'},
        ])
    })

    it.each(['1:1', '1080:1080', '01:01'])('returns the same two square specs for %j as for 2:2', async (ratio) => {
        const {listFormats} = await loadListing()
        expect(listFormats(undefined, ratio)).toEqual([PMAX_SQUARE, META_SQUARE])
        expect(listFormats(undefined, ratio)).toEqual(listFormats(undefined, '2:2'))
    })

    it('returns google-pmax portrait then meta feed for 4:5', async () => {
        const {listFormats} = await loadListing()
        expect(listFormats(undefined, '4:5')).toEqual([PMAX_PORTRAIT, META_FEED])
    })

    it.each(['9:16', '1080:1920', '09:16'])('returns only meta story with its safe zone for %j', async (ratio) => {
        const {listFormats} = await loadListing()
        const result = listFormats(undefined, ratio)
        expect(result).toEqual([META_STORY])
        expect(result[0]?.safeZone).toEqual({top: 0.14, bottom: 0.2})
        expect(result.map((spec) => Object.keys(spec))).toEqual([[...BASE_KEYS, 'safeZone']])
    })

    it('returns the same value for 09:16 as for 9:16', async () => {
        const {listFormats} = await loadListing()
        expect(listFormats(undefined, '09:16')).toEqual(listFormats(undefined, '9:16'))
        expect(listFormats(undefined, '09:16')).toHaveLength(1)
    })

    it.each(['300:157', '600:314', '1200:628'])('returns only google-pmax landscape for %j', async (ratio) => {
        const {listFormats} = await loadListing()
        const result = listFormats(undefined, ratio)
        expect(result).toEqual([PMAX_LANDSCAPE])
        expect(result.map((spec) => Object.keys(spec))).toEqual([BASE_KEYS])
    })
})

describe('listFormats aspect-ratio filter: combined with the platform filter', () => {
    it('returns only meta story for meta with 9:16', async () => {
        const {listFormats} = await loadListing()
        expect(listFormats('meta', '9:16')).toEqual([META_STORY])
    })

    it('returns only meta square for meta with 1:1', async () => {
        const {listFormats} = await loadListing()
        expect(listFormats('meta', '1:1')).toEqual([META_SQUARE])
    })

    it('returns only google-pmax square for google-pmax with 1:1', async () => {
        const {listFormats} = await loadListing()
        expect(listFormats('google-pmax', '1:1')).toEqual([PMAX_SQUARE])
    })

    it('returns [] for google-pmax with 9:16', async () => {
        const {listFormats} = await loadListing()
        expect(listFormats('google-pmax', '9:16')).toEqual([])
    })

    it('returns google-pmax portrait only for google-pmax with 4:5 and meta feed only for meta with 4:5', async () => {
        const {listFormats} = await loadListing()
        expect(listFormats('google-pmax', '4:5')).toEqual([PMAX_PORTRAIT])
        expect(listFormats('meta', '4:5')).toEqual([META_FEED])
    })
})

describe('listFormats aspect-ratio filter: valid ratios no format uses', () => {
    it.each(['16:9', '1:2', '5:4', '9007199254740991:1', '1:9007199254740991', '157:300'])(
        'returns [] for %j without throwing',
        async (ratio) => {
            const {listFormats} = await loadListing()
            const error = captureError(() => listFormats(undefined, ratio))
            expect(error).toBeUndefined()
            expect(listFormats(undefined, ratio)).toEqual([])
        }
    )
})

const MALFORMED = [
    // missing colon
    '',
    '916',
    '9-16',
    '9/16',
    // zero
    '0:1',
    '1:0',
    '0:0',
    '00:16',
    // negative
    '-9:16',
    '9:-16',
    // non-integer
    '1.5:1',
    '1.91:1',
    '9:16.0',
    '1e1:1',
    'a:b',
    '+9:16',
    ' 9:16',
    '9:16 ',
    '٩:١٦',
    // extra parts
    '9:16:1',
    '1:1:',
    // empty sides
    ':16',
    '9:',
    ':',
]

describe('listFormats aspect-ratio filter: malformed ratios', () => {
    it.each(MALFORMED)('throws InvalidAspectRatioError with the exact message for %j', async (value) => {
        const catalogue = await loadCatalogue()
        expectInvalidAspect(catalogue, value)
    })

    it.each(['9007199254740992:1', '1:9007199254740992', '99999999999999999999:1'])(
        'throws InvalidAspectRatioError, not RangeError, for the unsafe side in %j',
        async (value) => {
            const catalogue = await loadCatalogue()
            expectInvalidAspect(catalogue, value)
        }
    )

    it('rejects malformed values for an explicit valid platform too', async () => {
        const catalogue = await loadCatalogue()
        expectInvalidAspect(catalogue, '9-16', 'meta')
        expectInvalidAspect(catalogue, '0:1', 'google-pmax')
        expectInvalidAspect(catalogue, '9007199254740992:1', 'meta')
    })

    it('builds an error whose name and prototype chain are InvalidAspectRatioError and Error', async () => {
        const {listFormats, InvalidAspectRatioError} = await loadCatalogue()
        const error = captureError(() => listFormats(undefined, '9-16'))
        expect(error).toBeInstanceOf(InvalidAspectRatioError)
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).name).toBe('InvalidAspectRatioError')
        expect((error as Error).message).toBe(
            'Invalid aspect ratio "9-16". Expected W:H with positive integers, for example 9:16.'
        )
    })
})

// Spec decision 2: ASCII digits, one colon, ASCII digits; each side a safe integer >= 1.
const isAcceptedRatio = (value: string): boolean => {
    const match = /^(\d+):(\d+)$/.exec(value)
    if (match === null) {
        return false
    }
    return [match[1], match[2]].every((side) => {
        const parsed = Number(side)
        return Number.isSafeInteger(parsed) && parsed >= 1
    })
}

const lineBreak = fc.constantFrom('\n', '\r', '\r\n')
const digits = fc.integer({min: 1, max: 100_000}).map(String)

const malformedRatio = fc
    .oneof(
        fc.string(),
        fc.string({unit: 'binary'}),
        fc.tuple(fc.string(), lineBreak, fc.string()).map(([a, eol, b]) => a + eol + b),
        fc.tuple(digits, digits, lineBreak).map(([w, h, eol]) => `${w}:${h}${eol}`),
        fc.tuple(digits, digits, lineBreak).map(([w, h, eol]) => `${eol}${w}:${h}`),
        fc.tuple(digits, digits, lineBreak).map(([w, h, eol]) => `${w}${eol}:${h}`),
        fc.tuple(fc.integer({min: 1, max: 5}), digits).map(([zeros, h]) => `${'0'.repeat(zeros)}:${h}`),
        fc.tuple(digits, fc.integer({min: 1, max: 5})).map(([w, zeros]) => `${w}:${'0'.repeat(zeros)}`),
        fc.tuple(fc.bigInt({min: 1n, max: 10n ** 30n}), digits, fc.boolean()).map(([extra, side, first]) => {
            const unsafe = (BigInt(Number.MAX_SAFE_INTEGER) + extra).toString()
            return first ? `${unsafe}:${side}` : `${side}:${unsafe}`
        }),
        fc.tuple(digits, digits, digits).map(([a, b, c]) => `${a}:${b}:${c}`)
    )
    .filter((value) => !isAcceptedRatio(value))

describe('listFormats aspect-ratio filter: property over malformed strings', () => {
    it('throws InvalidAspectRatioError with the exact single-line message for every string outside the grammar', async () => {
        const catalogue = await loadCatalogue()
        fc.assert(
            fc.property(malformedRatio, (value) => {
                const error = captureError(() => catalogue.listFormats(undefined, value))
                expect(error).toBeInstanceOf(catalogue.InvalidAspectRatioError)
                expect(error).not.toBeInstanceOf(RangeError)
                const message = (error as Error).message
                expect(message).not.toMatch(/[\n\r]/)
                expect(message).toBe(invalidMessage(value))
            })
        )
    })
})

describe('listFormats aspect-ratio filter: platform precedence', () => {
    it('throws UnknownPlatformError, not InvalidAspectRatioError, for tiktok with 9-16', async () => {
        const {listFormats, UnknownPlatformError, InvalidAspectRatioError} = await loadCatalogue()
        const error = captureError(() => listFormats('tiktok', '9-16'))
        expect(error).toBeInstanceOf(UnknownPlatformError)
        expect(error).not.toBeInstanceOf(InvalidAspectRatioError)
        expect((error as Error).name).toBe('UnknownPlatformError')
        expect((error as Error).message).toBe(UNKNOWN_TIKTOK)
    })

    it('throws UnknownPlatformError for tiktok with a valid ratio', async () => {
        const {listFormats, UnknownPlatformError} = await loadCatalogue()
        const error = captureError(() => listFormats('tiktok', '9:16'))
        expect(error).toBeInstanceOf(UnknownPlatformError)
        expect((error as Error).message).toBe(UNKNOWN_TIKTOK)
    })

    it('throws InvalidAspectRatioError for meta with 9-16', async () => {
        const catalogue = await loadCatalogue()
        const error = captureError(() => catalogue.listFormats('meta', '9-16'))
        expect(error).toBeInstanceOf(catalogue.InvalidAspectRatioError)
        expect(error).not.toBeInstanceOf(catalogue.UnknownPlatformError)
        expect((error as Error).message).toBe(invalidMessage('9-16'))
    })
})

describe('listFormats without an aspect ratio keeps base behavior', () => {
    it('returns the pinned base specs and key order for listFormats() and listFormats(undefined)', async () => {
        const {listFormats} = await loadModule()
        expect(listFormats?.()).toEqual(ALL_SPECS)
        expect(listFormats?.().map((spec) => Object.keys(spec))).toEqual(ALL_KEYS)
        expect(listFormats?.(undefined)).toEqual(ALL_SPECS)
        expect(listFormats?.(undefined).map((spec) => Object.keys(spec))).toEqual(ALL_KEYS)
    })

    it('returns the pinned platform specs and key order for google-pmax and meta', async () => {
        const {listFormats} = await loadModule()
        expect(listFormats?.('google-pmax')).toEqual([PMAX_LANDSCAPE, PMAX_SQUARE, PMAX_PORTRAIT])
        expect(listFormats?.('google-pmax').map((spec) => Object.keys(spec))).toEqual([BASE_KEYS, BASE_KEYS, BASE_KEYS])
        expect(listFormats?.('meta')).toEqual([META_SQUARE, META_FEED, META_STORY])
        expect(listFormats?.('meta').map((spec) => Object.keys(spec))).toEqual([
            BASE_KEYS,
            BASE_KEYS,
            [...BASE_KEYS, 'safeZone'],
        ])
    })

    it.each([undefined, 'google-pmax', 'meta'])('treats an explicit undefined ratio as no filter for %j', async (p) => {
        const {listFormats} = await loadModule()
        const withUndefined = listFormats?.(p, undefined)
        expect(withUndefined).toEqual(listFormats?.(p))
        expect(withUndefined?.map((spec) => Object.keys(spec))).toEqual(listFormats?.(p).map((s) => Object.keys(s)))
        expect(withUndefined).toHaveLength(p === undefined ? 6 : 3)
    })

    it('throws the unchanged UnknownPlatformError for tiktok with an undefined ratio', async () => {
        const {listFormats, UnknownPlatformError} = await loadModule()
        expect(UnknownPlatformError).toBeTypeOf('function')
        const error = captureError(() => listFormats?.('tiktok', undefined))
        expect(error).toBeInstanceOf(UnknownPlatformError as new (...args: never[]) => Error)
        expect((error as Error).name).toBe('UnknownPlatformError')
        expect((error as Error).message).toBe(UNKNOWN_TIKTOK)
    })
})

describe('listFormats aspect-ratio filter: fresh results', () => {
    it('returns specs and safe zones that do not alias AD_FORMATS', async () => {
        const {listFormats} = await loadListing()
        const story = listFormats(undefined, '9:16')
        expect(story).toEqual([META_STORY])
        expect(story[0]).not.toBe(AD_FORMATS[5])
        expect(story[0]?.safeZone).toEqual(AD_FORMATS[5]?.safeZone)
        expect(story[0]?.safeZone).not.toBe(AD_FORMATS[5]?.safeZone)

        const squares = listFormats(undefined, '1:1')
        expect(squares).toEqual([PMAX_SQUARE, META_SQUARE])
        expect(squares[0]).not.toBe(AD_FORMATS[1])
        expect(squares[1]).not.toBe(AD_FORMATS[3])

        const metaStory = listFormats('meta', '9:16')
        expect(metaStory).toEqual([META_STORY])
        expect(metaStory[0]).not.toBe(AD_FORMATS[5])
        expect(metaStory[0]?.safeZone).not.toBe(AD_FORMATS[5]?.safeZone)
    })

    it('leaves AD_FORMATS and the next 9:16 result unchanged when a filtered result is mutated', async () => {
        const {listFormats} = await loadListing()
        const snapshot = structuredClone(AD_FORMATS)
        const first = listFormats(undefined, '9:16')
        expect(first).toEqual([META_STORY])

        const story = first[0]
        if (story !== undefined) {
            story.width = 1
            story.aspectRatio = '1:1'
            if (story.safeZone !== undefined) {
                story.safeZone.top = 0.99
            }
        }

        expect(AD_FORMATS).toEqual(snapshot)
        expect(AD_FORMATS[5]?.width).toBe(1080)
        expect(AD_FORMATS[5]?.safeZone?.top).toBe(0.14)
        expect(listFormats(undefined, '9:16')).toEqual([META_STORY])
        expect(listFormats(undefined, '1:1')).toEqual([PMAX_SQUARE, META_SQUARE])
    })

    it('returns distinct arrays and objects across equal calls', async () => {
        const {listFormats} = await loadListing()
        const first = listFormats(undefined, '1:1')
        const second = listFormats(undefined, '1:1')
        expect(first).toEqual([PMAX_SQUARE, META_SQUARE])
        expect(second).toEqual(first)
        expect(second).not.toBe(first)
        second.forEach((spec, index) => {
            expect(spec).not.toBe(first[index])
        })
    })
})

const ratioOf = (w: number, h: number): string => `${String(w)}:${String(h)}`

describe('listFormats aspect-ratio filter: properties', () => {
    const side = fc.integer({min: 1, max: 2000})
    const factor = fc.integer({min: 1, max: 500})
    const platform = fc.constantFrom(undefined, 'google-pmax', 'meta')

    it('returns the same result when both sides are scaled by k', async () => {
        const {listFormats} = await loadListing()
        fc.assert(
            fc.property(side, side, factor, (w, h, k) => {
                expect(listFormats(undefined, ratioOf(w * k, h * k))).toEqual(listFormats(undefined, ratioOf(w, h)))
            })
        )
    })

    it('equals the platform listing filtered by the reduced ratio for every platform filter', async () => {
        const {listFormats, reduceAspectRatio} = await loadListing()
        fc.assert(
            fc.property(platform, side, side, (p, w, h) => {
                const expected = listFormats(p).filter((spec) => spec.aspectRatio === reduceAspectRatio(w, h))
                expect(listFormats(p, ratioOf(w, h))).toEqual(expected)
            })
        )
    })

    it('equals the reduced-ratio filter for scaled catalogue ratios, so matches are actually exercised', async () => {
        const {listFormats, reduceAspectRatio} = await loadListing()
        const catalogueRatio = fc.constantFrom<[number, number]>([300, 157], [1, 1], [4, 5], [9, 16], [16, 9])
        fc.assert(
            fc.property(platform, catalogueRatio, factor, (p, [w, h], k) => {
                const expected = listFormats(p).filter((spec) => spec.aspectRatio === reduceAspectRatio(w, h))
                expect(listFormats(p, ratioOf(w * k, h * k))).toEqual(expected)
                expect(listFormats(p, ratioOf(w * k, h * k)).every((spec) => spec.aspectRatio === ratioOf(w, h))).toBe(
                    true
                )
            })
        )
    })
})
