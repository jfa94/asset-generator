// CLI: pnpm render <jobs.json>
// jobs.json: RenderJobFile[] — flat render specs with cssPaths/logoPath/imagePath file refs
// instead of inlined content; this CLI inlines them and renders.

import {readFileSync} from 'node:fs'
import {renderJobs, type RenderJob} from '@/services/render/render'
import type {LockupFonts} from '@/lib/lockups/lockups'
import type {LockupCopy, LockupId, Palette, SafeZone} from '@/types/creative'
import {mimeFor} from '@/utils/mime'

export interface RenderJobFile {
    lockup: LockupId
    palette: Palette
    copy: LockupCopy
    width: number
    height: number
    safeZone?: SafeZone | undefined
    fonts: LockupFonts
    cssPaths: string[]
    logoPath: string | null
    imagePath: string | null
    outPath: string
}

export const toDataUri = (path: string): string =>
    `data:${mimeFor(path)};base64,${readFileSync(path).toString('base64')}`

export const loadJobs = (jobsJsonPath: string): RenderJob[] => {
    const raw = JSON.parse(readFileSync(jobsJsonPath, 'utf8')) as RenderJobFile[]
    return raw.map((j) => ({
        outPath: j.outPath,
        render: {
            spec: {lockup: j.lockup, palette: j.palette, copy: j.copy},
            width: j.width,
            height: j.height,
            safeZone: j.safeZone,
            fonts: j.fonts,
            cssText: j.cssPaths.map((p) => readFileSync(p, 'utf8')).join('\n'),
            logoDataUri: j.logoPath === null ? null : toDataUri(j.logoPath),
            imageDataUri: j.imagePath === null ? null : toDataUri(j.imagePath),
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
