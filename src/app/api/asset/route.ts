import type {NextRequest} from 'next/server'
import {readAsset, RUNS_DIR} from '@/lib/state/store'
import {mimeFor} from '@/utils/mime'

export const GET = async (req: NextRequest): Promise<Response> => {
    const run = req.nextUrl.searchParams.get('run') ?? ''
    const file = req.nextUrl.searchParams.get('f') ?? ''
    const bytes = await readAsset(RUNS_DIR, run, file)
    if (bytes === null) {
        return new Response('not found', {status: 404})
    }
    // Run-dir files come from arbitrary target repos: sandbox blocks script execution
    // (e.g. a malicious SVG opened directly) without breaking <img>/<link> subresource use.
    return new Response(new Uint8Array(bytes), {
        headers: {
            'content-type': mimeFor(file),
            'x-content-type-options': 'nosniff',
            'content-security-policy': 'sandbox',
        },
    })
}
