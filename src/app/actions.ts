'use server'

import {redirect} from 'next/navigation'
import {RUNS_DIR, writeRun} from '@/lib/state/store'

export const createRunAction = async (formData: FormData): Promise<void> => {
    const repo = formData.get('repoPath')
    const repoPath = typeof repo === 'string' ? repo.trim() : ''
    const campaignCount = Number(formData.get('campaignCount') ?? 0)
    if (repoPath === '' || !Number.isInteger(campaignCount) || campaignCount < 1) {
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
