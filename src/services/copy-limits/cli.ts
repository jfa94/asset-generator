import {pathToFileURL} from 'node:url'
import {listCopyLimits} from '@/domain/validation/copyLimits'

const USAGE = 'Usage: pnpm copy-limits [--platform <platform>] [--json]\n'

export function main(args: string[]): number {
    if (args.length > 0) {
        process.stderr.write(USAGE)
        return 2
    }
    for (const {platform, field, min, max, maxChars} of listCopyLimits()) {
        process.stdout.write(`${platform} ${field} ${String(min)}-${String(max)} ${String(maxChars)}\n`)
    }
    return 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exitCode = main(process.argv.slice(2))
}
