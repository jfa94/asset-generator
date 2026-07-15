import {existsSync} from 'node:fs'
import {extractFromCss} from '@/lib/brandkit/cssFallback'
import {extractFromManifest} from '@/lib/brandkit/manifest'
import type {BrandKit} from '@/lib/brandkit/types'

/**
 * Extract a BrandKit from a product repo: Claude-Design design-system docs when
 * present, otherwise the repo's global stylesheet. Throws when neither exists.
 */
export const extractBrandKit = (repoPath: string): BrandKit => {
    if (!existsSync(repoPath)) {
        throw new Error(`Repo not found: ${repoPath}`)
    }
    const kit = extractFromManifest(repoPath) ?? extractFromCss(repoPath)
    if (kit === null) {
        throw new Error(
            `No design system found in ${repoPath}: expected docs/design-system/_ds_manifest.json or a globals.css`
        )
    }
    return kit
}
