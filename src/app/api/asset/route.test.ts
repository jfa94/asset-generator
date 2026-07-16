import type {NextRequest} from 'next/server'
import {beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('@/lib/state/store', () => ({
    RUNS_DIR: '/runs',
    readAsset: vi.fn(),
}))

import {GET} from '@/app/api/asset/route'
import {readAsset} from '@/lib/state/store'

const mockReadAsset = vi.mocked(readAsset)

const req = (query: string): NextRequest => ({nextUrl: new URL(`http://x/api/asset${query}`)}) as unknown as NextRequest

describe('asset GET', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('404s when the asset is missing or the path escapes', async () => {
        mockReadAsset.mockResolvedValue(null)
        const res = await GET(req('?run=r1&f=../etc/passwd'))
        expect(res.status).toBe(404)
        expect(mockReadAsset).toHaveBeenCalledWith('/runs', 'r1', '../etc/passwd')
    })

    it('defaults missing params to empty strings', async () => {
        mockReadAsset.mockResolvedValue(null)
        expect((await GET(req(''))).status).toBe(404)
        expect(mockReadAsset).toHaveBeenCalledWith('/runs', '', '')
    })

    it('serves the bytes as image/png', async () => {
        mockReadAsset.mockResolvedValue(Buffer.from('png-bytes'))
        const res = await GET(req('?run=r1&f=assets/v1.png'))
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe('image/png')
        expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('png-bytes')
    })
})
