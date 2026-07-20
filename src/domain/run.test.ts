import {describe, expect, it} from 'vitest'
import {allApproved, approvePending, canTransition, hasNotelessRedo, STATUS_LABELS} from '@/domain/run'
import type {Campaign, ReviewStatus, RunStatus} from '@/types/run'

const campaign = (copyStatus: ReviewStatus, creativeStatus: ReviewStatus, creativeNote = ''): Campaign => ({
    slug: 'c',
    copy: {
        rsa: {headlines: [], descriptions: [], paths: []},
        pmax: {shortHeadlines: [], longHeadlines: [], descriptions: [], businessName: ''},
        meta: {primaryTexts: [], headlines: [], descriptions: []},
    },
    copyReviews: {
        rsa: {status: copyStatus, note: ''},
        pmax: {status: copyStatus, note: ''},
        meta: {status: copyStatus, note: ''},
    },
    creatives: [
        {
            variant: 1,
            spec: {
                lockup: 'poster',
                palette: {background: '#fff', text: '#000', accent: '#f00'},
                copy: {headline: 'H'},
            },
            review: {status: creativeStatus, note: creativeNote},
        },
    ],
})

describe('canTransition', () => {
    it.each<[RunStatus, RunStatus]>([
        ['briefing', 'awaiting-approval'],
        ['awaiting-approval', 'generating'],
        ['generating', 'reviewing'],
        ['reviewing', 'regenerating'],
        ['reviewing', 'finalizing'],
        ['regenerating', 'reviewing'],
        ['finalizing', 'complete'],
    ])('allows %s → %s', (from, to) => {
        expect(canTransition(from, to)).toBe(true)
    })

    it.each<[RunStatus, RunStatus]>([
        ['briefing', 'generating'],
        ['reviewing', 'complete'],
        ['complete', 'briefing'],
        ['generating', 'awaiting-approval'],
    ])('rejects %s → %s', (from, to) => {
        expect(canTransition(from, to)).toBe(false)
    })
})

describe('STATUS_LABELS', () => {
    it('pins who acts next for every status', () => {
        expect(STATUS_LABELS).toEqual({
            briefing: {actor: 'agent', label: 'Agent working — inspecting the repo and drafting the brief'},
            'awaiting-approval': {actor: 'you', label: 'Waiting for you — review and approve the brief'},
            generating: {actor: 'agent', label: 'Agent working — writing copy and composing creatives'},
            reviewing: {actor: 'you', label: 'Waiting for you — review the campaigns'},
            regenerating: {actor: 'agent', label: 'Agent working — revising what you flagged'},
            finalizing: {actor: 'agent', label: 'Agent working — writing campaign folders to Downloads'},
            complete: {actor: 'done', label: 'Done — campaign folders written'},
        })
    })
})

describe('review rollups', () => {
    it('allApproved only when every copy and creative review is approved', () => {
        expect(allApproved([campaign('approved', 'approved')])).toBe(true)
        expect(allApproved([campaign('approved', 'redo')])).toBe(false)
        expect(allApproved([campaign('pending', 'approved')])).toBe(false)
        expect(allApproved([])).toBe(true)
    })

    it('tolerates campaigns without creatives (legacy runs)', () => {
        const legacy = campaign('approved', 'approved')
        delete legacy.creatives
        expect(allApproved([legacy])).toBe(true)
        expect(hasNotelessRedo([legacy])).toBe(false)
    })

    it('hasNotelessRedo flags redos with empty or whitespace notes only', () => {
        expect(hasNotelessRedo([campaign('approved', 'redo')])).toBe(true)
        expect(hasNotelessRedo([campaign('approved', 'redo', '  ')])).toBe(true)
        expect(hasNotelessRedo([campaign('approved', 'redo', 'logo overlaps headline')])).toBe(false)
        expect(hasNotelessRedo([campaign('approved', 'approved')])).toBe(false)
    })
})

describe('approvePending', () => {
    it('flips every pending review to approved, leaving redos untouched', () => {
        const [decided] = approvePending([campaign('pending', 'redo', 'fix it')])
        expect(decided?.copyReviews.rsa.status).toBe('approved')
        expect(decided?.copyReviews.pmax.status).toBe('approved')
        expect(decided?.copyReviews.meta.status).toBe('approved')
        expect(decided?.creatives?.[0]?.review).toEqual({status: 'redo', note: 'fix it'})
    })

    it('does not mutate its input', () => {
        const input = [campaign('pending', 'pending')]
        approvePending(input)
        expect(input[0]?.copyReviews.rsa.status).toBe('pending')
        expect(input[0]?.creatives?.[0]?.review.status).toBe('pending')
    })

    it('leaves campaigns without creatives shaped as-is', () => {
        const legacy = campaign('pending', 'approved')
        delete legacy.creatives
        const [decided] = approvePending([legacy])
        expect(decided?.creatives).toBeUndefined()
        expect(decided?.copyReviews.rsa.status).toBe('approved')
    })
})
