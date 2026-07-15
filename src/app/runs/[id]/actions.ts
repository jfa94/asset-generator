'use server'

import {revalidatePath} from 'next/cache'
import {allApproved, canTransition, hasPending} from '@/domain/run'
import {validateMeta, validatePmax, validateRsa} from '@/domain/validation/copy'
import {readRun, RUNS_DIR, writeRun} from '@/lib/state/store'
import type {Brief, Campaign, Theme} from '@/types/run'

const field = (formData: FormData, name: string): string => {
    const v = formData.get(name)
    return typeof v === 'string' ? v.trim() : ''
}

const lines = (formData: FormData, name: string): string[] =>
    field(formData, name)
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s !== '')

/** awaiting-approval → generating: persist the edited brief + themes and hand off to the agent. */
export const approveBriefAction = async (id: string, formData: FormData): Promise<void> => {
    const run = await readRun(RUNS_DIR, id)
    if (run === null || !canTransition(run.status, 'generating')) {
        return
    }
    const brief: Brief = {
        product: field(formData, 'product'),
        audience: field(formData, 'audience'),
        valueProps: lines(formData, 'valueProps'),
        offer: field(formData, 'offer'),
        landingUrl: field(formData, 'landingUrl'),
        voice: field(formData, 'voice'),
    }
    const themes: Theme[] = (run.themes ?? []).map((theme, i) => ({
        slug: theme.slug,
        name: field(formData, `theme.${String(i)}.name`),
        angle: field(formData, `theme.${String(i)}.angle`),
        tone: field(formData, `theme.${String(i)}.tone`),
        sampleHeadline: field(formData, `theme.${String(i)}.sampleHeadline`),
        visualDirection: field(formData, `theme.${String(i)}.visualDirection`),
    }))
    await writeRun(RUNS_DIR, {...run, brief, themes, status: 'generating'})
    revalidatePath(`/runs/${id}`)
}

/** reviewing → regenerating (any redo) | finalizing (all approved). Copy edits are persisted either way. */
export const submitReviewsAction = async (
    id: string,
    campaigns: Campaign[]
): Promise<[string | null, string | null]> => {
    const run = await readRun(RUNS_DIR, id)
    if (run?.status !== 'reviewing') {
        return [null, 'Run is not in reviewing state.']
    }
    if (hasPending(campaigns)) {
        return [null, 'Every asset needs a decision (approve or redo).']
    }
    const copyIssues = campaigns.flatMap((c) => [
        ...validateRsa(c.copy.rsa).map((i) => `${c.slug} rsa.${i.field}: ${i.message}`),
        ...validatePmax(c.copy.pmax).map((i) => `${c.slug} pmax.${i.field}: ${i.message}`),
        ...validateMeta(c.copy.meta).map((i) => `${c.slug} meta.${i.field}: ${i.message}`),
    ])
    if (copyIssues.length > 0) {
        return [null, copyIssues.join('\n')]
    }
    const status = allApproved(campaigns) ? 'finalizing' : 'regenerating'
    await writeRun(RUNS_DIR, {...run, campaigns, status})
    revalidatePath(`/runs/${id}`)
    return [status, null]
}
