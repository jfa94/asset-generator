import fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import * as copyModule from '@/domain/validation/copy'
import {
    charCount,
    isNearDuplicate,
    validateMeta,
    validatePmax,
    validateRsa,
    type RsaCopy,
} from '@/domain/validation/copy'

const validRsa: RsaCopy = {
    headlines: [
        'Stop paying for privacy',
        'Delete your data for good',
        'One purchase, zero renewals',
        'Trusted by careful people',
    ],
    descriptions: [
        'Remove your personal data from broker sites with a single one-time purchase.',
        'No subscriptions, no surprises. Own your privacy tooling outright.',
    ],
    paths: ['privacy', 'pricing'],
}

describe('validateRsa', () => {
    it('accepts a valid slate', () => {
        expect(validateRsa(validRsa)).toEqual([])
    })

    it('rejects over-limit headlines with the offender named', () => {
        const issues = validateRsa({
            ...validRsa,
            headlines: [...validRsa.headlines.slice(0, 3), 'x'.repeat(31)],
        })
        expect(issues).toHaveLength(1)
        expect(issues[0]?.field).toBe('headlines[3]')
        expect(issues[0]?.message).toContain('exceeds 30')
    })

    it('rejects too few headlines', () => {
        const issues = validateRsa({...validRsa, headlines: ['One', 'Two']})
        expect(issues.some((i) => i.field === 'headlines' && i.message.includes('3-15'))).toBe(true)
    })

    it('rejects empty entries', () => {
        const issues = validateRsa({...validRsa, descriptions: ['  ', validRsa.descriptions[1] ?? '']})
        expect(issues.some((i) => i.field === 'descriptions[0]' && i.message === 'is empty')).toBe(true)
    })

    it('flags near-duplicate headlines', () => {
        const issues = validateRsa({
            ...validRsa,
            headlines: [...validRsa.headlines.slice(0, 3), 'Stop paying for privacy!'],
        })
        expect(issues.some((i) => i.message.includes('near-duplicates'))).toBe(true)
    })

    it('allows more than 2 paths to be rejected', () => {
        const issues = validateRsa({...validRsa, paths: ['a', 'b', 'c']})
        expect(issues.some((i) => i.field === 'paths')).toBe(true)
    })
})

describe('validatePmax', () => {
    const valid = {
        shortHeadlines: ['Own your privacy', 'No renewals, ever', 'Data brokers, gone'],
        longHeadlines: ['Remove your data from broker sites with one purchase'],
        descriptions: [
            'One-time purchase, lifetime privacy. No subscription required.',
            'We file the removals so you never have to think about it.',
        ],
        businessName: 'GoodbyeSpy',
    }

    it('accepts a valid slate', () => {
        expect(validatePmax(valid)).toEqual([])
    })

    it('rejects a business name over 25 chars', () => {
        const issues = validatePmax({...valid, businessName: 'x'.repeat(26)})
        expect(issues.some((i) => i.field.startsWith('businessName'))).toBe(true)
    })

    it('rejects too few descriptions', () => {
        const issues = validatePmax({...valid, descriptions: ['only one provided here']})
        expect(issues.some((i) => i.field === 'descriptions')).toBe(true)
    })
})

describe('validateMeta', () => {
    const valid = {
        primaryTexts: ['Wondering why you need a subscription for data removal? Us too.'],
        headlines: ['No subscriptions, no surprises'],
        descriptions: ['One-time purchase'],
    }

    it('accepts a valid slate', () => {
        expect(validateMeta(valid)).toEqual([])
    })

    it('rejects primary text over 125 chars', () => {
        const issues = validateMeta({...valid, primaryTexts: ['y'.repeat(126)]})
        expect(issues[0]?.message).toContain('exceeds 125')
    })

    it('rejects description over 25 chars', () => {
        const issues = validateMeta({...valid, descriptions: ['This description is far too long for Meta']})
        expect(issues.some((i) => i.field.startsWith('descriptions'))).toBe(true)
    })
})

