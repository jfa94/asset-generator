import fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {parseCopyBatch, type ParsedBatchEntry} from '@/domain/validation/batch'
import {CopyShapeError, validateCopy, type CopyValidationResult} from '@/domain/validation/copy'

const validRsaCopy = {
    headlines: ['Stop paying for privacy', 'Delete your data for good', 'One purchase, zero renewals'],
    descriptions: [
        'Remove your personal data from broker sites with a single one-time purchase.',
        'No subscriptions, no surprises. Own your privacy tooling outright.',
    ],
    paths: ['privacy', 'pricing'],
}

const validPmaxCopy = {
    shortHeadlines: ['Own your privacy', 'No renewals, ever', 'Data brokers, gone'],
    longHeadlines: ['Remove your data from broker sites with one purchase'],
    descriptions: [
        'One-time purchase, lifetime privacy. No subscription required.',
        'We file the removals so you never have to think about it.',
    ],
    businessName: 'GoodbyeSpy',
}

const validMetaCopy = {
    primaryTexts: ['Take your name off the data-broker lists for good.'],
    headlines: ['Own your privacy'],
    descriptions: ['Own it outright'],
}

const validEntries = [
    {id: 'rsa-one', platform: 'rsa', copy: validRsaCopy},
    {id: 'pmax-two', platform: 'pmax', copy: validPmaxCopy},
    {id: 'meta-three', platform: 'meta', copy: validMetaCopy},
]

const platformFixtures = [
    {platform: 'rsa', copy: validRsaCopy as unknown},
    {platform: 'pmax', copy: validPmaxCopy as unknown},
    {platform: 'meta', copy: validMetaCopy as unknown},
]

const fixtureAt = (index: number): {platform: string; copy: unknown} => {
    const fixture = platformFixtures[index % platformFixtures.length]
    if (fixture === undefined) {
        throw new Error('fixture index out of range')
    }
    return fixture
}

const deepFreeze = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) {
        return
    }
    for (const nested of Object.values(value as Record<string, unknown>)) {
        deepFreeze(nested)
    }
    Object.freeze(value)
}

// The single-copy message is read from the shipped validateCopy so the batch
// prefix contract is asserted as a relation, not as a copied literal.
const singleCopyShapeMessage = (input: unknown): string => {
    try {
        validateCopy(input)
    } catch (error) {
        if (error instanceof CopyShapeError) {
            return error.message
        }
        throw error
    }
    throw new Error('expected validateCopy to reject this fixture')
}

const batchShapeMessage = (input: unknown): string => {
    try {
        parseCopyBatch(input)
    } catch (error) {
        if (error instanceof CopyShapeError) {
            return error.message
        }
        throw error
    }
    throw new Error('expected parseCopyBatch to reject this fixture')
}

describe('parseCopyBatch root shape', () => {
    const malformedRoots: {label: string; input: unknown}[] = [
        {label: 'null', input: null},
        {label: 'undefined', input: undefined},
        {label: 'an empty array', input: []},
        {label: 'an array of entries', input: [{id: 'a', platform: 'rsa', copy: validRsaCopy}]},
        {label: 'a string', input: 'entries'},
        {label: 'a number', input: 42},
        {label: 'a boolean', input: true},
        {label: 'an object with no entries key', input: {items: []}},
        {label: 'a null entries value', input: {entries: null}},
        {label: 'a string entries value', input: {entries: 'nope'}},
        {label: 'an object entries value', input: {entries: {0: {id: 'a'}}}},
    ]

    it.each(malformedRoots)('rejects $label with CopyShapeError', ({input}) => {
        expect(() => parseCopyBatch(input)).toThrow(CopyShapeError)
    })

    it('names entries when the entries value is not an array', () => {
        const message = batchShapeMessage({entries: 'nope'})
        expect(message).toContain('entries')
        expect(message).not.toContain('entries[')
    })

    it('rejects a zero-length entries array with a batch-scoped message naming entries', () => {
        expect(() => parseCopyBatch({entries: []})).toThrow(CopyShapeError)
        const message = batchShapeMessage({entries: []})
        expect(message).toContain('entries')
        expect(message).not.toContain('entries[')
    })
})

