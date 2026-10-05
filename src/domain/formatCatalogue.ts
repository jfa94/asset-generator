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

export function listFormats(): FormatSpec[] {
    return AD_FORMATS.map(({platform, name, width, height, safeZone}) => {
        const spec: FormatSpec = {platform, name, width, height, aspectRatio: reduceAspectRatio(width, height)}
        if (safeZone !== undefined) {
            spec.safeZone = {top: safeZone.top, bottom: safeZone.bottom}
        }
        return spec
    })
}
