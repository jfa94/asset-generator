import fc from 'fast-check'
import {describe, expect, it, vi} from 'vitest'
import type {CopyIssue} from '@/domain/validation/copy'
import {validateCopyBatch, type BatchEntryResult, type BatchValidationResult} from '@/domain/validation/batch'
import {summarizeBatch, type BatchSummary, type FieldIssueCount} from './batchSummary'

const issue = (field: string): CopyIssue => ({field, message: `problem with ${field}`})

const entry = (id: string, valid: boolean, fields: string[] = []): BatchEntryResult => ({
    id,
    platform: 'meta',
    valid,
    issues: fields.map(issue),
})

const batch = (
    results: BatchEntryResult[],
    valid = results.every((result) => result.valid)
): BatchValidationResult => ({
    valid,
    results,
})

const deepFreeze = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) {
        return
    }
    for (const nested of Object.values(value as Record<string, unknown>)) {
        deepFreeze(nested)
    }
    Object.freeze(value)
}

describe('summarizeBatch module boundary [sum-001]', () => {
    it('imports and runs with the batch module mocked to expose only validateCopyBatch, never loading it', async () => {
        let factoryCalls = 0
        vi.doMock('@/domain/validation/batch', () => {
            factoryCalls += 1
            return {
                validateCopyBatch: () => {
                    throw new Error('summarizeBatch must not call validateCopyBatch')
                },
            }
        })
        vi.resetModules()
        try {
            const fresh = await import('./batchSummary')
            const summary = fresh.summarizeBatch(batch([entry('a', true), entry('b', false, ['headlines'])]))
            expect(summary).toEqual({
                entries: 2,
                valid: 1,
                invalid: 1,
                issuesByField: [{field: 'headlines', count: 1}],
            })
            expect(factoryCalls).toBe(0)
        } finally {
            vi.doUnmock('@/domain/validation/batch')
            vi.resetModules()
        }
    })
})

describe('summarizeBatch shape [sum-001]', () => {
    it('returns keys entries, valid, invalid, issuesByField in order, each item keyed field then count', () => {
        const summary = summarizeBatch(
            batch([entry('a', false, ['headlines', 'descriptions']), entry('b', false, ['descriptions'])])
        )
        expect(Object.keys(summary)).toEqual(['entries', 'valid', 'invalid', 'issuesByField'])
        expect(summary.issuesByField).toHaveLength(2)
        expect(summary.issuesByField.map((item) => Object.keys(item))).toEqual([
            ['field', 'count'],
            ['field', 'count'],
        ])
    })

    it('keeps the key order for an empty results array', () => {
        expect(Object.keys(summarizeBatch(batch([])))).toEqual(['entries', 'valid', 'invalid', 'issuesByField'])
    })
})

describe('summarizeBatch counts [sum-001]', () => {
    it('reports entries 5, valid 2, invalid 3 for 2 valid and 3 invalid results', () => {
        const summary = summarizeBatch(
            batch([
                entry('a', true),
                entry('b', false, ['headlines']),
                entry('c', false, ['descriptions']),
                entry('d', true),
                entry('e', false, ['primaryTexts']),
            ])
        )
        expect(summary.entries).toBe(5)
        expect(summary.valid).toBe(2)
        expect(summary.invalid).toBe(3)
    })

    it('counts a result with valid false and no issues as invalid', () => {
        const summary = summarizeBatch(batch([entry('a', false), entry('b', true)]))
        expect(summary).toEqual({entries: 2, valid: 1, invalid: 1, issuesByField: []})
    })

    it('ignores a top-level valid true that disagrees with invalid entries', () => {
        const summary = summarizeBatch(batch([entry('a', false, ['headlines']), entry('b', false)], true))
        expect(summary).toEqual({entries: 2, valid: 0, invalid: 2, issuesByField: [{field: 'headlines', count: 1}]})
    })

    it('ignores a top-level valid false that disagrees with all-valid entries', () => {
        const summary = summarizeBatch(batch([entry('a', true), entry('b', true), entry('c', true)], false))
        expect(summary).toEqual({entries: 3, valid: 3, invalid: 0, issuesByField: []})
    })

    it('counts by each result flag, not by issue presence', () => {
        // A result flagged valid with an issue still counts as valid; its issue is still tallied.
        const summary = summarizeBatch(batch([entry('a', true, ['headlines']), entry('b', false)]))
        expect(summary).toEqual({entries: 2, valid: 1, invalid: 1, issuesByField: [{field: 'headlines', count: 1}]})
    })
})

