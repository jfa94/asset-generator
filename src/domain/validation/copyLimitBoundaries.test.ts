import {describe, expect, it} from 'vitest'
import {
    validateCopy,
    validateMeta,
    validatePmax,
    validateRsa,
    type CopyIssue,
    type MetaCopy,
    type PmaxCopy,
    type RsaCopy,
} from '@/domain/validation/copy'

// Characterization oracle: every expected limit below is a literal, never read from the catalogue.

const WORDS = [
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
]

function entries(label: string, count: number): string[] {
    return WORDS.slice(0, count).map((word) => `${label} ${word}`)
}

function validRsa(): RsaCopy {
    return {
        headlines: entries('Headline', 3),
        descriptions: entries('Description', 2),
        paths: entries('Path', 1),
    }
}

function validPmax(): PmaxCopy {
    return {
        shortHeadlines: entries('Short headline', 3),
        longHeadlines: entries('Long headline', 1),
        descriptions: entries('Description', 2),
        businessName: 'GoodbyeSpy',
    }
}

function validMeta(): MetaCopy {
    return {
        primaryTexts: entries('Primary text', 1),
        headlines: entries('Headline', 1),
        descriptions: entries('Description', 1),
    }
}

interface ListCase {
    platform: 'rsa' | 'pmax' | 'meta'
    field: string
    label: string
    min: number
    max: number
    maxChars: number
    run: (field: string, value: string[]) => CopyIssue[]
}

const runRsa = (field: string, value: string[]) => validateRsa({...validRsa(), [field]: value})
const runPmax = (field: string, value: string[]) => validatePmax({...validPmax(), [field]: value})
const runMeta = (field: string, value: string[]) => validateMeta({...validMeta(), [field]: value})

const LIST_CASES: ListCase[] = [
    {platform: 'rsa', field: 'headlines', label: 'Headline', min: 3, max: 15, maxChars: 30, run: runRsa},
    {platform: 'rsa', field: 'descriptions', label: 'Description', min: 2, max: 4, maxChars: 90, run: runRsa},
    {platform: 'rsa', field: 'paths', label: 'Path', min: 0, max: 2, maxChars: 15, run: runRsa},
    {
        platform: 'pmax',
        field: 'shortHeadlines',
        label: 'Short headline',
        min: 3,
        max: 15,
        maxChars: 30,
        run: runPmax,
    },
    {
        platform: 'pmax',
        field: 'longHeadlines',
        label: 'Long headline',
        min: 1,
        max: 5,
        maxChars: 90,
        run: runPmax,
    },
    {platform: 'pmax', field: 'descriptions', label: 'Description', min: 2, max: 5, maxChars: 90, run: runPmax},
    {
        platform: 'meta',
        field: 'primaryTexts',
        label: 'Primary text',
        min: 1,
        max: 5,
        maxChars: 125,
        run: runMeta,
    },
    {platform: 'meta', field: 'headlines', label: 'Headline', min: 1, max: 5, maxChars: 40, run: runMeta},
    {platform: 'meta', field: 'descriptions', label: 'Description', min: 1, max: 5, maxChars: 25, run: runMeta},
]

describe('baseline fixtures', () => {
    it('are valid for every platform', () => {
        expect(validateRsa(validRsa())).toEqual([])
        expect(validatePmax(validPmax())).toEqual([])
        expect(validateMeta(validMeta())).toEqual([])
    })
})

describe('count upper boundary [cl-001:AC1]', () => {
    it.each([
        {platform: 'rsa', field: 'headlines', count: 16, message: 'needs 3-15 entries, got 16'},
        {platform: 'rsa', field: 'descriptions', count: 5, message: 'needs 2-4 entries, got 5'},
        {platform: 'rsa', field: 'paths', count: 3, message: 'needs 0-2 entries, got 3'},
        {platform: 'pmax', field: 'shortHeadlines', count: 16, message: 'needs 3-15 entries, got 16'},
        {platform: 'pmax', field: 'longHeadlines', count: 6, message: 'needs 1-5 entries, got 6'},
        {platform: 'pmax', field: 'descriptions', count: 6, message: 'needs 2-5 entries, got 6'},
        {platform: 'meta', field: 'primaryTexts', count: 6, message: 'needs 1-5 entries, got 6'},
        {platform: 'meta', field: 'headlines', count: 6, message: 'needs 1-5 entries, got 6'},
        {platform: 'meta', field: 'descriptions', count: 6, message: 'needs 1-5 entries, got 6'},
    ])('$platform $field with $count entries reports "$message"', ({platform, field, count, message}) => {
        const listCase = LIST_CASES.find((c) => c.platform === platform && c.field === field)
        if (!listCase) {
            throw new Error(`missing case ${platform}.${field}`)
        }
        expect(listCase.run(field, entries(listCase.label, count))).toEqual([{field, message}])
    })

    it.each(LIST_CASES.map((c) => ({...c})))('$platform $field accepts exactly max entries', (c) => {
        expect(c.run(c.field, entries(c.label, c.max))).toEqual([])
    })
})

