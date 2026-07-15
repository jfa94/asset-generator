import {describe, expect, it} from 'vitest'
import {AD_FORMATS, LOGO_SIZE, MAX_IMAGE_BYTES} from '@/domain/formats'

describe('platform specs', () => {
    it('pins the exact ad format list', () => {
        expect(AD_FORMATS).toEqual([
            {platform: 'google-pmax', name: 'landscape', width: 1200, height: 628},
            {platform: 'google-pmax', name: 'square', width: 1200, height: 1200},
            {platform: 'google-pmax', name: 'portrait', width: 960, height: 1200},
            {platform: 'meta', name: 'square', width: 1080, height: 1080},
            {platform: 'meta', name: 'feed', width: 1080, height: 1350},
            {platform: 'meta', name: 'story', width: 1080, height: 1920, safeZone: {top: 0.14, bottom: 0.2}},
        ])
    })

    it('pins logo size and image byte cap', () => {
        expect(LOGO_SIZE).toBe(1200)
        expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024)
    })
})
