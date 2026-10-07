// @vitest-environment node

import {spawnSync} from 'node:child_process'
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {CopyShapeError, validateCopy} from '@/domain/validation/copy'
import {validateCopyBatch} from '@/domain/validation/batch'
import {summarizeBatch} from '@/domain/validation/batchSummary'
import {main} from './cli'

interface CommandResult {
    code: number | null | undefined
    stdout: string
    stderr: string
}

const projectRoot = resolve(import.meta.dirname, '../../..')
const cliPath = join(projectRoot, 'src/services/validate-copy/cli.ts')
const tsxLoader = pathToFileURL(join(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href
const slowTimeout = 30000

const USAGE = 'Usage: pnpm validate-copy <file.json>\n' + '       pnpm validate-copy --batch <file.json> [--summary]\n'

const rsaCopy = {
    headlines: ['Stop paying for privacy', 'Delete your data for good', 'One purchase, zero renewals'],
    descriptions: [
        'Remove your personal data from broker sites with a single one-time purchase.',
        'No subscriptions, no surprises. Own your privacy tooling outright.',
    ],
    paths: ['privacy', 'pricing'],
}

const pmaxCopy = {
    shortHeadlines: ['Own your privacy', 'No renewals, ever', 'Data brokers, gone'],
    longHeadlines: ['Remove your data from broker sites with one purchase'],
    descriptions: [
        'One-time purchase, lifetime privacy. No subscription required.',
        'We file the removals so you never have to think about it.',
    ],
    businessName: 'GoodbyeSpy',
}

const metaCopy = {
    primaryTexts: ['Take your name off the data-broker lists for good.'],
    headlines: ['Own your privacy'],
    descriptions: ['Own it outright'],
}

const allValidBatch = {
    entries: [
        {id: 'rsa-one', platform: 'rsa', copy: rsaCopy},
        {id: 'pmax-two', platform: 'pmax', copy: pmaxCopy},
        {id: 'meta-three', platform: 'meta', copy: metaCopy},
    ],
}

const ruleViolatingBatch = {
    entries: [
        {id: 'zebra', platform: 'rsa', copy: {...rsaCopy, headlines: [], descriptions: []}},
        {id: 'alpha', platform: 'pmax', copy: pmaxCopy},
        {id: 'middle', platform: 'meta', copy: {...metaCopy, primaryTexts: []}},
    ],
}

// One valid rsa entry, one meta entry missing primaryTexts, one missing primaryTexts and headlines.
const rsaPlusTwoMetaBatch = {
    entries: [
        {id: 'rsa-ok', platform: 'rsa', copy: rsaCopy},
        {id: 'meta-no-primary', platform: 'meta', copy: {...metaCopy, primaryTexts: []}},
        {id: 'meta-no-primary-no-headline', platform: 'meta', copy: {...metaCopy, primaryTexts: [], headlines: []}},
    ],
}

const rsaPlusTwoMetaStdout =
    '{"entries":3,"valid":1,"invalid":2,"issuesByField":[{"field":"primaryTexts","count":2},{"field":"headlines","count":1}]}\n'

let fixtureDirectory: string

beforeEach(() => {
    fixtureDirectory = mkdtempSync(join(tmpdir(), 'validate-copy-summary-test-'))
})

afterEach(() => {
    vi.restoreAllMocks()
    rmSync(fixtureDirectory, {recursive: true})
})

function saveJson(name: string, value: unknown): string {
    const path = join(fixtureDirectory, name)
    writeFileSync(path, JSON.stringify(value), 'utf8')
    return path
}

function saveBatch(batch: unknown): string {
    return saveJson('campaign batch.json', batch)
}

function expectedSummaryStdout(path: string): string {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return `${JSON.stringify(summarizeBatch(validateCopyBatch(parsed)))}\n`
}

function shapeErrorMessage(batch: unknown): string {
    try {
        validateCopyBatch(batch)
    } catch (error) {
        if (error instanceof CopyShapeError) {
            return error.message
        }
        throw error
    }
    throw new Error('expected validateCopyBatch to reject this batch with a CopyShapeError')
}

function runNode(args: string[]): CommandResult {
    // Fixed Node executable, argument vector, no shell; paths are isolated test fixtures.
    const result = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, ...args], {
        cwd: projectRoot,
        env: {...process.env, TSX_TSCONFIG_PATH: join(projectRoot, 'tsconfig.json')},
        encoding: 'utf8',
        timeout: 10000,
    })
    if (result.error !== undefined) {
        throw result.error
    }
    expect(result.signal).toBeNull()
    return {code: result.status, stdout: result.stdout, stderr: result.stderr}
}

