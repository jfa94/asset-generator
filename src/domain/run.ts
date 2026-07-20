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

/** Human status labels: what's happening and who acts next. */
export interface StatusLabel {
    actor: 'agent' | 'you' | 'done'
    label: string
}

export const STATUS_LABELS: Record<RunStatus, StatusLabel> = {
    briefing: {actor: 'agent', label: 'Agent working — inspecting the repo and drafting the brief'},
    'awaiting-approval': {actor: 'you', label: 'Waiting for you — review and approve the brief'},
    generating: {actor: 'agent', label: 'Agent working — writing copy and composing creatives'},
    reviewing: {actor: 'you', label: 'Waiting for you — review the campaigns'},
    regenerating: {actor: 'agent', label: 'Agent working — revising what you flagged'},
    finalizing: {actor: 'agent', label: 'Agent working — writing campaign folders to Downloads'},
    complete: {actor: 'done', label: 'Done — campaign folders written'},
}

const reviews = (c: Campaign): Review[] => [
    c.copyReviews.rsa,
    c.copyReviews.pmax,
    c.copyReviews.meta,
    ...(c.creatives ?? []).map((cr) => cr.review),
]

export const allApproved = (campaigns: Campaign[]): boolean =>
    campaigns.every((c) => reviews(c).every((r) => r.status === 'approved'))

/** A redo without a note gives the regenerating agent nothing to act on. */
export const hasNotelessRedo = (campaigns: Campaign[]): boolean =>
    campaigns.some((c) => reviews(c).some((r) => r.status === 'redo' && r.note.trim() === ''))

const approveReview = (r: Review): Review => (r.status === 'pending' ? {...r, status: 'approved'} : r)

/** Submit-time bulk approve: anything the reviewer didn't flag counts as approved. */
export const approvePending = (campaigns: Campaign[]): Campaign[] =>
    campaigns.map((c) => ({
        ...c,
        copyReviews: {
            rsa: approveReview(c.copyReviews.rsa),
            pmax: approveReview(c.copyReviews.pmax),
            meta: approveReview(c.copyReviews.meta),
        },
        ...(c.creatives === undefined
            ? {}
            : {creatives: c.creatives.map((cr) => ({...cr, review: approveReview(cr.review)}))}),
    }))
