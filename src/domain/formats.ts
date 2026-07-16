// Platform image specs from the static-asset playbook / creative best-practices reports.

import type {AdFormatName} from '@/types/run'

export type Platform = 'google-pmax' | 'meta'

export interface SafeZone {
    /** fraction of height to keep clear at the top (platform UI chrome) */
    top: number
    /** fraction of height to keep clear at the bottom (CTA sticker area) */
    bottom: number
}

export interface AdFormat {
    platform: Platform
    name: AdFormatName
    width: number
    height: number
    safeZone?: SafeZone
}

export const AD_FORMATS: AdFormat[] = [
    {platform: 'google-pmax', name: 'landscape', width: 1200, height: 628},
    {platform: 'google-pmax', name: 'square', width: 1200, height: 1200},
    {platform: 'google-pmax', name: 'portrait', width: 960, height: 1200},
    {platform: 'meta', name: 'square', width: 1080, height: 1080},
    {platform: 'meta', name: 'feed', width: 1080, height: 1350},
    {platform: 'meta', name: 'story', width: 1080, height: 1920, safeZone: {top: 0.14, bottom: 0.2}},
]

/** PMax requires a square logo asset. */
export const LOGO_SIZE = 1200

/** Google responsive formats reject files above this. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
