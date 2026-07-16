import {beforeEach, describe, expect, it, vi} from 'vitest'

// The real redirect throws NEXT_REDIRECT; mirror that so execution stops at the guard.
vi.mock('next/navigation', () => ({
    redirect: vi.fn((url: string) => {
        throw new Error(`REDIRECT:${url}`)
    }),
}))
vi.mock('@/lib/state/store', () => ({
    RUNS_DIR: '/runs',
    writeRun: vi.fn(),
}))

import {createRunAction} from '@/app/actions'
import {writeRun} from '@/lib/state/store'

const mockWriteRun = vi.mocked(writeRun)

const form = (repoPath: string | null, campaignCount: string | null): FormData => {
    const fd = new FormData()
    if (repoPath !== null) {
        fd.set('repoPath', repoPath)
    }
    if (campaignCount !== null) {
        fd.set('campaignCount', campaignCount)
    }
    return fd
}

describe('createRunAction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it.each([
        ['empty repoPath', form('', '3')],
        ['relative repoPath', form('some/repo', '3')],
        ['overlong repoPath', form('/' + 'a'.repeat(500), '3')],
        ['zero count', form('/tmp/repo', '0')],
        ['non-integer count', form('/tmp/repo', '2.5')],
        ['count above 10', form('/tmp/repo', '11')],
        ['missing count', form('/tmp/repo', null)],
    ])('redirects home without writing on %s', async (_label, fd) => {
        await expect(createRunAction(fd)).rejects.toThrow('REDIRECT:/')
        expect(mockWriteRun).not.toHaveBeenCalled()
    })

    it('creates the run and redirects to it', async () => {
        await expect(createRunAction(form('/tmp/repo', '10'))).rejects.toThrow(/REDIRECT:\/runs\/run-/)
        expect(mockWriteRun).toHaveBeenCalledWith(
            '/runs',
            expect.objectContaining({repoPath: '/tmp/repo', campaignCount: 10, status: 'briefing'})
        )
    })
})
