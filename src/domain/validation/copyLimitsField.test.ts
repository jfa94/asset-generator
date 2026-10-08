import fc from 'fast-check'
import {describe, expect, it} from 'vitest'

interface CopyLimitView {
    platform: string
    field: string
    min: number
    max: number
    maxChars: number
}

interface FieldCopyLimitsModule {
    COPY_LIMITS: readonly Readonly<CopyLimitView>[]
    listCopyLimits: (platform?: string, field?: string) => CopyLimitView[]
    UnknownCopyPlatformError: new (...args: never[]) => Error
    UnknownCopyFieldError: new (...args: never[]) => Error
}

declare global {
    interface ImportMeta {
        glob<T>(pattern: string): Record<string, () => Promise<T>>
    }
}

// A lazy glob lets RED reach assertions while UnknownCopyFieldError is not exported yet.
const copyLimitsModules = import.meta.glob<Partial<FieldCopyLimitsModule>>('./copyLimits.ts')

async function loadModule(): Promise<Omit<FieldCopyLimitsModule, 'UnknownCopyFieldError'>> {
    const load = copyLimitsModules['./copyLimits.ts']
    expect(load, 'src/domain/validation/copyLimits.ts must exist').toBeTypeOf('function')
    if (load === undefined) {
        throw new Error('unreachable: copyLimits.ts is missing')
    }
    const copyLimits = await load()
    expect(copyLimits.UnknownCopyPlatformError, 'copyLimits.ts must export UnknownCopyPlatformError').toBeTypeOf(
        'function'
    )
    return copyLimits as FieldCopyLimitsModule
}

async function loadFieldModule(): Promise<FieldCopyLimitsModule> {
    const copyLimits = (await loadModule()) as Partial<FieldCopyLimitsModule>
    expect(copyLimits.UnknownCopyFieldError, 'copyLimits.ts must export UnknownCopyFieldError').toBeTypeOf('function')
    return copyLimits as FieldCopyLimitsModule
}

function captureError(run: () => unknown): unknown {
    try {
        run()
    } catch (error) {
        return error
    }
    return undefined
}

const KEYS = ['platform', 'field', 'min', 'max', 'maxChars']

const D3: CopyLimitView[] = [
    {platform: 'rsa', field: 'headlines', min: 3, max: 15, maxChars: 30},
    {platform: 'rsa', field: 'descriptions', min: 2, max: 4, maxChars: 90},
    {platform: 'rsa', field: 'paths', min: 0, max: 2, maxChars: 15},
    {platform: 'pmax', field: 'shortHeadlines', min: 3, max: 15, maxChars: 30},
    {platform: 'pmax', field: 'longHeadlines', min: 1, max: 5, maxChars: 90},
    {platform: 'pmax', field: 'descriptions', min: 2, max: 5, maxChars: 90},
    {platform: 'pmax', field: 'businessName', min: 1, max: 1, maxChars: 25},
    {platform: 'meta', field: 'primaryTexts', min: 1, max: 5, maxChars: 125},
    {platform: 'meta', field: 'headlines', min: 1, max: 5, maxChars: 40},
    {platform: 'meta', field: 'descriptions', min: 1, max: 5, maxChars: 25},
]

function freshD3(): CopyLimitView[] {
    return D3.map((entry) => ({...entry}))
}

const RSA_HEADLINES: CopyLimitView = {platform: 'rsa', field: 'headlines', min: 3, max: 15, maxChars: 30}
const META_HEADLINES: CopyLimitView = {platform: 'meta', field: 'headlines', min: 1, max: 5, maxChars: 40}
const RSA_PATHS: CopyLimitView = {platform: 'rsa', field: 'paths', min: 0, max: 2, maxChars: 15}
const PMAX_DESCRIPTIONS: CopyLimitView = {platform: 'pmax', field: 'descriptions', min: 2, max: 5, maxChars: 90}

const ACCEPTED_FIELDS = [
    'headlines',
    'descriptions',
    'paths',
    'shortHeadlines',
    'longHeadlines',
    'businessName',
    'primaryTexts',
] as const

const FIELD_ACCEPTED_VALUES =
    'Accepted values: headlines, descriptions, paths, shortHeadlines, longHeadlines, businessName, primaryTexts.'

function unknownFieldMessage(value: string): string {
    return `Unknown field ${JSON.stringify(value)}. ${FIELD_ACCEPTED_VALUES}`
}

const PLATFORMS = [undefined, 'rsa', 'pmax', 'meta'] as const

