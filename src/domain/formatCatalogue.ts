import {AD_FORMATS, type Platform} from '@/domain/formats'
import type {SafeZone} from '@/types/creative'
import type {AdFormatName} from '@/types/run'

// Own-key order is the JSON wire order.
export interface FormatSpec {
    platform: Platform
    name: AdFormatName
    width: number
    height: number
    aspectRatio: string
    safeZone?: SafeZone
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

export function reduceAspectRatio(width: number, height: number): string {
    for (const side of [width, height]) {
        if (!Number.isSafeInteger(side) || side <= 0) {
            throw new RangeError(`Aspect ratio sides must be positive safe integers, received ${String(side)}`)
        }
    }
    const divisor = gcd(width, height)
    return `${String(width / divisor)}:${String(height / divisor)}`
}

const ACCEPTED_PLATFORMS: readonly string[] = [...new Set(AD_FORMATS.map(({platform}) => platform))]

export class UnknownPlatformError extends Error {
    constructor(value: string) {
        super(`Unknown platform ${JSON.stringify(value)}. Accepted values: ${ACCEPTED_PLATFORMS.join(', ')}.`)
        this.name = 'UnknownPlatformError'
    }
}

export class InvalidAspectRatioError extends Error {
    constructor(value: string) {
        super(`Invalid aspect ratio ${JSON.stringify(value)}. Expected W:H with positive integers, for example 9:16.`)
        this.name = 'InvalidAspectRatioError'
    }
}

const ASPECT_RATIO_PATTERN = /^(\d+):(\d+)$/

function parseAspectRatio(value: string): string {
    const match = ASPECT_RATIO_PATTERN.exec(value)
    const width = Number(match?.[1])
    const height = Number(match?.[2])
    if (match === null || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
        throw new InvalidAspectRatioError(value)
    }
    return reduceAspectRatio(width, height)
}

export function listFormats(platform?: string, aspectRatio?: string): FormatSpec[] {
    if (platform !== undefined && !ACCEPTED_PLATFORMS.includes(platform)) {
        throw new UnknownPlatformError(platform)
    }
    const wanted = aspectRatio === undefined ? undefined : parseAspectRatio(aspectRatio)
    return AD_FORMATS.filter((format) => platform === undefined || format.platform === platform)
        .map(({platform, name, width, height, safeZone}) => {
            const spec: FormatSpec = {platform, name, width, height, aspectRatio: reduceAspectRatio(width, height)}
            if (safeZone !== undefined) {
                spec.safeZone = {top: safeZone.top, bottom: safeZone.bottom}
            }
            return spec
        })
        .filter((spec) => wanted === undefined || spec.aspectRatio === wanted)
}
