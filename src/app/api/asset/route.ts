import type {NextRequest} from 'next/server'
import {readAsset, RUNS_DIR} from '@/lib/state/store'

export const GET = async (req: NextRequest): Promise<Response> => {
    const run = req.nextUrl.searchParams.get('run') ?? ''
    const file = req.nextUrl.searchParams.get('f') ?? ''
    const bytes = await readAsset(RUNS_DIR, run, file)
    if (bytes === null) {
        return new Response('not found', {status: 404})
    }
    return new Response(new Uint8Array(bytes), {headers: {'content-type': 'image/png'}})
}
