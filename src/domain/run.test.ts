import {describe, expect, it} from 'vitest'
import {allApproved, canTransition, hasPending} from '@/domain/run'
import type {Campaign, ReviewStatus, RunStatus} from '@/types/run'

const campaign = (copyStatus: ReviewStatus, imageStatus: ReviewStatus): Campaign => ({
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
    images: [
        {
            file: 'assets/v1.png',
            platform: 'meta',
            format: '1080x1080',
            variant: 1,
            review: {status: imageStatus, note: ''},
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

describe('review rollups', () => {
    it('allApproved only when every copy and image review is approved', () => {
        expect(allApproved([campaign('approved', 'approved')])).toBe(true)
        expect(allApproved([campaign('approved', 'redo')])).toBe(false)
        expect(allApproved([campaign('pending', 'approved')])).toBe(false)
        expect(allApproved([])).toBe(true)
    })

    it('hasPending flags any undecided review', () => {
        expect(hasPending([campaign('approved', 'pending')])).toBe(true)
        expect(hasPending([campaign('approved', 'redo')])).toBe(false)
        expect(hasPending([campaign('approved', 'approved'), campaign('approved', 'pending')])).toBe(true)
    })
})
