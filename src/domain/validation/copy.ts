// Platform copy rules from the ad-platform specs digested in the marketing reports:
// Google RSA / PMax field counts + char limits, Meta visible-length limits.

import type {MetaCopy, PmaxCopy, RsaCopy} from '@/types/copy'

export type {MetaCopy, PmaxCopy, RsaCopy}

export interface CopyIssue {
    field: string
    message: string
}

const segmenter = new Intl.Segmenter()

/** Platform limits count characters (graphemes), not UTF-16 units. */
export const charCount = (s: string): number => [...segmenter.segment(s)].length

const checkList = (
    issues: CopyIssue[],
    field: string,
    items: string[],
    {min, max, maxChars}: {min: number; max: number; maxChars: number}
): void => {
    if (items.length < min || items.length > max) {
        issues.push({field, message: `needs ${String(min)}-${String(max)} entries, got ${String(items.length)}`})
    }
    items.forEach((item, i) => {
        const n = charCount(item.trim())
        if (n === 0) {
            issues.push({field: `${field}[${String(i)}]`, message: 'is empty'})
        } else if (n > maxChars) {
            issues.push({
                field: `${field}[${String(i)}]`,
                message: `exceeds ${String(maxChars)} chars (${String(n)}): "${item}"`,
            })
        }
    })
}

const normalize = (s: string): string =>
    s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()

const wordSet = (s: string): Set<string> => new Set(normalize(s).split(' ').filter(Boolean))

/** Jaccard word overlap; Google discards near-duplicate RSA headlines. */
export const isNearDuplicate = (a: string, b: string): boolean => {
    const na = normalize(a)
    const nb = normalize(b)
    if (na === nb) {
        return true
    }
    const wa = wordSet(a)
    const wb = wordSet(b)
    if (wa.size === 0 || wb.size === 0) {
        return na === nb
    }
    let shared = 0
    for (const w of wa) {
        if (wb.has(w)) {
            shared++
        }
    }
    const union = wa.size + wb.size - shared
    return shared / union >= 0.8
}

const checkNearDuplicates = (issues: CopyIssue[], field: string, items: string[]): void => {
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            if (isNearDuplicate(items[i] ?? '', items[j] ?? '')) {
                issues.push({
                    field,
                    message: `near-duplicates: "${items[i] ?? ''}" / "${items[j] ?? ''}"`,
                })
            }
        }
    }
}

/** Google Responsive Search Ads: 15 H ≤30, 4 D ≤90, 2 paths ≤15, no near-dup headlines. */
export const validateRsa = (copy: RsaCopy): CopyIssue[] => {
    const issues: CopyIssue[] = []
    checkList(issues, 'headlines', copy.headlines, {min: 3, max: 15, maxChars: 30})
    checkList(issues, 'descriptions', copy.descriptions, {min: 2, max: 4, maxChars: 90})
    checkList(issues, 'paths', copy.paths, {min: 0, max: 2, maxChars: 15})
    checkNearDuplicates(issues, 'headlines', copy.headlines)
    return issues
}

/** Google Performance Max / Demand Gen asset-group text. */
export const validatePmax = (copy: PmaxCopy): CopyIssue[] => {
    const issues: CopyIssue[] = []
    checkList(issues, 'shortHeadlines', copy.shortHeadlines, {min: 3, max: 15, maxChars: 30})
    checkList(issues, 'longHeadlines', copy.longHeadlines, {min: 1, max: 5, maxChars: 90})
    checkList(issues, 'descriptions', copy.descriptions, {min: 2, max: 5, maxChars: 90})
    checkList(issues, 'businessName', [copy.businessName], {min: 1, max: 1, maxChars: 25})
    checkNearDuplicates(issues, 'shortHeadlines', copy.shortHeadlines)
    return issues
}

/** Meta Feed/Stories: primary ≤125 (visible before "See more"), headline ≤40, desc ≤25. */
export const validateMeta = (copy: MetaCopy): CopyIssue[] => {
    const issues: CopyIssue[] = []
    checkList(issues, 'primaryTexts', copy.primaryTexts, {min: 1, max: 5, maxChars: 125})
    checkList(issues, 'headlines', copy.headlines, {min: 1, max: 5, maxChars: 40})
    checkList(issues, 'descriptions', copy.descriptions, {min: 1, max: 5, maxChars: 25})
    return issues
}
