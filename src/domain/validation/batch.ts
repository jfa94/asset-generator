import {CopyShapeError, validateCopy, type CopyValidationResult} from '@/domain/validation/copy'

export interface ParsedBatchEntry {
    id: string
    result: CopyValidationResult
}

function requireEntriesArray(input: unknown): unknown[] {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new CopyShapeError('input must be an object')
    }
    const entries = (input as Record<string, unknown>)['entries']
    if (!Array.isArray(entries)) {
        throw new CopyShapeError('entries must be an array')
    }
    if (entries.length === 0) {
        throw new CopyShapeError('entries must have at least one entry')
    }
    return entries as unknown[]
}

function requireEntryId(entry: Record<string, unknown>, index: number, seenIds: Set<string>): string {
    const id = entry['id']
    if (typeof id !== 'string' || id.trim().length === 0) {
        throw new CopyShapeError(`entries[${String(index)}].id must be a nonempty string`)
    }
    if (seenIds.has(id)) {
        throw new CopyShapeError(`entries[${String(index)}].id is a duplicate identifier`)
    }
    seenIds.add(id)
    return id
}

/** Shape and identifier gate: throws on the first left-to-right violation, no partial output. */
export function parseCopyBatch(input: unknown): ParsedBatchEntry[] {
    const entries = requireEntriesArray(input)
    const seenIds = new Set<string>()
    const parsed: ParsedBatchEntry[] = []
    for (let index = 0; index < entries.length; index++) {
        const rawEntry = entries[index]
        if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) {
            throw new CopyShapeError(`entries[${String(index)}] must be an object`)
        }
        const entry = rawEntry as Record<string, unknown>
        const id = requireEntryId(entry, index, seenIds)
        let result: CopyValidationResult
        try {
            result = validateCopy({platform: entry['platform'], copy: entry['copy']})
        } catch (error) {
            if (error instanceof CopyShapeError) {
                throw new CopyShapeError(`entries[${String(index)}].${error.message}`)
            }
            throw error
        }
        parsed.push({id, result})
    }
    return parsed
}
