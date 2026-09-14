import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {CopyShapeError, validateCopy} from '@/domain/validation/copy'
import {validateCopyBatch} from '@/domain/validation/batch'

const USAGE = 'Usage: pnpm validate-copy <file.json>\n       pnpm validate-copy --batch <file.json>\n'

export function main(args: string[]): number {
    const isBatch = args[0] === '--batch'
    const path = isBatch ? args[1] : args[0]
    const validUsage = isBatch ? args.length === 2 : args.length === 1
    if (!validUsage || path === undefined || path.startsWith('-')) {
        process.stderr.write(USAGE)
        return 2
    }

    let text: string
    try {
        text = readFileSync(path, 'utf8')
    } catch {
        process.stderr.write('Unable to read copy file.\n')
        return 2
    }

    let input: unknown
    try {
        input = JSON.parse(text)
    } catch {
        process.stderr.write('Copy file must contain valid JSON.\n')
        return 2
    }

    try {
        if (isBatch) {
            const result = validateCopyBatch(input)
            process.stdout.write(`${JSON.stringify(result)}\n`)
            return result.valid ? 0 : 1
        }
        const result = validateCopy(input)
        process.stdout.write(`${JSON.stringify(result)}\n`)
        return result.valid ? 0 : 1
    } catch (error) {
        if (!(error instanceof CopyShapeError)) {
            throw error
        }
        process.stderr.write(`${error.message}\n`)
        return 2
    }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exitCode = main(process.argv.slice(2))
}
