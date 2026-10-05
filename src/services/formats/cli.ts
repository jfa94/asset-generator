import {pathToFileURL} from 'node:url'
import {listFormats, UnknownPlatformError} from '@/domain/formatCatalogue'

const USAGE = 'Usage: pnpm formats [--platform <platform>] [--json]\n'

function parsePlatform(args: string[]): {platform: string | undefined} | undefined {
    let platform: string | undefined
    for (let i = 0; i < args.length; i++) {
        const value = args[i + 1]
        if (args[i] !== '--platform' || platform !== undefined || value === undefined || value.startsWith('-')) {
            return undefined
        }
        platform = value
        i++
    }
    return {platform}
}

export function main(args: string[]): number {
    const parsed = parsePlatform(args)
    if (parsed === undefined) {
        process.stderr.write(USAGE)
        return 2
    }
    try {
        for (const {platform, name, width, height, aspectRatio} of listFormats(parsed.platform)) {
            process.stdout.write(`${platform} ${name} ${String(width)}x${String(height)} ${aspectRatio}\n`)
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
