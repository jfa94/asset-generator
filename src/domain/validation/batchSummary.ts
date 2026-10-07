import type {BatchValidationResult} from '@/domain/validation/batch'

export interface FieldIssueCount {
    field: string
    count: number
}

export interface BatchSummary {
    entries: number
    valid: number
    invalid: number
    issuesByField: FieldIssueCount[]
}

/** Ordinal UTF-16 code-unit comparison, so ordering is locale-independent. */
function compareOrdinal(left: string, right: string): number {
    if (left < right) {
        return -1
    }
    return left > right ? 1 : 0
}

/** Counts valid and invalid entries and tallies issue occurrences per verbatim field. */
export function summarizeBatch(result: BatchValidationResult): BatchSummary {
    let valid = 0
    let invalid = 0
    const counts = new Map<string, number>()
    for (const entry of result.results) {
        if (entry.valid) {
            valid += 1
        } else {
            invalid += 1
        }
        for (const issue of entry.issues) {
            counts.set(issue.field, (counts.get(issue.field) ?? 0) + 1)
        }
    }
    const issuesByField: FieldIssueCount[] = [...counts].map(([field, count]) => ({field, count}))
    issuesByField.sort((a, b) => b.count - a.count || compareOrdinal(a.field, b.field))
    return {entries: result.results.length, valid, invalid, issuesByField}
}