describe('parseCopyBatch identifiers', () => {
    const badIdEntries: {label: string; entry: Record<string, unknown>}[] = [
        {label: 'a missing id', entry: {platform: 'rsa', copy: validRsaCopy}},
        {label: 'a numeric id', entry: {id: 7, platform: 'rsa', copy: validRsaCopy}},
        {label: 'a null id', entry: {id: null, platform: 'rsa', copy: validRsaCopy}},
        {label: 'an empty id', entry: {id: '', platform: 'rsa', copy: validRsaCopy}},
        {label: 'a whitespace-only id', entry: {id: '   ', platform: 'rsa', copy: validRsaCopy}},
        {label: 'a tab-and-newline id', entry: {id: '\t\n ', platform: 'rsa', copy: validRsaCopy}},
    ]

    it.each(badIdEntries)('rejects $label naming entries[1].id', ({entry}) => {
        const input = {entries: [validEntries[0], entry]}
        expect(() => parseCopyBatch(input)).toThrow(CopyShapeError)
        expect(batchShapeMessage(input)).toContain('entries[1].id')
    })

    it('rejects a repeated exact id by naming the later index', () => {
        const input = {
            entries: [
                {id: 'dup', platform: 'rsa', copy: validRsaCopy},
                {id: 'other', platform: 'pmax', copy: validPmaxCopy},
                {id: 'dup', platform: 'meta', copy: validMetaCopy},
            ],
        }
        expect(() => parseCopyBatch(input)).toThrow(CopyShapeError)
        const message = batchShapeMessage(input)
        expect(message).toContain('entries[2]')
        expect(message).toMatch(/id/i)
    })

    it('treats ids differing only by surrounding whitespace as distinct and echoes them verbatim', () => {
        const input = {
            entries: [
                {id: 'alpha', platform: 'rsa', copy: validRsaCopy},
                {id: ' alpha ', platform: 'meta', copy: validMetaCopy},
            ],
        }
        const parsed: ParsedBatchEntry[] = parseCopyBatch(input)
        expect(parsed).toHaveLength(2)
        expect(parsed.map((entry) => entry.id)).toEqual(['alpha', ' alpha '])
    })
})

describe('parseCopyBatch entry shape delegation', () => {
    const nonObjectEntries: {label: string; entry: unknown}[] = [
        {label: 'null', entry: null},
        {label: 'an array', entry: [{id: 'a', platform: 'rsa', copy: validRsaCopy}]},
        {label: 'a string', entry: 'entry'},
        {label: 'a number', entry: 3},
    ]

    it.each(nonObjectEntries)('rejects an entry that is $label, naming entries[1]', ({entry}) => {
        const input = {entries: [validEntries[0], entry]}
        expect(() => parseCopyBatch(input)).toThrow(CopyShapeError)
        expect(batchShapeMessage(input)).toContain('entries[1]')
    })

    const shapeViolations: {label: string; platform: unknown; copy: unknown; singleMessage: string}[] = [
        {
            label: 'an unknown platform',
            platform: 'tiktok',
            copy: {},
            singleMessage: 'platform must be rsa, pmax or meta',
        },
        {
            label: 'a missing platform',
            platform: undefined,
            copy: {},
            singleMessage: 'platform must be rsa, pmax or meta',
        },
        {label: 'a non-object copy', platform: 'rsa', copy: 42, singleMessage: 'copy must be an object'},
        {
            label: 'a non-array headline list',
            platform: 'rsa',
            copy: {headlines: 'nope', descriptions: [], paths: []},
            singleMessage: 'copy.headlines must be an array of strings',
        },
        {
            label: 'a non-string headline',
            platform: 'rsa',
            copy: {headlines: ['ok', 5], descriptions: [], paths: []},
            singleMessage: 'copy.headlines[1] must be a string',
        },
        {
            label: 'a non-string business name',
            platform: 'pmax',
            copy: {shortHeadlines: [], longHeadlines: [], descriptions: [], businessName: 9},
            singleMessage: 'copy.businessName must be a string',
        },
    ]

    it.each(shapeViolations)(
        'prefixes the validateCopy message with entries[1]. for $label',
        ({platform, copy, singleMessage}) => {
            expect(singleCopyShapeMessage({platform, copy})).toBe(singleMessage)
            const input = {entries: [validEntries[0], {id: 'broken', platform, copy}]}
            expect(() => parseCopyBatch(input)).toThrow(CopyShapeError)
            expect(batchShapeMessage(input)).toBe(`entries[1].${singleMessage}`)
        }
    )
})