describe('exact issue shapes', () => {
    it('reports structural violations with exact field and message', () => {
        expect(validateRsa({headlines: ['alpha one', 'beta two'], descriptions: ['d1', 'd2'], paths: []})).toEqual([
            {field: 'headlines', message: 'needs 3-15 entries, got 2'},
        ])
        expect(
            validatePmax({
                shortHeadlines: ['alpha one', 'beta two'],
                longHeadlines: [],
                descriptions: ['d1', 'd2'],
                businessName: 'x',
            })
        ).toEqual([
            {field: 'shortHeadlines', message: 'needs 3-15 entries, got 2'},
            {field: 'longHeadlines', message: 'needs 1-5 entries, got 0'},
        ])
        expect(validateMeta({primaryTexts: [], headlines: ['h'], descriptions: ['d']})).toEqual([
            {field: 'primaryTexts', message: 'needs 1-5 entries, got 0'},
        ])
    })

    it('reports near-duplicates with both offenders quoted', () => {
        expect(
            validateRsa({
                headlines: ['alpha one', 'beta two', 'alpha one'],
                descriptions: ['d1', 'd2'],
                paths: ['p'],
            })
        ).toEqual([{field: 'headlines', message: 'near-duplicates: "alpha one" / "alpha one"'}])
    })

    it('reports exceeds with the count and the offender', () => {
        const long = 'x'.repeat(31)
        expect(
            validateRsa({headlines: ['alpha one', 'beta two', long], descriptions: ['d1', 'd2'], paths: []})
        ).toEqual([{field: 'headlines[2]', message: `exceeds 30 chars (31): "${long}"`}])
    })

    it('accepts an entry exactly at the limit', () => {
        expect(
            validateRsa({headlines: ['alpha one', 'beta two', 'z'.repeat(30)], descriptions: ['d1', 'd2'], paths: []})
        ).toEqual([])
    })
})

describe('isNearDuplicate boundaries', () => {
    it('matches when only punctuation and case differ', () => {
        expect(isNearDuplicate('Same words!', 'same words')).toBe(true)
    })

    it('matches at exactly 0.8 Jaccard overlap', () => {
        expect(isNearDuplicate('one two three four', 'one two three four five')).toBe(true)
    })

    it('rejects fully distinct wording', () => {
        expect(isNearDuplicate('one two three', 'four five six')).toBe(false)
    })
})

describe('charCount', () => {
    it('counts graphemes, not UTF-16 units', () => {
        expect(charCount('a𝒳b')).toBe(3)
        expect('a𝒳b'.length).toBe(4)
    })
})

describe('properties', () => {
    it('any headline within limits and distinct wording passes headline char checks', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.string({minLength: 1, maxLength: 30}).map((s) => s.replace(/\s+/g, ' ').trim()),
                    {
                        minLength: 3,
                        maxLength: 15,
                    }
                ),
                (headlines) => {
                    const nonEmpty = headlines.every((h) => h.length > 0)
                    fc.pre(nonEmpty)
                    const issues = validateRsa({...validRsa, headlines})
                    // no per-entry char-limit issues may appear
                    return issues.every((i) => !i.message.includes('exceeds 30'))
                }
            )
        )
    })

    it('any entry over the limit is always reported', () => {
        fc.assert(
            fc.property(
                fc.string({minLength: 31, maxLength: 200}).filter((s) => charCount(s.trim()) > 30),
                (long) => {
                    const issues = validateRsa({...validRsa, headlines: [...validRsa.headlines, long]})
                    return issues.some((i) => i.field === 'headlines[4]')
                }
            )
        )
    })

    it('near-duplicate detection is symmetric', () => {
        fc.assert(
            fc.property(fc.string({maxLength: 40}), fc.string({maxLength: 40}), (a, b) => {
                return isNearDuplicate(a, b) === isNearDuplicate(b, a)
            })
        )
    })

    it('every string is a near-duplicate of itself when non-empty', () => {
        fc.assert(
            fc.property(fc.string({minLength: 1, maxLength: 40}), (s) => {
                return isNearDuplicate(s, s)
            })
        )
    })
})