async function runAdapter(args: string[]): Promise<CommandResult> {
    let stdout = ''
    let stderr = ''
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        stdout += String(chunk)
        return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderr += String(chunk)
        return true
    })
    try {
        const code = await Promise.resolve(main(args))
        return {code, stdout, stderr}
    } finally {
        vi.restoreAllMocks()
    }
}

function runPackageScript(args: string[]): CommandResult {
    // Literal package-manager executable and command, fixture paths as arguments; no shell.
    const result = spawnSync('pnpm', ['--silent', 'validate-copy', ...args], {
        cwd: projectRoot,
        // Stryker links installed dependencies; package tests must not reinstall that shared tree.
        env: {...process.env, pnpm_config_verify_deps_before_run: 'false'},
        encoding: 'utf8',
        timeout: 20000,
    })
    if (result.error !== undefined) {
        throw result.error
    }
    expect(result.signal).toBeNull()
    return {code: result.status, stdout: result.stdout, stderr: result.stderr}
}

const summaryForms: {name: string; build: (path: string) => string[]}[] = [
    {name: '--batch F --summary', build: (path) => ['--batch', path, '--summary']},
    {name: '--summary --batch F', build: (path) => ['--summary', '--batch', path]},
]

interface UsagePaths {
    first: string
    second: string
}

const summaryUsageCases: {name: string; build: (paths: UsagePaths) => string[]}[] = [
    {name: '--summary alone', build: () => ['--summary']},
    {name: '--summary F', build: ({first}) => ['--summary', first]},
    {name: 'F --summary', build: ({first}) => [first, '--summary']},
    {name: '--batch --summary F', build: ({first}) => ['--batch', '--summary', first]},
    {name: '--summary --batch', build: () => ['--summary', '--batch']},
    {name: '--batch F --summary --summary', build: ({first}) => ['--batch', first, '--summary', '--summary']},
    {name: '--summary --summary --batch F', build: ({first}) => ['--summary', '--summary', '--batch', first]},
    {name: '--summary --batch F --summary', build: ({first}) => ['--summary', '--batch', first, '--summary']},
    {name: '--batch F --summary F2', build: ({first, second}) => ['--batch', first, '--summary', second]},
    {name: '--batch F --summary=true', build: ({first}) => ['--batch', first, '--summary=true']},
    {name: '--batch F --Summary', build: ({first}) => ['--batch', first, '--Summary']},
]

function saveUsagePaths(): UsagePaths {
    return {first: saveBatch(allValidBatch), second: saveJson('second batch.json', allValidBatch)}
}

interface FailureCase {
    name: string
    prepare: () => string
    stderr: () => string
}

const readFailureCases: FailureCase[] = [
    {
        name: 'a missing file',
        prepare: () => join(fixtureDirectory, 'missing batch.json'),
        stderr: () => 'Unable to read copy file.\n',
    },
    {
        name: 'a directory path',
        prepare: () => {
            const directory = join(fixtureDirectory, 'a directory.json')
            mkdirSync(directory)
            return directory
        },
        stderr: () => 'Unable to read copy file.\n',
    },
    {
        name: 'malformed JSON',
        prepare: () => {
            const path = join(fixtureDirectory, 'broken batch.json')
            writeFileSync(path, '{"entries":[{"id":"rsa-one",', 'utf8')
            return path
        },
        stderr: () => 'Copy file must contain valid JSON.\n',
    },
    {
        name: 'empty entries',
        prepare: () => saveBatch({entries: []}),
        stderr: () => `${shapeErrorMessage({entries: []})}\n`,
    },
    {
        name: 'a duplicate id',
        prepare: () => saveBatch({entries: [...allValidBatch.entries, {...allValidBatch.entries[0]}]}),
        stderr: () => `${shapeErrorMessage({entries: [...allValidBatch.entries, {...allValidBatch.entries[0]}]})}\n`,
    },
]