describe('listCopyLimits field filter', () => {
    it('returns exactly the rsa and meta headlines entries for undefined platform and headlines', async () => {
        const {listCopyLimits} = await loadModule()
        const result = listCopyLimits(undefined, 'headlines')
        expect(result).toEqual([
            {platform: 'rsa', field: 'headlines', min: 3, max: 15, maxChars: 30},
            {platform: 'meta', field: 'headlines', min: 1, max: 5, maxChars: 40},
        ])
        expect(result.map((entry) => Object.keys(entry))).toEqual([KEYS, KEYS])
    })

    it.each<[string, CopyLimitView[]]>([
        ['headlines', [RSA_HEADLINES, META_HEADLINES]],
        [
            'descriptions',
            [
                {platform: 'rsa', field: 'descriptions', min: 2, max: 4, maxChars: 90},
                {platform: 'pmax', field: 'descriptions', min: 2, max: 5, maxChars: 90},
                {platform: 'meta', field: 'descriptions', min: 1, max: 5, maxChars: 25},
            ],
        ],
        ['paths', [RSA_PATHS]],
        ['shortHeadlines', [{platform: 'pmax', field: 'shortHeadlines', min: 3, max: 15, maxChars: 30}]],
        ['longHeadlines', [{platform: 'pmax', field: 'longHeadlines', min: 1, max: 5, maxChars: 90}]],
        ['businessName', [{platform: 'pmax', field: 'businessName', min: 1, max: 1, maxChars: 25}]],
        ['primaryTexts', [{platform: 'meta', field: 'primaryTexts', min: 1, max: 5, maxChars: 125}]],
    ])('returns the exact catalogue-ordered entries for field %s', async (field, expected) => {
        const {listCopyLimits} = await loadModule()
        const result = listCopyLimits(undefined, field)
        expect(result).toEqual(expected)
        expect(result.map((entry) => Object.keys(entry))).toEqual(expected.map(() => KEYS))
    })

    it.each<[string, string, CopyLimitView[]]>([
        ['pmax', 'descriptions', [PMAX_DESCRIPTIONS]],
        ['meta', 'headlines', [META_HEADLINES]],
        ['rsa', 'paths', [RSA_PATHS]],
    ])('intersects platform %s with field %s', async (platform, field, expected) => {
        const {listCopyLimits} = await loadModule()
        expect(listCopyLimits(platform, field)).toEqual(expected)
    })

    it.each([
        ['meta', 'paths'],
        ['rsa', 'businessName'],
        ['pmax', 'headlines'],
        ['meta', 'shortHeadlines'],
    ])('returns [] without throwing for platform %s with known field %s', async (platform, field) => {
        const {listCopyLimits} = await loadModule()
        const error = captureError(() => listCopyLimits(platform, field))
        expect(error).toBeUndefined()
        expect(listCopyLimits(platform, field)).toEqual([])
    })
})

describe('UnknownCopyFieldError', () => {
    const unknownFields = [
        'Headlines',
        'HEADLINES',
        'headline',
        '',
        ' headlines',
        'headlines ',
        'rsa',
        'tiktok',
        '__proto__',
        'constructor',
    ]
    const cases = unknownFields.flatMap((value) => [[undefined, value] as const, ['meta', value] as const])

    it.each(cases)('rejects platform %j with field %j', async (platform, value) => {
        const {listCopyLimits, UnknownCopyFieldError, UnknownCopyPlatformError} = await loadFieldModule()
        const error = captureError(() => listCopyLimits(platform, value))
        expect(error).toBeInstanceOf(UnknownCopyFieldError)
        expect(error).toBeInstanceOf(Error)
        expect(error).not.toBeInstanceOf(UnknownCopyPlatformError)
        expect((error as Error).name).toBe('UnknownCopyFieldError')
        expect((error as Error).message).toBe(unknownFieldMessage(value))
    })

    it('pins the exact message for Headlines', async () => {
        const {listCopyLimits, UnknownCopyFieldError} = await loadFieldModule()
        const error = captureError(() => listCopyLimits(undefined, 'Headlines'))
        expect(error).toBeInstanceOf(UnknownCopyFieldError)
        expect((error as Error).message).toBe(
            'Unknown field "Headlines". Accepted values: headlines, descriptions, paths, shortHeadlines, longHeadlines, businessName, primaryTexts.'
        )
    })

    it('rejects every other string, including ones with line feeds and carriage returns, with a single-line message', async () => {
        const {listCopyLimits, UnknownCopyFieldError} = await loadFieldModule()
        const accepted = new Set<string>(ACCEPTED_FIELDS)
        const rejectedField = fc
            .oneof(
                fc.string(),
                fc.string({unit: 'binary'}),
                fc
                    .tuple(fc.string(), fc.constantFrom('\n', '\r', '\r\n'), fc.string())
                    .map(([a, eol, b]) => a + eol + b),
                fc.constantFrom('headlines\n', '\rpaths', 'toString', 'hasOwnProperty', 'valueOf', 'Paths')
            )
            .filter((value) => !accepted.has(value))
        fc.assert(
            fc.property(rejectedField, (value) => {
                const error = captureError(() => listCopyLimits(undefined, value))
                expect(error).toBeInstanceOf(UnknownCopyFieldError)
                const message = (error as Error).message
                expect(message).not.toMatch(/[\n\r]/)
                expect(message).toBe(unknownFieldMessage(value))
            })
        )
    })
})