// A namespace boundary keeps RED executable before the new exports exist.
// The public signature comes from copy-001, not from implementation details.
const copyApi = copyModule as unknown as {
    validateCopy: (input: unknown) => {platform: string; valid: boolean; issues: {field: string; message: string}[]}
    CopyShapeError: new (message: string) => Error
}

function validateUnknown(input: unknown) {
    let result: ReturnType<typeof copyApi.validateCopy> | undefined
    expect(() => {
        result = copyApi.validateCopy(input)
    }).not.toThrow()
    return result
}

const dispatchFixtures = [
    {platform: 'rsa', copy: {...validRsa, paths: []}},
    {
        platform: 'pmax',
        copy: {
            shortHeadlines: ['Own your privacy', 'No renewals, ever', 'Data brokers, gone'],
            longHeadlines: ['Remove your data from broker sites with one purchase'],
            descriptions: ['One-time purchase, lifetime privacy.', 'We file the removals for you.'],
            businessName: 'GoodbyeSpy',
        },
    },
    {
        platform: 'meta',
        copy: {
            primaryTexts: ['Keep your data private.'],
            headlines: ['Own your privacy'],
            descriptions: ['One purchase'],
        },
    },
]

function expectShapeError(input: unknown, field: string | RegExp) {
    expect(() => copyApi.validateCopy(input)).toThrow(expect.objectContaining({constructor: copyApi.CopyShapeError}))
    expect(() => copyApi.validateCopy(input)).toThrow(field)
}

