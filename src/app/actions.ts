'use server'

import {isAbsolute} from 'node:path'
import {redirect} from 'next/navigation'
import {RUNS_DIR, writeRun} from '@/lib/state/store'

// Mirrors the form's max={10}; repoPath must be a plausible absolute path.
const MAX_CAMPAIGNS = 10
const MAX_REPO_PATH_CHARS = 500

export const createRunAction = async (formData: FormData): Promise<void> => {
    const repo = formData.get('repoPath')
    const repoPath = typeof repo === 'string' ? repo.trim() : ''
    const campaignCount = Number(formData.get('campaignCount') ?? 0)
    if (
        repoPath === '' ||
        repoPath.length > MAX_REPO_PATH_CHARS ||
        !isAbsolute(repoPath) ||
        !Number.isInteger(campaignCount) ||
        campaignCount < 1 ||
        campaignCount > MAX_CAMPAIGNS
    ) {
        redirect('/')
    }
    const id = `run-${Date.now().toString(36)}`
    await writeRun(RUNS_DIR, {
        id,
        createdAt: new Date().toISOString(),
        repoPath,
        campaignCount,
        status: 'briefing',
    })
    redirect(`/runs/${id}`)
}
