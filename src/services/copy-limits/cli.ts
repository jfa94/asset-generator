import {pathToFileURL} from 'node:url'
import {listCopyLimits, UnknownCopyPlatformError} from '@/domain/validation/copyLimits'

const USAGE = 'Usage: pnpm copy-limits [--platform <platform>] [--json]\n'

function parseArgs(args: string[]): {platform: string | undefined; json: boolean} | undefined {
    let platform: string | undefined
    let json = false
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--json' && !json) {
            json = true
            continue
        }
        const value = args[i + 1]
        if (args[i] !== '--platform' || platform !== undefined || value === undefined || value.startsWith('-')) {
            return undefined
        }
        platform = value
        i++
    }
    return {platform, json}
}

export function main(args: string[]): number {
    const parsed = parseArgs(args)
    if (parsed === undefined) {
        process.stderr.write(USAGE)
        return 2
    }
    try {
        const limits = listCopyLimits(parsed.platform)
        if (parsed.json) {
            process.stdout.write(`${JSON.stringify({limits})}\n`)
        } else {
            for (const {platform, field, min, max, maxChars} of limits) {
                process.stdout.write(`${platform} ${field} ${String(min)}-${String(max)} ${String(maxChars)}\n`)
            }
        }
    } catch (error) {
        if (!(error instanceof UnknownCopyPlatformError)) {
            throw error
        }
        process.stderr.write(`${error.message}\n`)
        return 2
    }
    return 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exitCode = main(process.argv.slice(2))
}
