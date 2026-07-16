import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {Campaign, CampaignCopy, ReviewStatus, RunState} from '@/types/run'

vi.mock('next/cache', () => ({revalidatePath: vi.fn()}))
vi.mock('@/lib/state/store', () => ({
    RUNS_DIR: '/runs',
    readRun: vi.fn(),
    writeRun: vi.fn(),
}))

import {approveBriefAction, submitReviewsAction} from '@/app/runs/[id]/actions'
import {readRun, writeRun} from '@/lib/state/store'

const mockReadRun = vi.mocked(readRun)
const mockWriteRun = vi.mocked(writeRun)

const validCopy = (): CampaignCopy => ({
    rsa: {
        headlines: ['Alpha headline', 'Bravo headline', 'Charlie headline'],
        descriptions: ['Description one here', 'Description two here'],
        paths: ['path'],
    },
    pmax: {
        shortHeadlines: ['Short one', 'Short two', 'Short three'],
        longHeadlines: ['Long headline for pmax'],
        descriptions: ['Pmax description one', 'Pmax description two'],
        businessName: 'Acme',
    },
    meta: {
        primaryTexts: ['Primary text for meta'],
        headlines: ['Meta headline'],
        descriptions: ['Meta desc'],
    },
})

// Empty lists fail the validators' min-count rules.
const invalidCopy = (): CampaignCopy => ({
    rsa: {headlines: [], descriptions: [], paths: []},
    pmax: {shortHeadlines: [], longHeadlines: [], descriptions: [], businessName: ''},
    meta: {primaryTexts: [], headlines: [], descriptions: []},
})

// Redos carry a note by default — the action rejects noteless redos.
const review = (status: ReviewStatus): {status: ReviewStatus; note: string} => ({
    status,
    note: status === 'redo' ? 'fix this' : '',
})

const campaign = (copy: CampaignCopy, copyStatus: ReviewStatus, imageStatus: ReviewStatus): Campaign => ({
    slug: 'c',
    copy,
    copyReviews: {
        rsa: review(copyStatus),
        pmax: review(copyStatus),
        meta: review(copyStatus),
    },
    images: [
        {
            file: 'assets/v1.png',
            platform: 'meta',
            format: 'square',
            variant: 1,
            review: review(imageStatus),
        },
    ],
})

const reviewingRun = {id: 'r1', status: 'reviewing'} as RunState

