import {pathToFileURL} from 'node:url'
import {listCopyLimits, UnknownCopyFieldError, UnknownCopyPlatformError} from '@/domain/validation/copyLimits'

const USAGE = 'Usage: pnpm copy-limits [--platform <platform>] [--json]\n'

function parseArgs(
    args: string[]
): {platform: string | undefined; field: string | undefined; json: boolean} | undefined {
    let platform: string | undefined
    let field: string | undefined
    let json = false
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--json' && !json) {
            json = true
            continue
        }
        const value = args[i + 1]
        if (value === undefined || value.startsWith('-')) {
            return undefined
        }
        if (args[i] === '--platform' && platform === undefined) {
            platform = value
        } else if (args[i] === '--field' && field === undefined) {
            field = value
        } else {
            return undefined
        }
        i++
    }
    return {platform, field, json}
}

export function main(args: string[]): number {
    const parsed = parseArgs(args)
    if (parsed === undefined) {
        process.stderr.write(USAGE)
        return 2
    }
    try {
        const limits = listCopyLimits(parsed.platform, parsed.field)
        if (parsed.json) {
            process.stdout.write(`${JSON.stringify({limits})}\n`)
        } else {
            for (const {platform, field, min, max, maxChars} of limits) {
                process.stdout.write(`${platform} ${field} ${String(min)}-${String(max)} ${String(maxChars)}\n`)
            }
        }
    } catch (error) {
        if (!(error instanceof UnknownCopyPlatformError || error instanceof UnknownCopyFieldError)) {
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
