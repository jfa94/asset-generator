import {pathToFileURL} from 'node:url'
import {listFormats, UnknownPlatformError} from '@/domain/formatCatalogue'

const USAGE = 'Usage: pnpm formats [--platform <platform>] [--json]\n'

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
        const formats = listFormats(parsed.platform)
        if (parsed.json) {
            process.stdout.write(`${JSON.stringify({formats})}\n`)
        } else {
            for (const {platform, name, width, height, aspectRatio} of formats) {
                process.stdout.write(`${platform} ${name} ${String(width)}x${String(height)} ${aspectRatio}\n`)
            }
        }
    } catch (error) {
        if (!(error instanceof UnknownPlatformError)) {
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