describe('approveBriefAction', () => {
    const briefForm = (): FormData => {
        const fd = new FormData()
        fd.set('product', ' Widget ')
        fd.set('audience', 'devs')
        fd.set('valueProps', 'fast\n\n cheap ')
        fd.set('offer', 'trial')
        fd.set('landingUrl', 'https://x.com')
        fd.set('voice', 'dry')
        fd.set('theme.0.name', 'Price honesty')
        fd.set('theme.0.angle', 'offer-led')
        fd.set('theme.0.tone', 'deadpan')
        fd.set('theme.0.sampleHeadline', 'H')
        fd.set('theme.0.visualDirection', 'stamp')
        return fd
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('no-ops when the run does not exist', async () => {
        mockReadRun.mockResolvedValue(null)
        await approveBriefAction('r1', briefForm())
        expect(mockWriteRun).not.toHaveBeenCalled()
    })

    it('no-ops when the run cannot transition to generating', async () => {
        mockReadRun.mockResolvedValue({id: 'r1', status: 'generating'} as RunState)
        await approveBriefAction('r1', briefForm())
        expect(mockWriteRun).not.toHaveBeenCalled()
    })

    it('persists the trimmed brief and indexed theme edits, then hands off', async () => {
        mockReadRun.mockResolvedValue({
            id: 'r1',
            status: 'awaiting-approval',
            themes: [{slug: 't0', name: 'old', angle: '', tone: '', sampleHeadline: '', visualDirection: ''}],
        } as RunState)
        await approveBriefAction('r1', briefForm())
        expect(mockWriteRun).toHaveBeenCalledWith(
            '/runs',
            expect.objectContaining({
                status: 'generating',
                brief: {
                    product: 'Widget',
                    audience: 'devs',
                    valueProps: ['fast', 'cheap'],
                    offer: 'trial',
                    landingUrl: 'https://x.com',
                    voice: 'dry',
                },
                themes: [
                    {
                        slug: 't0',
                        name: 'Price honesty',
                        angle: 'offer-led',
                        tone: 'deadpan',
                        sampleHeadline: 'H',
                        visualDirection: 'stamp',
                    },
                ],
            })
        )
    })

    it('defaults missing form fields to empty strings and missing themes to []', async () => {
        mockReadRun.mockResolvedValue({id: 'r1', status: 'awaiting-approval'} as RunState)
        await approveBriefAction('r1', new FormData())
        expect(mockWriteRun).toHaveBeenCalledWith(
            '/runs',
            expect.objectContaining({
                brief: {product: '', audience: '', valueProps: [], offer: '', landingUrl: '', voice: ''},
                themes: [],
            })
        )
    })
})

describe('submitReviewsAction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockReadRun.mockResolvedValue(reviewingRun)
    })

    it('rejects when the run is not in reviewing state', async () => {
        mockReadRun.mockResolvedValue({id: 'r1', status: 'generating'} as RunState)
        const [status, err] = await submitReviewsAction('r1', [campaign(validCopy(), 'approved', 'approved')])
        expect(status).toBeNull()
        expect(err).toBe('Run is not in reviewing state.')
        expect(mockWriteRun).not.toHaveBeenCalled()
    })

    it('rejects an oversized submission before doing any work', async () => {
        const many = Array.from({length: 25}, () => campaign(validCopy(), 'approved', 'approved'))
        const [status, err] = await submitReviewsAction('r1', many)
        expect(status).toBeNull()
        expect(err).toBe('Submission is too large.')
        expect(mockWriteRun).not.toHaveBeenCalled()
    })

    it('rejects when any asset is still pending', async () => {
        const [status, err] = await submitReviewsAction('r1', [campaign(validCopy(), 'pending', 'approved')])
        expect(status).toBeNull()
        expect(err).toBe('Every asset needs a decision (approve or redo).')
        expect(mockWriteRun).not.toHaveBeenCalled()
    })

    it('rejects a redo without a note', async () => {
        const c = campaign(validCopy(), 'approved', 'redo')
        c.images = c.images.map((i) => ({...i, review: {status: 'redo', note: ''}}))
        const [status, err] = await submitReviewsAction('r1', [c])
        expect(status).toBeNull()
        expect(err).toBe('Every redo needs a note for the agent.')
        expect(mockWriteRun).not.toHaveBeenCalled()
    })

    it('blocks finalizing when approved copy violates platform limits', async () => {
        const [status, err] = await submitReviewsAction('r1', [campaign(invalidCopy(), 'approved', 'approved')])
        expect(status).toBeNull()
        expect(err).toContain('rsa.headlines')
        expect(mockWriteRun).not.toHaveBeenCalled()
    })

    // Regression: the redo path repairs bad copy, so invalid copy must NOT block regeneration.
    it('regenerates even when flagged copy is currently invalid', async () => {
        const [status, err] = await submitReviewsAction('r1', [campaign(invalidCopy(), 'redo', 'approved')])
        expect(err).toBeNull()
        expect(status).toBe('regenerating')
        expect(mockWriteRun).toHaveBeenCalledWith('/runs', expect.objectContaining({status: 'regenerating'}))
    })

    it('finalizes when everything is approved and copy is valid', async () => {
        const [status, err] = await submitReviewsAction('r1', [campaign(validCopy(), 'approved', 'approved')])
        expect(err).toBeNull()
        expect(status).toBe('finalizing')
        expect(mockWriteRun).toHaveBeenCalledWith('/runs', expect.objectContaining({status: 'finalizing'}))
    })

    it('regenerates when some assets are flagged for redo', async () => {
        const [status, err] = await submitReviewsAction('r1', [campaign(validCopy(), 'redo', 'approved')])
        expect(err).toBeNull()
        expect(status).toBe('regenerating')
    })
})
