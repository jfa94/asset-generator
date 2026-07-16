import type {Campaign, Review, RunStatus} from '@/types/run'

const NEXT: Record<RunStatus, RunStatus[]> = {
    briefing: ['awaiting-approval'],
    'awaiting-approval': ['generating'],
    generating: ['reviewing'],
    reviewing: ['regenerating', 'finalizing'],
    regenerating: ['reviewing'],
    finalizing: ['complete'],
    complete: [],
}

export const canTransition = (from: RunStatus, to: RunStatus): boolean => NEXT[from].includes(to)

const reviews = (c: Campaign): Review[] => [
    c.copyReviews.rsa,
    c.copyReviews.pmax,
    c.copyReviews.meta,
    ...c.images.map((i) => i.review),
]

export const allApproved = (campaigns: Campaign[]): boolean =>
    campaigns.every((c) => reviews(c).every((r) => r.status === 'approved'))

export const hasPending = (campaigns: Campaign[]): boolean =>
    campaigns.some((c) => reviews(c).some((r) => r.status === 'pending'))

/** A redo without a note gives the regenerating agent nothing to act on. */
export const hasNotelessRedo = (campaigns: Campaign[]): boolean =>
    campaigns.some((c) => reviews(c).some((r) => r.status === 'redo' && r.note.trim() === ''))
