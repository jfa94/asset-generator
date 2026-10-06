export type CopyPlatform = 'rsa' | 'pmax' | 'meta'

// Own-key order is the JSON wire order.
export interface CopyLimit {
    platform: CopyPlatform
    field: string
    min: number
    max: number
    maxChars: number
}

const entry = (platform: CopyPlatform, field: string, min: number, max: number, maxChars: number): CopyLimit =>
    Object.freeze({platform, field, min, max, maxChars})

export const COPY_LIMITS: readonly Readonly<CopyLimit>[] = Object.freeze([
    entry('rsa', 'headlines', 3, 15, 30),
    entry('rsa', 'descriptions', 2, 4, 90),
    entry('rsa', 'paths', 0, 2, 15),
    entry('pmax', 'shortHeadlines', 3, 15, 30),
    entry('pmax', 'longHeadlines', 1, 5, 90),
    entry('pmax', 'descriptions', 2, 5, 90),
    entry('pmax', 'businessName', 1, 1, 25),
    entry('meta', 'primaryTexts', 1, 5, 125),
    entry('meta', 'headlines', 1, 5, 40),
    entry('meta', 'descriptions', 1, 5, 25),
])

const ACCEPTED_PLATFORMS: readonly string[] = [...new Set(COPY_LIMITS.map(({platform}) => platform))]

export class UnknownCopyPlatformError extends Error {
    constructor(value: string) {
        super(`Unknown platform ${JSON.stringify(value)}. Accepted values: ${ACCEPTED_PLATFORMS.join(', ')}.`)
        this.name = 'UnknownCopyPlatformError'
    }
}

export function listCopyLimits(platform?: string): CopyLimit[] {
    if (platform !== undefined && !ACCEPTED_PLATFORMS.includes(platform)) {
        throw new UnknownCopyPlatformError(platform)
    }
    return COPY_LIMITS.filter((limit) => platform === undefined || limit.platform === platform).map(
        ({platform, field, min, max, maxChars}) => ({platform, field, min, max, maxChars})
    )
}