describe.each([
    {name: 'in-process adapter', run: runAdapter},
    {name: 'actual Node/tsx entry point', run: runNode},
])('$name --summary [sum-002]', ({run}) => {
    it.each(summaryForms)(
        '$name on an all-valid batch exits 0 with exactly the compact summary line',
        async ({build}) => {
            const path = saveBatch(allValidBatch)
            const result = await run(build(path))
            expect(result).toEqual({
                code: 0,
                stdout: '{"entries":3,"valid":3,"invalid":0,"issuesByField":[]}\n',
                stderr: '',
            })
            expect(result.stdout).toBe(expectedSummaryStdout(path))
        },
        slowTimeout
    )

    it.each([
        {name: 'an all-valid batch', batch: allValidBatch},
        {name: 'a rule-violating batch', batch: ruleViolatingBatch},
    ])(
        '--summary --batch F prints the same bytes and code as --batch F --summary for $name',
        async ({batch}) => {
            const path = saveBatch(batch)
            const after = await run(['--batch', path, '--summary'])
            const before = await run(['--summary', '--batch', path])
            expect(after.stdout).toBe(expectedSummaryStdout(path))
            expect(before).toEqual(after)
        },
        slowTimeout
    )

    it.each(summaryForms)(
        '$name on a rule-violating batch exits 1 with one JSON line keyed entries, valid, invalid, issuesByField',
        async ({build}) => {
            const path = saveBatch(ruleViolatingBatch)
            const result = await run(build(path))
            expect(result.code).toBe(1)
            expect(result.stderr).toBe('')
            const lines = result.stdout.split('\n')
            expect(lines).toHaveLength(2)
            expect(lines[1]).toBe('')
            const parsed = JSON.parse(lines[0] ?? '') as Record<string, unknown>
            expect(Object.keys(parsed)).toEqual(['entries', 'valid', 'invalid', 'issuesByField'])
            expect(lines[0]).toBe(JSON.stringify(parsed))
            expect(result.stdout).toBe(expectedSummaryStdout(path))
            expect(parsed).toEqual({
                entries: 3,
                valid: 1,
                invalid: 2,
                issuesByField: [
                    {field: 'descriptions', count: 1},
                    {field: 'headlines', count: 1},
                    {field: 'primaryTexts', count: 1},
                ],
            })
        },
        slowTimeout
    )

    it.each(summaryForms)(
        '$name on the rsa plus two meta batch prints primaryTexts 2 ahead of headlines 1 and exits 1',
        async ({build}) => {
            const result = await run(build(saveBatch(rsaPlusTwoMetaBatch)))
            expect(result).toEqual({code: 1, stdout: rsaPlusTwoMetaStdout, stderr: ''})
        },
        slowTimeout
    )

    it.each(summaryUsageCases)(
        'rejects $name with exit 2, empty stdout and the --batch usage stderr',
        async ({build}) => {
            const reference = await run(['--batch'])
            expect(reference).toEqual({code: 2, stdout: '', stderr: USAGE})
            const result = await run(build(saveUsagePaths()))
            expect(result).toEqual({code: 2, stdout: '', stderr: reference.stderr})
        },
        slowTimeout
    )

    it(
        'prints the exact two-line usage diagnostic with [--summary] only on line 2',
        async () => {
            const result = await run(['--batch'])
            expect(result).toEqual({code: 2, stdout: '', stderr: USAGE})
            const lines = result.stderr.split('\n')
            expect(lines).toEqual([
                'Usage: pnpm validate-copy <file.json>',
                '       pnpm validate-copy --batch <file.json> [--summary]',
                '',
            ])
            expect(lines[0]).not.toContain('--batch')
            expect(lines[0]).not.toContain('--summary')
            expect(await run([])).toEqual(result)
        },
        slowTimeout
    )

    describe.each(summaryForms)('$name failure paths', ({build}) => {
        it.each(readFailureCases)(
            'exits 2 for $name with empty stdout and the same stderr as plain --batch',
            async ({prepare, stderr}) => {
                const path = prepare()
                const expected = {code: 2, stdout: '', stderr: stderr()}
                const summary = await run(build(path))
                expect(summary).toEqual(expected)
                expect(await run(['--batch', path])).toEqual(summary)
            },
            slowTimeout
        )
    })

    it(
        'keeps single-file output unchanged for valid and rule-violating copy',
        async () => {
            const valid = {platform: 'meta', copy: metaCopy}
            const invalid = {platform: 'meta', copy: {...metaCopy, primaryTexts: []}}
            expect(await run([saveJson('valid copy.json', valid)])).toEqual({
                code: 0,
                stdout: `${JSON.stringify(validateCopy(valid))}\n`,
                stderr: '',
            })
            expect(await run([saveJson('invalid copy.json', invalid)])).toEqual({
                code: 1,
                stdout: `${JSON.stringify(validateCopy(invalid))}\n`,
                stderr: '',
            })
        },
        slowTimeout
    )

    it(
        'keeps plain --batch output unchanged for valid and rule-violating batches',
        async () => {
            const validPath = saveJson('valid batch.json', allValidBatch)
            const invalidPath = saveJson('invalid batch.json', ruleViolatingBatch)
            expect(await run(['--batch', validPath])).toEqual({
                code: 0,
                stdout: `${JSON.stringify(validateCopyBatch(allValidBatch))}\n`,
                stderr: '',
            })
            expect(await run(['--batch', invalidPath])).toEqual({
                code: 1,
                stdout: `${JSON.stringify(validateCopyBatch(ruleViolatingBatch))}\n`,
                stderr: '',
            })
        },
        slowTimeout
    )
})