describe('count lower boundary [cl-001:AC2]', () => {
    it.each([
        {platform: 'rsa', field: 'headlines', count: 2, message: 'needs 3-15 entries, got 2'},
        {platform: 'rsa', field: 'descriptions', count: 1, message: 'needs 2-4 entries, got 1'},
        {platform: 'pmax', field: 'shortHeadlines', count: 2, message: 'needs 3-15 entries, got 2'},
        {platform: 'pmax', field: 'longHeadlines', count: 0, message: 'needs 1-5 entries, got 0'},
        {platform: 'pmax', field: 'descriptions', count: 1, message: 'needs 2-5 entries, got 1'},
        {platform: 'meta', field: 'primaryTexts', count: 0, message: 'needs 1-5 entries, got 0'},
        {platform: 'meta', field: 'headlines', count: 0, message: 'needs 1-5 entries, got 0'},
        {platform: 'meta', field: 'descriptions', count: 0, message: 'needs 1-5 entries, got 0'},
    ])('$platform $field with $count entries reports "$message"', ({platform, field, count, message}) => {
        const listCase = LIST_CASES.find((c) => c.platform === platform && c.field === field)
        if (!listCase) {
            throw new Error(`missing case ${platform}.${field}`)
        }
        expect(listCase.run(field, entries(listCase.label, count))).toEqual([{field, message}])
    })

    it.each(LIST_CASES.map((c) => ({...c})))('$platform $field accepts exactly min entries', (c) => {
        expect(c.run(c.field, entries(c.label, c.min))).toEqual([])
    })

    it('rsa paths [] returns no issue', () => {
        expect(validateRsa({...validRsa(), paths: []})).toEqual([])
    })
})

describe('character boundary [cl-001:AC3]', () => {
    it.each([
        {platform: 'rsa', field: 'headlines', maxChars: 30, prefix: 'exceeds 30 chars (31)'},
        {platform: 'rsa', field: 'descriptions', maxChars: 90, prefix: 'exceeds 90 chars (91)'},
        {platform: 'rsa', field: 'paths', maxChars: 15, prefix: 'exceeds 15 chars (16)'},
        {platform: 'pmax', field: 'shortHeadlines', maxChars: 30, prefix: 'exceeds 30 chars (31)'},
        {platform: 'pmax', field: 'longHeadlines', maxChars: 90, prefix: 'exceeds 90 chars (91)'},
        {platform: 'pmax', field: 'descriptions', maxChars: 90, prefix: 'exceeds 90 chars (91)'},
        {platform: 'meta', field: 'primaryTexts', maxChars: 125, prefix: 'exceeds 125 chars (126)'},
        {platform: 'meta', field: 'headlines', maxChars: 40, prefix: 'exceeds 40 chars (41)'},
        {platform: 'meta', field: 'descriptions', maxChars: 25, prefix: 'exceeds 25 chars (26)'},
    ])('$platform $field accepts $maxChars chars and rejects one more', ({platform, field, maxChars, prefix}) => {
        const listCase = LIST_CASES.find((c) => c.platform === platform && c.field === field)
        if (!listCase) {
            throw new Error(`missing case ${platform}.${field}`)
        }
        const rest = entries(listCase.label, Math.max(listCase.min, 1)).slice(1)
        const atLimit = 'x'.repeat(maxChars)
        const over = 'x'.repeat(maxChars + 1)
        expect(listCase.run(field, [atLimit, ...rest])).toEqual([])
        expect(listCase.run(field, [over, ...rest])).toEqual([{field: `${field}[0]`, message: `${prefix}: "${over}"`}])
    })

    it('pmax businessName accepts 25 chars and rejects 26', () => {
        const atLimit = 'x'.repeat(25)
        const over = 'x'.repeat(26)
        expect(validatePmax({...validPmax(), businessName: atLimit})).toEqual([])
        expect(validatePmax({...validPmax(), businessName: over})).toEqual([
            {field: 'businessName[0]', message: `exceeds 25 chars (26): "${over}"`},
        ])
    })
})