describe('parseCopyBatch shape-failure ordering', () => {
    it('reports index 1 when shape violations sit at index 1 and index 3', () => {
        const input = {
            entries: [
                validEntries[0],
                {id: 'bad-platform', platform: 'tiktok', copy: {}},
                validEntries[2],
                {id: '   ', platform: 'rsa', copy: validRsaCopy},
            ],
        }
        expect(() => parseCopyBatch(input)).toThrow(CopyShapeError)
        const message = batchShapeMessage(input)
        expect(message).toContain('entries[1]')
        expect(message).not.toContain('entries[3]')
    })

    it('checks the id before the platform within one entry', () => {
        const input = {entries: [{id: '  ', platform: 'tiktok', copy: {}}]}
        expect(batchShapeMessage(input)).toContain('entries[0].id')
    })
})

describe('parseCopyBatch well-shaped batches', () => {
    it('returns one entry per input entry in order, each result deep-equal to validateCopy', () => {
        const parsed: ParsedBatchEntry[] = parseCopyBatch({entries: validEntries})
        expect(parsed).toEqual(
            validEntries.map((entry) => ({
                id: entry.id,
                result: validateCopy({platform: entry.platform, copy: entry.copy}),
            }))
        )
        expect(parsed.map((entry) => entry.id)).toEqual(['rsa-one', 'pmax-two', 'meta-three'])
        expect(parsed.map((entry) => entry.result)).toEqual([
            {platform: 'rsa', valid: true, issues: []},
            {platform: 'pmax', valid: true, issues: []},
            {platform: 'meta', valid: true, issues: []},
        ])
    })

    it('collects rule violations at index 0 and index 2 in one call without throwing', () => {
        const rsaTooFew: CopyValidationResult = {
            platform: 'rsa',
            valid: false,
            issues: [{field: 'headlines', message: 'needs 3-15 entries, got 2'}],
        }
        const metaNoPrimary: CopyValidationResult = {
            platform: 'meta',
            valid: false,
            issues: [{field: 'primaryTexts', message: 'needs 1-5 entries, got 0'}],
        }
        const parsed = parseCopyBatch({
            entries: [
                {id: 'rsa-short', platform: 'rsa', copy: {...validRsaCopy, headlines: ['One', 'Two']}},
                {id: 'pmax-ok', platform: 'pmax', copy: validPmaxCopy},
                {id: 'meta-empty', platform: 'meta', copy: {...validMetaCopy, primaryTexts: []}},
            ],
        })
        expect(parsed).toEqual([
            {id: 'rsa-short', result: rsaTooFew},
            {id: 'pmax-ok', result: {platform: 'pmax', valid: true, issues: []}},
            {id: 'meta-empty', result: metaNoPrimary},
        ])
    })

    it('parses a deeply frozen batch deterministically and leaves it unchanged', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(
                    fc.string({minLength: 1, maxLength: 12}).filter((candidate) => candidate.trim().length > 0),
                    {minLength: 1, maxLength: 4}
                ),
                (ids) => {
                    const input = {entries: ids.map((id, index) => ({id, ...fixtureAt(index)}))}
                    deepFreeze(input)
                    const before = JSON.stringify(input)
                    const first = parseCopyBatch(input)
                    expect(first.map((entry) => entry.id)).toEqual(ids)
                    expect(parseCopyBatch(input)).toEqual(first)
                    expect(JSON.stringify(input)).toBe(before)
                }
            )
        )
    })
})

describe('parseCopyBatch malformed batches', () => {
    it('returns no partial results and leaves a deeply frozen input unchanged', () => {
        const input = {
            entries: [
                {id: 'rsa-one', platform: 'rsa', copy: validRsaCopy},
                {id: 'meta-three', platform: 'meta', copy: validMetaCopy},
                {id: 'broken', platform: 'tiktok', copy: {}},
            ],
        }
        deepFreeze(input)
        const before = JSON.stringify(input)
        let returned: unknown = 'parseCopyBatch was not called'
        expect(() => {
            returned = parseCopyBatch(input)
        }).toThrow(CopyShapeError)
        expect(returned).toBe('parseCopyBatch was not called')
        expect(JSON.stringify(input)).toBe(before)
    })
})
