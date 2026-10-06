import {describe, expect, it} from 'vitest'

interface CopyLimitView {
    platform: string
    field: string
    min: number
    max: number
    maxChars: number
}

interface CopyLimitsModule {
    COPY_LIMITS: readonly Readonly<CopyLimitView>[]
    listCopyLimits: () => CopyLimitView[]
}

declare global {
    interface ImportMeta {
        glob<T>(pattern: string): Record<string, () => Promise<T>>
    }
}

// A lazy glob lets RED reach assertions before copyLimits.ts exists.
const copyLimitsModules = import.meta.glob<CopyLimitsModule>('./copyLimits.ts')

async function loadCopyLimits(): Promise<CopyLimitsModule> {
    const load = copyLimitsModules['./copyLimits.ts']
    expect(load, 'src/domain/validation/copyLimits.ts must exist').toBeTypeOf('function')
    if (load === undefined) {
        throw new Error('unreachable: copyLimits.ts is missing')
    }
    return load()
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

describe('COPY_LIMITS', () => {
    it('deep-equals the literal ten-entry D3 list in order', async () => {
        const {COPY_LIMITS} = await loadCopyLimits()
        expect(COPY_LIMITS).toHaveLength(10)
        expect(COPY_LIMITS).toEqual(freshD3())
        expect(COPY_LIMITS.map((entry) => `${entry.platform}.${entry.field}`)).toEqual([
            'rsa.headlines',
            'rsa.descriptions',
            'rsa.paths',
            'pmax.shortHeadlines',
            'pmax.longHeadlines',
            'pmax.descriptions',
            'pmax.businessName',
            'meta.primaryTexts',
            'meta.headlines',
            'meta.descriptions',
        ])
    })

    it('orders the own keys of each entry as platform, field, min, max, maxChars', async () => {
        const {COPY_LIMITS} = await loadCopyLimits()
        expect(COPY_LIMITS.map((entry) => Object.keys(entry))).toEqual(D3.map(() => KEYS))
    })

    it('has integer min >= 0, max >= min and maxChars >= 1 with unique platform/field pairs', async () => {
        const {COPY_LIMITS} = await loadCopyLimits()
        expect(COPY_LIMITS).toHaveLength(10)
        for (const entry of COPY_LIMITS) {
            expect(Number.isInteger(entry.min), `${entry.platform}.${entry.field} min`).toBe(true)
            expect(Number.isInteger(entry.max), `${entry.platform}.${entry.field} max`).toBe(true)
            expect(Number.isInteger(entry.maxChars), `${entry.platform}.${entry.field} maxChars`).toBe(true)
            expect(entry.min).toBeGreaterThanOrEqual(0)
            expect(entry.max).toBeGreaterThanOrEqual(entry.min)
            expect(entry.maxChars).toBeGreaterThanOrEqual(1)
        }
        const pairs = COPY_LIMITS.map((entry) => JSON.stringify([entry.platform, entry.field]))
        expect(new Set(pairs).size).toBe(10)
    })

    it('freezes the array and every entry', async () => {
        const {COPY_LIMITS} = await loadCopyLimits()
        expect(COPY_LIMITS).toHaveLength(10)
        expect(Object.isFrozen(COPY_LIMITS)).toBe(true)
        expect(COPY_LIMITS.map((entry) => Object.isFrozen(entry))).toEqual(D3.map(() => true))
    })

    it('throws TypeError when assigning maxChars on any entry and keeps the D3 values', async () => {
        const {COPY_LIMITS} = await loadCopyLimits()
        expect(COPY_LIMITS).toHaveLength(10)
        for (const entry of COPY_LIMITS) {
            const writable = entry as {maxChars: number}
            expect(() => {
                writable.maxChars = 999
            }).toThrow(TypeError)
        }
        expect(COPY_LIMITS).toEqual(freshD3())
    })

    it('throws TypeError when pushing onto COPY_LIMITS and keeps the D3 list', async () => {
        const {COPY_LIMITS} = await loadCopyLimits()
        const writable = COPY_LIMITS as CopyLimitView[]
        expect(() => writable.push({platform: 'tiktok', field: 'captions', min: 1, max: 1, maxChars: 1})).toThrow(
            TypeError
        )
        expect(COPY_LIMITS).toEqual(freshD3())
    })

    it('throws TypeError when assigning COPY_LIMITS[0] and keeps the D3 list', async () => {
        const {COPY_LIMITS} = await loadCopyLimits()
        const writable = COPY_LIMITS as CopyLimitView[]
        expect(() => {
            writable[0] = {platform: 'rsa', field: 'headlines', min: 0, max: 100, maxChars: 1000}
        }).toThrow(TypeError)
        expect(COPY_LIMITS).toEqual(freshD3())
    })
})

describe('listCopyLimits', () => {
    it('returns ten entries deep-equal to COPY_LIMITS and the D3 list in order', async () => {
        const {COPY_LIMITS, listCopyLimits} = await loadCopyLimits()
        const limits = listCopyLimits()
        expect(limits).toHaveLength(10)
        expect(limits).toEqual(freshD3())
        expect(limits).toEqual([...COPY_LIMITS])
    })

    it('keeps the platform, field, min, max, maxChars key order on every returned entry', async () => {
        const {listCopyLimits} = await loadCopyLimits()
        expect(listCopyLimits().map((entry) => Object.keys(entry))).toEqual(D3.map(() => KEYS))
    })

    it('shares no array or entry reference with COPY_LIMITS', async () => {
        const {COPY_LIMITS, listCopyLimits} = await loadCopyLimits()
        const limits = listCopyLimits()
        expect(limits).toHaveLength(10)
        expect(limits).not.toBe(COPY_LIMITS)
        const catalogueEntries = new Set<object>(COPY_LIMITS)
        expect(limits.map((entry) => catalogueEntries.has(entry))).toEqual(D3.map(() => false))
    })

    it('returns plain, writable entries and a writable array', async () => {
        const {listCopyLimits} = await loadCopyLimits()
        const limits = listCopyLimits()
        expect(limits).toHaveLength(10)
        expect(Array.isArray(limits)).toBe(true)
        expect(Object.isFrozen(limits)).toBe(false)
        expect(limits.map((entry) => Object.getPrototypeOf(entry) === Object.prototype)).toEqual(D3.map(() => true))
        expect(limits.map((entry) => Object.isFrozen(entry))).toEqual(D3.map(() => false))
    })

    it('leaves COPY_LIMITS and the next result intact when a returned entry maxChars is set', async () => {
        const {COPY_LIMITS, listCopyLimits} = await loadCopyLimits()
        const limits = listCopyLimits()
        expect(limits).toHaveLength(10)
        for (const entry of limits) {
            entry.maxChars = 1
        }
        expect(limits.map((entry) => entry.maxChars)).toEqual(D3.map(() => 1))
        expect(COPY_LIMITS).toEqual(freshD3())
        expect(listCopyLimits()).toEqual(freshD3())
    })

    it('leaves COPY_LIMITS and the next result intact when the returned array is pushed onto', async () => {
        const {COPY_LIMITS, listCopyLimits} = await loadCopyLimits()
        const limits = listCopyLimits()
        limits.push({platform: 'tiktok', field: 'captions', min: 1, max: 1, maxChars: 1})
        expect(limits).toHaveLength(11)
        expect(COPY_LIMITS).toEqual(freshD3())
        expect(listCopyLimits()).toEqual(freshD3())
    })

    it('leaves COPY_LIMITS and the next result intact when the returned array is spliced', async () => {
        const {COPY_LIMITS, listCopyLimits} = await loadCopyLimits()
        const limits = listCopyLimits()
        const removed = limits.splice(0, 3)
        expect(removed).toEqual(freshD3().slice(0, 3))
        expect(limits).toHaveLength(7)
        expect(COPY_LIMITS).toEqual(freshD3())
        expect(listCopyLimits()).toEqual(freshD3())
    })

    it('returns deep-equal but distinct arrays and entries on consecutive calls and never changes COPY_LIMITS', async () => {
        const {COPY_LIMITS, listCopyLimits} = await loadCopyLimits()
        const snapshot = structuredClone(COPY_LIMITS)
        const first = listCopyLimits()
        const second = listCopyLimits()
        expect(first).toHaveLength(10)
        expect(second).toEqual(first)
        expect(second).not.toBe(first)
        expect(second.map((entry, index) => entry === first[index])).toEqual(D3.map(() => false))
        expect(COPY_LIMITS).toEqual(snapshot)
        expect(snapshot).toEqual(freshD3())
    })
})