describe('pmax businessName blank [cl-001:AC4]', () => {
    it.each(['', '   '])('businessName %j reports only businessName[0] is empty', (businessName) => {
        expect(validatePmax({...validPmax(), businessName})).toEqual([{field: 'businessName[0]', message: 'is empty'}])
    })
})

const longRsaDescription = 'x'.repeat(91)
const rsaAllViolations: RsaCopy = {
    headlines: ['Own your privacy', 'Own your privacy!'],
    descriptions: [longRsaDescription],
    paths: ['a', 'b', 'c'],
}
const rsaAllViolationIssues: CopyIssue[] = [
    {field: 'headlines', message: 'needs 3-15 entries, got 2'},
    {field: 'descriptions', message: 'needs 2-4 entries, got 1'},
    {field: 'descriptions[0]', message: `exceeds 90 chars (91): "${longRsaDescription}"`},
    {field: 'paths', message: 'needs 0-2 entries, got 3'},
    {field: 'headlines', message: 'near-duplicates: "Own your privacy" / "Own your privacy!"'},
]

const longBusinessName = 'x'.repeat(26)
const pmaxAllViolations: PmaxCopy = {
    shortHeadlines: [],
    longHeadlines: [],
    descriptions: ['One purchase'],
    businessName: longBusinessName,
}
const pmaxAllViolationIssues: CopyIssue[] = [
    {field: 'shortHeadlines', message: 'needs 3-15 entries, got 0'},
    {field: 'longHeadlines', message: 'needs 1-5 entries, got 0'},
    {field: 'descriptions', message: 'needs 2-5 entries, got 1'},
    {field: 'businessName[0]', message: `exceeds 25 chars (26): "${longBusinessName}"`},
]

const longMetaHeadline = 'x'.repeat(41)
const metaAllViolations: MetaCopy = {
    primaryTexts: [],
    headlines: [longMetaHeadline],
    descriptions: [
        'Plain pricing',
        'Quiet removals',
        'Broker cleanup',
        'Lifetime access',
        'Careful people',
        'Zero renewals',
    ],
}
const metaAllViolationIssues: CopyIssue[] = [
    {field: 'primaryTexts', message: 'needs 1-5 entries, got 0'},
    {field: 'headlines[0]', message: `exceeds 40 chars (41): "${longMetaHeadline}"`},
    {field: 'descriptions', message: 'needs 1-5 entries, got 6'},
]

describe('all-violations issue order', () => {
    it('rsa returns the five pinned issues with near-duplicates last [cl-001:AC5]', () => {
        expect(validateRsa(rsaAllViolations)).toEqual(rsaAllViolationIssues)
    })

    it('pmax returns the four pinned issues with businessName[0] last [cl-001:AC6]', () => {
        expect(validatePmax(pmaxAllViolations)).toEqual(pmaxAllViolationIssues)
    })

    it('meta returns the three pinned issues [cl-001:AC7]', () => {
        expect(validateMeta(metaAllViolations)).toEqual(metaAllViolationIssues)
    })
})

describe('validateCopy on all-violations fixtures [cl-001:AC8]', () => {
    it.each([
        {platform: 'rsa', copy: rsaAllViolations, issues: rsaAllViolationIssues},
        {platform: 'pmax', copy: pmaxAllViolations, issues: pmaxAllViolationIssues},
        {platform: 'meta', copy: metaAllViolations, issues: metaAllViolationIssues},
    ])('$platform returns {platform, valid: false, issues}', ({platform, copy, issues}) => {
        expect(validateCopy({platform, copy})).toEqual({platform, valid: false, issues})
    })
})
