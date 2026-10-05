import {pathToFileURL} from 'node:url'
import {listFormats} from '@/domain/formatCatalogue'

const USAGE = 'Usage: pnpm formats [--platform <platform>] [--json]\n'

export function main(args: string[]): number {
    if (args.length > 0) {
        process.stderr.write(USAGE)
        return 2
    }
    for (const {platform, name, width, height, aspectRatio} of listFormats()) {
        process.stdout.write(`${platform} ${name} ${String(width)}x${String(height)} ${aspectRatio}\n`)
    }
    return 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exitCode = main(process.argv.slice(2))
}