describe('summarizeBatch issue tally [sum-001]', () => {
    it('counts two headlines issues on one entry as 2', () => {
        const summary = summarizeBatch(batch([entry('a', false, ['headlines', 'headlines'])]))
        expect(summary.issuesByField).toEqual([{field: 'headlines', count: 2}])
    })

    it('counts issue occurrences across several entries', () => {
        const summary = summarizeBatch(
            batch([entry('a', false, ['headlines']), entry('b', true), entry('c', false, ['headlines'])])
        )
        expect(summary.issuesByField).toEqual([{field: 'headlines', count: 2}])
    })

    it('reports headlines and headlines[0] as separate items, each once, none with count 0', () => {
        const summary = summarizeBatch(
            batch([
                entry('a', false, ['headlines', 'headlines[0]']),
                entry('b', false, ['headlines[0]', 'Headlines']),
                entry('c', true),
            ])
        )
        const expected: FieldIssueCount[] = [
            {field: 'headlines[0]', count: 2},
            {field: 'Headlines', count: 1},
            {field: 'headlines', count: 1},
        ]
        expect(summary.issuesByField).toEqual(expected)
        expect(summary.issuesByField.every((item) => item.count > 0)).toBe(true)
    })

    it('sorts counts descending regardless of input order: totals 3, 1 and 2 come out as [3, 2, 1]', () => {
        const summary = summarizeBatch(
            batch([
                entry('a', false, ['paths', 'descriptions']),
                entry('b', false, ['headlines', 'descriptions']),
                entry('c', false, ['descriptions', 'headlines']),
            ])
        )
        expect(summary.issuesByField.map((item) => item.count)).toEqual([3, 2, 1])
        expect(summary.issuesByField).toEqual([
            {field: 'descriptions', count: 3},
            {field: 'headlines', count: 2},
            {field: 'paths', count: 1},
        ])
    })

    it('puts the higher count first even when its field sorts later and appears later', () => {
        const summary = summarizeBatch(batch([entry('a', false, ['alpha']), entry('b', false, ['zulu', 'zulu'])]))
        expect(summary.issuesByField).toEqual([
            {field: 'zulu', count: 2},
            {field: 'alpha', count: 1},
        ])
    })
})

describe('summarizeBatch tie-break [sum-001]', () => {
    it('orders tied headlines[2] and headlines[10] as headlines[10] then headlines[2]', () => {
        const summary = summarizeBatch(batch([entry('a', false, ['headlines[2]', 'headlines[10]'])]))
        expect(summary.issuesByField.map((item) => item.field)).toEqual(['headlines[10]', 'headlines[2]'])
    })

    it('orders tied Zeta and alpha as Zeta then alpha (ordinal, not locale)', () => {
        const summary = summarizeBatch(batch([entry('a', false, ['alpha']), entry('b', false, ['Zeta'])]))
        expect(summary.issuesByField.map((item) => item.field)).toEqual(['Zeta', 'alpha'])
    })

    it('orders tied headlines and descriptions as descriptions then headlines', () => {
        const summary = summarizeBatch(batch([entry('a', false, ['headlines', 'descriptions'])]))
        expect(summary.issuesByField).toEqual([
            {field: 'descriptions', count: 1},
            {field: 'headlines', count: 1},
        ])
    })

    it('breaks ties only within a count group', () => {
        const summary = summarizeBatch(
            batch([entry('a', false, ['b', 'a', 'Z', 'c', 'c']), entry('b', false, ['d', 'd', 'headlines[10]'])])
        )
        expect(summary.issuesByField).toEqual([
            {field: 'c', count: 2},
            {field: 'd', count: 2},
            {field: 'Z', count: 1},
            {field: 'a', count: 1},
            {field: 'b', count: 1},
            {field: 'headlines[10]', count: 1},
        ])
    })
})

describe('summarizeBatch empty inputs [sum-001]', () => {
    it('returns issuesByField [] for an all-valid batch', () => {
        const summary = summarizeBatch(batch([entry('a', true), entry('b', true)]))
        expect(summary).toEqual({entries: 2, valid: 2, invalid: 0, issuesByField: []})
    })

    it('returns exactly {entries: 0, valid: 0, invalid: 0, issuesByField: []} for results []', () => {
        const expected: BatchSummary = {entries: 0, valid: 0, invalid: 0, issuesByField: []}
        expect(summarizeBatch({valid: true, results: []})).toStrictEqual(expected)
    })
})

describe('summarizeBatch over validateCopyBatch output [sum-001]', () => {
    const validRsaCopy = {
        headlines: ['Stop paying for privacy', 'Delete your data for good', 'One purchase, zero renewals'],
        descriptions: [
            'Remove your personal data from broker sites with a single one-time purchase.',
            'No subscriptions, no surprises. Own your privacy tooling outright.',
        ],
        paths: ['privacy', 'pricing'],
    }
    const validMetaCopy = {
        primaryTexts: ['Take your name off the data-broker lists for good.'],
        headlines: ['Own your privacy'],
        descriptions: ['Own it outright'],
    }

    it('summarises one valid rsa and two failing meta entries to primaryTexts 2 ahead of headlines 1', () => {
        const result = validateCopyBatch({
            entries: [
                {id: 'rsa-ok', platform: 'rsa', copy: validRsaCopy},
                {id: 'meta-no-primary', platform: 'meta', copy: {...validMetaCopy, primaryTexts: []}},
                {
                    id: 'meta-no-primary-no-headlines',
                    platform: 'meta',
                    copy: {...validMetaCopy, primaryTexts: [], headlines: []},
                },
            ],
        })
        expect(summarizeBatch(result)).toStrictEqual({
            entries: 3,
            valid: 1,
            invalid: 2,
            issuesByField: [
                {field: 'primaryTexts', count: 2},
                {field: 'headlines', count: 1},
            ],
        })
    })
})