describe('validateCopy runtime contract [copy-001]', () => {
    it.each(dispatchFixtures)('returns the exact successful result for $platform', ({platform, copy}) => {
        expect(validateUnknown({platform, copy})).toEqual({platform, valid: true, issues: []})
    })

    it.each([null, [], 'rsa', 7, false, undefined].map((input) => ({input})))(
        'rejects malformed root $input',
        ({input}) => {
            expectShapeError(input, /input|object|root/i)
        }
    )

    it.each([undefined, null, [], 'copy', 7, false].map((copy) => ({copy})))(
        'rejects malformed copy $copy',
        ({copy}) => {
            expectShapeError({platform: 'rsa', copy}, 'copy')
        }
    )

    it.each([undefined, null, [], {}, 'RSA', 'unknown', '', 7].map((platform) => ({platform})))(
        'rejects unsupported platform $platform',
        ({platform}) => {
            expectShapeError({platform, copy: validRsa}, 'platform')
        }
    )

    for (const {platform, copy} of dispatchFixtures) {
        for (const [field, value] of Object.entries(copy)) {
            it(`${platform} rejects missing ${field}`, () => {
                const incomplete = Object.fromEntries(Object.entries(copy).filter(([key]) => key !== field))
                expectShapeError({platform, copy: incomplete}, field)
            })

            const malformed = Array.isArray(value)
                ? [null, {}, 'text', 1, [1], ['ok', null], [false]]
                : [null, [], {}, 1, false]
            it.each(malformed.map((badValue) => ({badValue})))(
                `${platform} rejects malformed ${field}: $badValue`,
                ({badValue}) => {
                    expectShapeError({platform, copy: {...copy, [field]: badValue}}, field)
                }
            )

            if (Array.isArray(value)) {
                it(`${platform} accepts an empty ${field} list as platform input`, () => {
                    const result = validateUnknown({platform, copy: {...copy, [field]: []}})
                    if (field === 'paths') {
                        expect(result).toEqual({platform, valid: true, issues: []})
                    } else {
                        expect(result?.platform).toBe(platform)
                        expect(result?.valid).toBe(false)
                        expect(result?.issues).toHaveLength(1)
                        expect(result?.issues[0]?.field).toBe(field)
                        expect(result?.issues[0]?.message).toMatch(/needs .* got 0/)
                    }
                })
            }

            it.each(['', '   '])(`${platform} treats blank ${field} entries as ordinary issues: %j`, (blank) => {
                const blankValue = Array.isArray(value) ? [blank, ...value.slice(1)] : blank
                const result = validateUnknown({platform, copy: {...copy, [field]: blankValue}})
                expect(result?.valid).toBe(false)
                expect(
                    result?.issues.some(
                        (issue) =>
                            issue.message === 'is empty' &&
                            (issue.field === `${field}[0]` || (!Array.isArray(value) && issue.field === field))
                    )
                ).toBe(true)
            })
        }

        it(`${platform} ignores extras and preserves deeply frozen input deterministically`, () => {
            const frozenCopy = Object.freeze(
                Object.fromEntries(
                    Object.entries(copy).map(([key, value]) => [
                        key,
                        Array.isArray(value) ? Object.freeze([...value]) : value,
                    ])
                )
            )
            const input = Object.freeze({platform, copy: frozenCopy, extra: Object.freeze({ignored: true})})
            const before = JSON.stringify(input)
            const first = validateUnknown(input)
            expect(first).toEqual({platform, valid: true, issues: []})
            expect(JSON.stringify(validateUnknown(input))).toBe(JSON.stringify(first))
            expect(JSON.stringify(input)).toBe(before)
            expect(validateUnknown({platform, copy: {...copy, ignored: 42}})).toEqual(first)
        })
    }

    it('does not mutate frozen malformed input', () => {
        const input = Object.freeze({platform: 'rsa', copy: Object.freeze({headlines: Object.freeze(['hello', 1])})})
        const before = JSON.stringify(input)
        expectShapeError(input, /headlines|descriptions|paths/)
        expect(JSON.stringify(input)).toBe(before)
    })

    it('preserves exact ordered issues from each existing validator', () => {
        const rsa = {headlines: [], descriptions: [], paths: []}
        const pmax = {shortHeadlines: [], longHeadlines: [], descriptions: [], businessName: ''}
        const meta = {primaryTexts: [], headlines: [], descriptions: []}
        for (const {platform, copy, issues} of [
            {platform: 'rsa', copy: rsa, issues: validateRsa(rsa)},
            {platform: 'pmax', copy: pmax, issues: validatePmax(pmax)},
            {platform: 'meta', copy: meta, issues: validateMeta(meta)},
        ]) {
            expect(issues.length).toBeGreaterThan(0)
            expect(validateUnknown({platform, copy})).toEqual({platform, valid: false, issues})
        }
    })

    it.each([
        {platform: 'rsa', copy: validRsa, field: 'headlines', limit: 30},
        {platform: 'pmax', copy: dispatchFixtures[1]?.copy, field: 'shortHeadlines', limit: 30},
        {platform: 'meta', copy: dispatchFixtures[2]?.copy, field: 'primaryTexts', limit: 125},
    ])('preserves $platform exact-limit graphemes and overlong issues', ({platform, copy, field, limit}) => {
        const rest = field === 'primaryTexts' ? [] : ['distinct words', 'another choice']
        const exact = `  ${'👩‍💻'.repeat(limit)}  `
        expect(validateUnknown({platform, copy: {...copy, [field]: [exact, ...rest]}})).toEqual({
            platform,
            valid: true,
            issues: [],
        })
        const long = 'x'.repeat(limit + 1)
        expect(validateUnknown({platform, copy: {...copy, [field]: [long, ...rest]}})).toEqual({
            platform,
            valid: false,
            issues: [
                {field: `${field}[0]`, message: `exceeds ${String(limit)} chars (${String(limit + 1)}): "${long}"`},
            ],
        })
    })

    it('arbitrary JSON extras cannot change valid results or mutate input', () => {
        fc.assert(
            fc.property(fc.jsonValue(), (extra) => {
                const input = {platform: 'rsa', copy: {...validRsa, extra}, extra}
                const before = JSON.stringify(input)
                expect(validateUnknown(input)).toEqual({platform: 'rsa', valid: true, issues: []})
                expect(JSON.stringify(input)).toBe(before)
            })
        )
    })
})
