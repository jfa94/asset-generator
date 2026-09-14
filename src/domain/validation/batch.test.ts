import fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {CopyShapeError, validateCopy} from '@/domain/validation/copy'
import {parseCopyBatch} from '@/domain/validation/batch'

// Type-linked to the module's real exported signature, so a renamed field fails tsc.
type ParseCopyBatch = typeof parseCopyBatch

const loadParseCopyBatch = async (): Promise<ParseCopyBatch> => {
    return await Promise.resolve(parseCopyBatch)
}

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

const rsaEntry = {id: 'rsa-one', platform: 'rsa', copy: validRsaCopy}
const pmaxEntry = {id: 'pmax-two', platform: 'pmax', copy: validPmaxCopy}
const metaEntry = {id: 'meta-three', platform: 'meta', copy: validMetaCopy}
const validEntries = [rsaEntry, pmaxEntry, metaEntry]

const platformFixtures = [
    {platform: 'rsa', copy: validRsaCopy as unknown},
    {platform: 'pmax', copy: validPmaxCopy as unknown},
    {platform: 'meta', copy: validMetaCopy as unknown},
]

// Clones per call so freezing the built input never freezes the shared module-level fixtures.
const fixtureAt = (index: number): {platform: string; copy: unknown} => {
    const fixture = platformFixtures[index % platformFixtures.length]
    if (fixture === undefined) {
        throw new Error('fixture index out of range')
    }
    return structuredClone(fixture)
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

// The single-copy message is read back from the shipped validateCopy, so the batch prefix
// contract is asserted as a relation instead of as a copied message literal.
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

const batchShapeMessage = (parse: ParseCopyBatch, input: unknown): string => {
    try {
        parse(input)
    } catch (error) {
        if (error instanceof CopyShapeError) {
            return error.message
        }
        throw error
    }
    throw new Error('expected parseCopyBatch to reject this fixture')
}

describe('parseCopyBatch root shape [batch-001]', () => {
    const malformedRoots: {label: string; input: unknown; message: string}[] = [
        {label: 'null', input: null, message: 'input must be an object'},
        {label: 'undefined', input: undefined, message: 'input must be an object'},
        {label: 'an empty array', input: [], message: 'input must be an object'},
        {label: 'an array of entries', input: [rsaEntry], message: 'input must be an object'},
        {label: 'a string', input: 'entries', message: 'input must be an object'},
        {label: 'a number', input: 42, message: 'input must be an object'},
        {label: 'a boolean', input: true, message: 'input must be an object'},
        {label: 'an object with no entries key', input: {items: []}, message: 'entries must be an array'},
        {label: 'a null entries value', input: {entries: null}, message: 'entries must be an array'},
        {label: 'a string entries value', input: {entries: 'nope'}, message: 'entries must be an array'},
        {label: 'an object entries value', input: {entries: {0: rsaEntry}}, message: 'entries must be an array'},
    ]

    it.each(malformedRoots)('rejects $label with CopyShapeError', async ({input, message}) => {
        const parse = await loadParseCopyBatch()
        expect(() => parse(input)).toThrow(CopyShapeError)
        expect(batchShapeMessage(parse, input)).toBe(message)
    })

    it('names entries, not an index, when the entries value is not an array', async () => {
        const parse = await loadParseCopyBatch()
        const message = batchShapeMessage(parse, {entries: 'nope'})
        expect(message).toContain('entries')
        expect(message).not.toContain('entries[')
    })

    it('rejects a zero-length entries array with a batch-scoped message naming entries', async () => {
        const parse = await loadParseCopyBatch()
        expect(() => parse({entries: []})).toThrow(CopyShapeError)
        const message = batchShapeMessage(parse, {entries: []})
        expect(message).toContain('entries')
        expect(message).not.toContain('entries[')
    })
})

describe('parseCopyBatch identifiers [batch-001]', () => {
    const badIdEntries: {label: string; entry: Record<string, unknown>}[] = [
        {label: 'a missing id', entry: {platform: 'rsa', copy: validRsaCopy}},
        {label: 'an undefined id', entry: {id: undefined, platform: 'rsa', copy: validRsaCopy}},
        {label: 'a numeric id', entry: {id: 7, platform: 'rsa', copy: validRsaCopy}},
        {label: 'a null id', entry: {id: null, platform: 'rsa', copy: validRsaCopy}},
        {label: 'an empty id', entry: {id: '', platform: 'rsa', copy: validRsaCopy}},
        {label: 'a whitespace-only id', entry: {id: '   ', platform: 'rsa', copy: validRsaCopy}},
        {label: 'a tab-and-newline id', entry: {id: '\t\n ', platform: 'rsa', copy: validRsaCopy}},
    ]

    it.each(badIdEntries)('rejects $label by naming entries[1].id', async ({entry}) => {
        const parse = await loadParseCopyBatch()
        const input = {entries: [rsaEntry, entry]}
        expect(() => parse(input)).toThrow(CopyShapeError)
        expect(batchShapeMessage(parse, input)).toContain('entries[1].id')
    })

    it('rejects a repeated exact id by naming the later index', async () => {
        const parse = await loadParseCopyBatch()
        const input = {
            entries: [
                {id: 'dup', platform: 'rsa', copy: validRsaCopy},
                {id: 'other', platform: 'pmax', copy: validPmaxCopy},
                {id: 'dup', platform: 'meta', copy: validMetaCopy},
            ],
        }
        expect(() => parse(input)).toThrow(CopyShapeError)
        const message = batchShapeMessage(parse, input)
        expect(message).toBe('entries[2].id is a duplicate identifier')
    })

    it('treats ids differing only by letter case as distinct and echoes them verbatim', async () => {
        const parse = await loadParseCopyBatch()
        const parsed = parse({
            entries: [
                {id: 'Alpha', platform: 'rsa', copy: validRsaCopy},
                {id: 'alpha', platform: 'meta', copy: validMetaCopy},
            ],
        })
        expect(parsed).toHaveLength(2)
        expect(parsed.map((entry) => entry.id)).toEqual(['Alpha', 'alpha'])
    })

    it('treats ids differing only by surrounding whitespace as distinct and echoes them verbatim', async () => {
        const parse = await loadParseCopyBatch()
        const parsed = parse({
            entries: [
                {id: 'alpha', platform: 'rsa', copy: validRsaCopy},
                {id: ' alpha ', platform: 'meta', copy: validMetaCopy},
            ],
        })
        expect(parsed).toHaveLength(2)
        expect(parsed.map((entry) => entry.id)).toEqual(['alpha', ' alpha '])
    })
})

describe('parseCopyBatch entry shape delegation [batch-001]', () => {
    const nonObjectEntries: {label: string; entry: unknown}[] = [
        {label: 'null', entry: null},
        {label: 'an array', entry: [rsaEntry]},
        {label: 'a string', entry: 'entry'},
        {label: 'a number', entry: 3},
    ]

    it.each(nonObjectEntries)('rejects an entry that is $label, naming entries[1]', async ({entry}) => {
        const parse = await loadParseCopyBatch()
        const input = {entries: [rsaEntry, entry]}
        expect(() => parse(input)).toThrow(CopyShapeError)
        expect(batchShapeMessage(parse, input)).toBe('entries[1] must be an object')
    })

    const shapeViolations: {label: string; platform: unknown; copy: unknown}[] = [
        {label: 'an unknown platform', platform: 'tiktok', copy: {}},
        {label: 'a missing platform', platform: undefined, copy: {}},
        {label: 'a non-object copy', platform: 'rsa', copy: 42},
        {label: 'a non-array headline list', platform: 'rsa', copy: {headlines: 'nope', descriptions: [], paths: []}},
        {label: 'a non-string headline', platform: 'rsa', copy: {headlines: ['ok', 5], descriptions: [], paths: []}},
        {
            label: 'a non-string business name',
            platform: 'pmax',
            copy: {shortHeadlines: [], longHeadlines: [], descriptions: [], businessName: 9},
        },
    ]

    it.each(shapeViolations)(
        'reports the validateCopy message prefixed with entries[1]. for $label',
        async ({platform, copy}) => {
            const parse = await loadParseCopyBatch()
            const singleMessage = singleCopyShapeMessage({platform, copy})
            const input = {entries: [rsaEntry, {id: 'broken', platform, copy}]}
            expect(() => parse(input)).toThrow(CopyShapeError)
            expect(batchShapeMessage(parse, input)).toBe(`entries[1].${singleMessage}`)
        }
    )
})

describe('parseCopyBatch shape-failure ordering [batch-001]', () => {
    it('reports index 1 when shape violations sit at index 1 and index 3', async () => {
        const parse = await loadParseCopyBatch()
        const input = {
            entries: [
                rsaEntry,
                {id: 'bad-platform', platform: 'tiktok', copy: {}},
                metaEntry,
                {id: '   ', platform: 'rsa', copy: validRsaCopy},
            ],
        }
        expect(() => parse(input)).toThrow(CopyShapeError)
        const message = batchShapeMessage(parse, input)
        expect(message).toContain('entries[1]')
        expect(message).not.toContain('entries[3]')
    })

    it('checks the id before the platform within one entry', async () => {
        const parse = await loadParseCopyBatch()
        expect(batchShapeMessage(parse, {entries: [{id: '  ', platform: 'tiktok', copy: {}}]})).toContain(
            'entries[0].id'
        )
    })
})

describe('parseCopyBatch well-shaped batches [batch-001]', () => {
    it('returns one entry per input entry in order, each result deep-equal to validateCopy', async () => {
        const parse = await loadParseCopyBatch()
        const parsed = parse({entries: validEntries})
        expect(parsed).toEqual(
            validEntries.map((entry) => ({
                id: entry.id,
                result: validateCopy({platform: entry.platform, copy: entry.copy}),
            }))
        )
        expect(parsed.map((entry) => entry.id)).toEqual(['rsa-one', 'pmax-two', 'meta-three'])
        expect(parsed.map((entry) => entry.result.platform)).toEqual(['rsa', 'pmax', 'meta'])
        expect(parsed.every((entry) => entry.result.valid)).toBe(true)
    })

    it('collects rule violations at index 0 and index 2 in one call without throwing', async () => {
        const parse = await loadParseCopyBatch()
        const entries = [
            {id: 'rsa-empty', platform: 'rsa', copy: {...validRsaCopy, headlines: []}},
            pmaxEntry,
            {id: 'meta-empty', platform: 'meta', copy: {...validMetaCopy, primaryTexts: []}},
        ]
        const parsed = parse({entries})
        expect(parsed).toEqual(
            entries.map((entry) => ({
                id: entry.id,
                result: validateCopy({platform: entry.platform, copy: entry.copy}),
            }))
        )
        expect(parsed.map((entry) => entry.result.valid)).toEqual([false, true, false])
        expect(parsed[0]?.result.issues.map((issue) => issue.field)).toEqual(['headlines'])
        expect(parsed[2]?.result.issues.map((issue) => issue.field)).toEqual(['primaryTexts'])
    })

    it('parses a deeply frozen batch deterministically and leaves it unchanged', async () => {
        const parse = await loadParseCopyBatch()
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
                    const first = parse(input)
                    expect(first.map((entry) => entry.id)).toEqual(ids)
                    expect(parse(input)).toEqual(first)
                    expect(JSON.stringify(input)).toBe(before)
                }
            )
        )
    })
})

describe('parseCopyBatch malformed batches [batch-001]', () => {
    it('returns no partial results and leaves a deeply frozen input unchanged', async () => {
        const parse = await loadParseCopyBatch()
        // structuredClone keeps the shared fixtures unfrozen for the other tests in this file.
        const input = structuredClone({entries: [rsaEntry, metaEntry, {id: 'broken', platform: 'tiktok', copy: {}}]})
        deepFreeze(input)
        const before = JSON.stringify(input)
        let returned: unknown = 'parseCopyBatch was not called'
        expect(() => {
            returned = parse(input)
        }).toThrow(CopyShapeError)
        expect(returned).toBe('parseCopyBatch was not called')
        expect(JSON.stringify(input)).toBe(before)
    })
})