describe('listCopyLimits filter precedence', () => {
    it.each(['bogus', 'headlines'])('throws UnknownCopyPlatformError for tiktok with field %j', async (field) => {
        const {listCopyLimits, UnknownCopyPlatformError, UnknownCopyFieldError} = await loadFieldModule()
        const error = captureError(() => listCopyLimits('tiktok', field))
        expect(error).toBeInstanceOf(UnknownCopyPlatformError)
        expect(error).not.toBeInstanceOf(UnknownCopyFieldError)
        expect((error as Error).message).toBe('Unknown platform "tiktok". Accepted values: rsa, pmax, meta.')
    })

    it('throws UnknownCopyFieldError for a known platform with an unknown field', async () => {
        const {listCopyLimits, UnknownCopyFieldError} = await loadFieldModule()
        const error = captureError(() => listCopyLimits('meta', 'Headlines'))
        expect(error).toBeInstanceOf(UnknownCopyFieldError)
        expect((error as Error).message).toBe(unknownFieldMessage('Headlines'))
    })
})

describe('listCopyLimits without a field', () => {
    it.each<[string | undefined, CopyLimitView[]]>([
        [undefined, D3],
        ['rsa', D3.slice(0, 3)],
        ['pmax', D3.slice(3, 7)],
        ['meta', D3.slice(7)],
    ])(
        'returns the base entries for platform %j with and without an explicit undefined field',
        async (platform, expected) => {
            const {listCopyLimits} = await loadModule()
            const withoutField = listCopyLimits(platform)
            const withUndefined = listCopyLimits(platform, undefined)
            expect(withoutField).toEqual(expected)
            expect(withUndefined).toEqual(expected)
            expect(withUndefined).toEqual(withoutField)
            expect(withUndefined.map((entry) => Object.keys(entry))).toEqual(expected.map(() => KEYS))
        }
    )

    it('returns the full base list for a call with no arguments', async () => {
        const {listCopyLimits} = await loadModule()
        const result = listCopyLimits()
        expect(result).toEqual(freshD3())
        expect(result.map((entry) => Object.keys(entry))).toEqual(D3.map(() => KEYS))
    })

    it('throws the unchanged UnknownCopyPlatformError for tiktok with an undefined field', async () => {
        const {listCopyLimits, UnknownCopyPlatformError} = await loadModule()
        const error = captureError(() => listCopyLimits('tiktok', undefined))
        expect(error).toBeInstanceOf(UnknownCopyPlatformError)
        expect((error as Error).name).toBe('UnknownCopyPlatformError')
        expect((error as Error).message).toBe('Unknown platform "tiktok". Accepted values: rsa, pmax, meta.')
    })
})

describe('listCopyLimits field filter freshness', () => {
    it('returns filtered entries that are not COPY_LIMITS entries', async () => {
        const {COPY_LIMITS, listCopyLimits} = await loadModule()
        const catalogueEntries = new Set<object>(COPY_LIMITS)
        for (const platform of PLATFORMS) {
            for (const field of ACCEPTED_FIELDS) {
                const result = listCopyLimits(platform, field)
                expect(result.map((entry) => catalogueEntries.has(entry))).toEqual(result.map(() => false))
            }
        }
        expect(listCopyLimits(undefined, 'descriptions')).toHaveLength(3)
    })

    it('leaves COPY_LIMITS and the next headlines result unchanged when a filtered result is mutated', async () => {
        const {COPY_LIMITS, listCopyLimits} = await loadModule()
        const result = listCopyLimits(undefined, 'headlines')
        expect(result).toHaveLength(2)
        for (const entry of result) {
            entry.min = -1
            entry.max = -1
            entry.maxChars = -1
        }
        result.push({platform: 'tiktok', field: 'headlines', min: 1, max: 1, maxChars: 1})
        expect(COPY_LIMITS).toEqual(freshD3())
        expect(listCopyLimits(undefined, 'headlines')).toEqual([RSA_HEADLINES, META_HEADLINES])
    })
})

describe('listCopyLimits field filter properties', () => {
    it('equals the platform-only result filtered by field for every platform and accepted field', async () => {
        const {listCopyLimits} = await loadModule()
        fc.assert(
            fc.property(fc.constantFrom(...PLATFORMS), fc.constantFrom(...ACCEPTED_FIELDS), (platform, field) => {
                expect(listCopyLimits(platform, field)).toEqual(
                    listCopyLimits(platform).filter((entry) => entry.field === field)
                )
            })
        )
    })
})