describe('in-process adapter and entry point agree [sum-002]', () => {
    it.each([
        {name: 'an all-valid batch', batch: allValidBatch, code: 0},
        {name: 'a rule-violating batch', batch: ruleViolatingBatch, code: 1},
        {name: 'the rsa plus two meta batch', batch: rsaPlusTwoMetaBatch, code: 1},
    ])(
        'gives identical summary results for $name in both argv forms',
        async ({batch, code}) => {
            const path = saveBatch(batch)
            for (const {build} of summaryForms) {
                const adapter = await runAdapter(build(path))
                expect(adapter).toEqual({code, stdout: expectedSummaryStdout(path), stderr: ''})
                expect(runNode(build(path))).toEqual(adapter)
            }
        },
        slowTimeout
    )

    it(
        'gives identical usage results for a --summary usage error',
        async () => {
            const adapter = await runAdapter(['--summary'])
            expect(adapter).toEqual({code: 2, stdout: '', stderr: USAGE})
            expect(runNode(['--summary'])).toEqual(adapter)
        },
        slowTimeout
    )
})

describe('package script --summary [sum-002]', () => {
    it(
        'pnpm --silent validate-copy --batch F --summary exits 1 with one JSON summary line on a rule-violating batch',
        () => {
            const path = saveBatch(rsaPlusTwoMetaBatch)
            const result = runPackageScript(['--batch', path, '--summary'])
            expect(result).toEqual({code: 1, stdout: rsaPlusTwoMetaStdout, stderr: ''})
            expect(result.stdout.split('\n')).toHaveLength(2)
            expect(result.stdout).toBe(expectedSummaryStdout(path))
        },
        slowTimeout
    )
})

describe('summary runs write no file [sum-002]', () => {
    it(
        'gives byte-identical stdout twice through the entry point and leaves bytes and listing unchanged',
        () => {
            const path = saveBatch(rsaPlusTwoMetaBatch)
            const before = readFileSync(path)
            const listing = readdirSync(fixtureDirectory).sort()
            expect(listing).toEqual(['campaign batch.json'])
            const first = runNode(['--batch', path, '--summary'])
            const second = runNode(['--summary', '--batch', path])
            expect(first).toEqual({code: 1, stdout: rsaPlusTwoMetaStdout, stderr: ''})
            expect(second.stdout).toBe(first.stdout)
            expect(second).toEqual(first)
            expect(readFileSync(path)).toEqual(before)
            expect(readdirSync(fixtureDirectory).sort()).toEqual(listing)
        },
        slowTimeout
    )
})
