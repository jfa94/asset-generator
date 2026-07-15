// CLI: pnpm render <jobs.json>
// jobs.json: RenderJobFile[] — TemplateSpec with cssPaths/logoPath file refs instead
// of inlined content; this CLI inlines them and renders.

import {readFileSync} from 'node:fs'
import {extname} from 'node:path'
import {renderJobs, type RenderJob} from '@/services/render/render'
import type {TemplateSpec} from '@/lib/templates/types'

export interface RenderJobFile extends Omit<TemplateSpec, 'cssText' | 'logoDataUri'> {
    cssPaths: string[]
    logoPath: string | null
    outPath: string
}

const MIME: Record<string, string> = {
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
}

export const toDataUri = (path: string): string => {
    const mime = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
    return `data:${mime};base64,${readFileSync(path).toString('base64')}`
}

export const loadJobs = (jobsJsonPath: string): RenderJob[] => {
    const raw = JSON.parse(readFileSync(jobsJsonPath, 'utf8')) as RenderJobFile[]
    return raw.map(({cssPaths, logoPath, outPath, ...spec}) => ({
        outPath,
        spec: {
            ...spec,
            cssText: cssPaths.map((p) => readFileSync(p, 'utf8')).join('\n'),
            logoDataUri: logoPath === null ? null : toDataUri(logoPath),
        },
    }))
}

export const main = async (): Promise<void> => {
    const jobsPath = process.argv[2]
    if (jobsPath === undefined) {
        throw new Error('Usage: pnpm render <jobs.json>')
    }
    const results = await renderJobs(loadJobs(jobsPath))
    for (const r of results) {
        console.error(`rendered ${r.outPath} (${String(r.width)}x${String(r.height)}, ${String(r.bytes)} bytes)`)
    }
}

/* v8 ignore start -- entrypoint glue, exercised via `pnpm render` */
if (process.argv[1]?.endsWith('cli.ts') === true) {
    main().catch((err: unknown) => {
        console.error(err)
        process.exitCode = 1
    })
}
/* v8 ignore stop */
