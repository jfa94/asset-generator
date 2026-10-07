import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {CopyLimit} from '@/domain/validation/copyLimits'
import type {MetaCopy, PmaxCopy, RsaCopy} from '@/types/copy'

// copy.ts is only ever imported dynamically here so each test sees its own COPY_LIMITS substitution.

const CATALOGUE = '@/domain/validation/copyLimits'

interface Issue {
    field: string
    message: string
}

// D3 platform/field pairs; entry i carries min 10 + i, max 20 + i, maxChars 2 + i.
const SUBSTITUTED: CopyLimit[] = [
    {platform: 'rsa', field: 'headlines', min: 10, max: 20, maxChars: 2},
    {platform: 'rsa', field: 'descriptions', min: 11, max: 21, maxChars: 3},
    {platform: 'rsa', field: 'paths', min: 12, max: 22, maxChars: 4},
    {platform: 'pmax', field: 'shortHeadlines', min: 13, max: 23, maxChars: 5},
    {platform: 'pmax', field: 'longHeadlines', min: 14, max: 24, maxChars: 6},
    {platform: 'pmax', field: 'descriptions', min: 15, max: 25, maxChars: 7},
    {platform: 'pmax', field: 'businessName', min: 16, max: 26, maxChars: 8},
    {platform: 'meta', field: 'primaryTexts', min: 17, max: 27, maxChars: 9},
    {platform: 'meta', field: 'headlines', min: 18, max: 28, maxChars: 10},
    {platform: 'meta', field: 'descriptions', min: 19, max: 29, maxChars: 11},
]

const X30 = 'x'.repeat(30)

const rsaFixture = (): RsaCopy => ({headlines: [X30], descriptions: [X30], paths: [X30]})
const pmaxFixture = (): PmaxCopy => ({
    shortHeadlines: [X30],
    longHeadlines: [X30],
    descriptions: [X30],
    businessName: X30,
})
const metaFixture = (): MetaCopy => ({primaryTexts: [X30], headlines: [X30], descriptions: [X30]})

const RSA_SUBSTITUTED_ISSUES: Issue[] = [
    {field: 'headlines', message: 'needs 10-20 entries, got 1'},
    {field: 'headlines[0]', message: `exceeds 2 chars (30): "${X30}"`},
    {field: 'descriptions', message: 'needs 11-21 entries, got 1'},
    {field: 'descriptions[0]', message: `exceeds 3 chars (30): "${X30}"`},
    {field: 'paths', message: 'needs 12-22 entries, got 1'},
    {field: 'paths[0]', message: `exceeds 4 chars (30): "${X30}"`},
]

const PMAX_SUBSTITUTED_ISSUES: Issue[] = [
    {field: 'shortHeadlines', message: 'needs 13-23 entries, got 1'},
    {field: 'shortHeadlines[0]', message: `exceeds 5 chars (30): "${X30}"`},
    {field: 'longHeadlines', message: 'needs 14-24 entries, got 1'},
    {field: 'longHeadlines[0]', message: `exceeds 6 chars (30): "${X30}"`},
    {field: 'descriptions', message: 'needs 15-25 entries, got 1'},
    {field: 'descriptions[0]', message: `exceeds 7 chars (30): "${X30}"`},
    {field: 'businessName', message: 'needs 16-26 entries, got 1'},
    {field: 'businessName[0]', message: `exceeds 8 chars (30): "${X30}"`},
]

const META_SUBSTITUTED_ISSUES: Issue[] = [
    {field: 'primaryTexts', message: 'needs 17-27 entries, got 1'},
    {field: 'primaryTexts[0]', message: `exceeds 9 chars (30): "${X30}"`},
    {field: 'headlines', message: 'needs 18-28 entries, got 1'},
    {field: 'headlines[0]', message: `exceeds 10 chars (30): "${X30}"`},
    {field: 'descriptions', message: 'needs 19-29 entries, got 1'},
    {field: 'descriptions[0]', message: `exceeds 11 chars (30): "${X30}"`},
]

function substituteCatalogue(build: (actual: readonly Readonly<CopyLimit>[]) => readonly CopyLimit[]): void {
    vi.doMock(CATALOGUE, async (importOriginal) => {
        const actual = await importOriginal<{COPY_LIMITS: readonly Readonly<CopyLimit>[]}>()
        return {...actual, COPY_LIMITS: Object.freeze(build(actual.COPY_LIMITS).map((e) => Object.freeze({...e})))}
    })
}

async function loadCopy() {
    return import('@/domain/validation/copy')
}

type CopyModule = Awaited<ReturnType<typeof loadCopy>>

beforeEach(() => {
    vi.resetModules()
})

afterEach(() => {
    vi.doUnmock(CATALOGUE)
    vi.resetModules()
})