describe('summarizeBatch purity [sum-001]', () => {
    const fixture = (): BatchValidationResult =>
        batch([
            entry('a', false, ['headlines', 'descriptions', 'headlines']),
            entry('b', true),
            entry('c', false, ['descriptions', 'headlines[3]']),
        ])

    it('does not throw on a deeply frozen input and leaves it deep-equal to its pre-call clone', () => {
        const input = fixture()
        deepFreeze(input)
        const before = structuredClone(input)
        let summary: BatchSummary | undefined
        expect(() => {
            summary = summarizeBatch(input)
        }).not.toThrow()
        expect(input).toEqual(before)
        expect(summary).toEqual({
            entries: 3,
            valid: 1,
            invalid: 2,
            issuesByField: [
                {field: 'descriptions', count: 2},
                {field: 'headlines', count: 2},
                {field: 'headlines[3]', count: 1},
            ],
        })
    })

    it('returns deep-equal, JSON-identical results on two calls', () => {
        const input = fixture()
        const first = summarizeBatch(input)
        const second = summarizeBatch(input)
        expect(second).toEqual(first)
        expect(JSON.stringify(second)).toBe(JSON.stringify(first))
        expect(JSON.stringify(first)).toBe(
            '{"entries":3,"valid":1,"invalid":2,"issuesByField":[{"field":"descriptions","count":2},{"field":"headlines","count":2},{"field":"headlines[3]","count":1}]}'
        )
    })

    it('leaves the input and a later call unchanged when the first summary is mutated', () => {
        const input = fixture()
        const inputBefore = structuredClone(input)
        const first = summarizeBatch(input)
        const firstSnapshot = structuredClone(first)
        const second = summarizeBatch(input)

        first.entries = 99
        first.valid = 99
        first.invalid = 99
        const firstItem = first.issuesByField[0]
        if (firstItem === undefined) {
            throw new Error('expected at least one issuesByField item')
        }
        firstItem.field = 'tampered'
        firstItem.count = 99
        first.issuesByField.push({field: 'extra', count: 1})

        expect(input).toEqual(inputBefore)
        expect(second).toEqual(firstSnapshot)
        expect(summarizeBatch(input)).toEqual(firstSnapshot)
    })
})

describe('summarizeBatch properties [sum-001]', () => {
    const fieldAlphabet = [
        'headlines',
        'headlines[0]',
        'headlines[10]',
        'headlines[2]',
        'descriptions',
        'Zeta',
        'alpha',
    ]

    const issueArb: fc.Arbitrary<CopyIssue> = fc.record({
        field: fc.constantFrom(...fieldAlphabet),
        message: fc.string({maxLength: 8}),
    })

    const entryArb: fc.Arbitrary<BatchEntryResult> = fc.record({
        id: fc.string({maxLength: 6}),
        platform: fc.constantFrom('rsa' as const, 'pmax' as const, 'meta' as const),
        valid: fc.boolean(),
        issues: fc.array(issueArb, {maxLength: 5}),
    })

    const batchArb: fc.Arbitrary<BatchValidationResult> = fc.record({
        valid: fc.boolean(),
        results: fc.array(entryArb, {maxLength: 8}),
    })

    it('holds count, distinctness, ordering, purity and determinism invariants', () => {
        fc.assert(
            fc.property(batchArb, (input) => {
                const before = structuredClone(input)
                const summary = summarizeBatch(input)
                const allIssues = input.results.flatMap((result) => result.issues)

                expect(Object.keys(summary)).toEqual(['entries', 'valid', 'invalid', 'issuesByField'])
                expect(summary.entries).toBe(input.results.length)
                expect(summary.valid).toBe(input.results.filter((result) => result.valid).length)
                expect(summary.valid + summary.invalid).toBe(summary.entries)

                const fields = summary.issuesByField.map((item) => item.field)
                expect(new Set(fields).size).toBe(fields.length)
                expect([...fields].sort()).toEqual([...new Set(allIssues.map((found) => found.field))].sort())
                expect(summary.issuesByField.reduce((sum, item) => sum + item.count, 0)).toBe(allIssues.length)
                for (const item of summary.issuesByField) {
                    expect(Object.keys(item)).toEqual(['field', 'count'])
                    expect(item.count).toBeGreaterThan(0)
                    expect(item.count).toBe(allIssues.filter((found) => found.field === item.field).length)
                }
                for (let index = 1; index < summary.issuesByField.length; index++) {
                    const previous = summary.issuesByField[index - 1]
                    const current = summary.issuesByField[index]
                    if (previous === undefined || current === undefined) {
                        throw new Error('index out of range')
                    }
                    const ordered =
                        previous.count > current.count ||
                        (previous.count === current.count && previous.field < current.field)
                    expect(ordered).toBe(true)
                }

                expect(input).toEqual(before)
                expect(JSON.stringify(summarizeBatch(input))).toBe(JSON.stringify(summary))
            })
        )
    })
})