describe('validators read limits from a substituted COPY_LIMITS [cl-003:AC1]', () => {
    beforeEach(() => {
        substituteCatalogue(() => SUBSTITUTED)
    })

    it('validateRsa reports each field count and exceeds issue from its substituted entry in D3 order', async () => {
        const {validateRsa} = await loadCopy()
        expect(validateRsa(rsaFixture())).toEqual(RSA_SUBSTITUTED_ISSUES)
    })

    it('validatePmax reports each field, including businessName, from its substituted entry in D3 order', async () => {
        const {validatePmax} = await loadCopy()
        expect(validatePmax(pmaxFixture())).toEqual(PMAX_SUBSTITUTED_ISSUES)
    })

    it('validateMeta reports primaryTexts, headlines and descriptions from their substituted entries', async () => {
        const {validateMeta} = await loadCopy()
        expect(validateMeta(metaFixture())).toEqual(META_SUBSTITUTED_ISSUES)
    })
})

describe('validateCopy under the substitution [cl-003:AC2]', () => {
    beforeEach(() => {
        substituteCatalogue(() => SUBSTITUTED)
    })

    it.each([
        {platform: 'rsa', copy: rsaFixture(), issues: RSA_SUBSTITUTED_ISSUES},
        {platform: 'pmax', copy: pmaxFixture(), issues: PMAX_SUBSTITUTED_ISSUES},
        {platform: 'meta', copy: metaFixture(), issues: META_SUBSTITUTED_ISSUES},
    ])(
        '$platform returns {platform, valid: false, issues} with the substituted issues',
        async ({platform, copy, issues}) => {
            const {validateCopy} = await loadCopy()
            expect(validateCopy({platform, copy})).toEqual({platform, valid: false, issues})
        }
    )
})

const VALID_RSA: RsaCopy = {
    headlines: ['Headline one', 'Headline two', 'Headline three'],
    descriptions: ['Description one', 'Description two'],
    paths: ['Path one'],
}
const VALID_PMAX: PmaxCopy = {
    shortHeadlines: ['Short one', 'Short two', 'Short three'],
    longHeadlines: ['Long headline one'],
    descriptions: ['Description one', 'Description two'],
    businessName: 'GoodbyeSpy',
}
const VALID_META: MetaCopy = {
    primaryTexts: ['Primary text one'],
    headlines: ['Headline one'],
    descriptions: ['Description one'],
}

function runValid(copy: CopyModule, platform: string): unknown {
    if (platform === 'rsa') {
        return copy.validateRsa(structuredClone(VALID_RSA))
    }
    if (platform === 'pmax') {
        return copy.validatePmax(structuredClone(VALID_PMAX))
    }
    return copy.validateMeta(structuredClone(VALID_META))
}

describe('a missing catalogue entry is a programming fault [cl-003:AC3]', () => {
    it('the valid fixtures pass against the real catalogue', async () => {
        const copy = await loadCopy()
        expect(runValid(copy, 'rsa')).toEqual([])
        expect(runValid(copy, 'pmax')).toEqual([])
        expect(runValid(copy, 'meta')).toEqual([])
    })

    it.each(SUBSTITUTED.map(({platform, field}) => ({platform, field})))(
        'removing only the $platform $field entry makes import or the $platform validator throw an Error naming it',
        async ({platform, field}) => {
            substituteCatalogue((actual) => actual.filter((e) => !(e.platform === platform && e.field === field)))

            // Rejects if either the import or the validator call throws; resolves to undefined otherwise.
            const error = await loadCopy()
                .then((copy) => runValid(copy, platform))
                .then(
                    () => undefined,
                    (thrown: unknown) => thrown
                )

            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toContain(`${platform}.${field}`)
        }
    )
})

describe('runtime export list [cl-003:AC4]', () => {
    it('is exactly the seven validator exports and no catalogue re-export', async () => {
        const copy = await loadCopy()
        expect(Object.keys(copy).sort()).toEqual([
            'CopyShapeError',
            'charCount',
            'isNearDuplicate',
            'validateCopy',
            'validateMeta',
            'validatePmax',
            'validateRsa',
        ])
    })
})

describe('removing the substitution restores the real limits [cl-003:AC5]', () => {
    it('a fresh import flags a 31-char RSA headline and accepts a 125-char Meta primary text', async () => {
        substituteCatalogue(() => SUBSTITUTED)
        await loadCopy()

        vi.doUnmock(CATALOGUE)
        vi.resetModules()
        const {validateRsa, validateMeta} = await loadCopy()

        const longHeadline = 'x'.repeat(31)
        expect(
            validateRsa({...structuredClone(VALID_RSA), headlines: [longHeadline, 'Headline two', 'Headline three']})
        ).toEqual([{field: 'headlines[0]', message: `exceeds 30 chars (31): "${longHeadline}"`}])
        expect(validateMeta({...structuredClone(VALID_META), primaryTexts: ['x'.repeat(125)]})).toEqual([])
    })
})
