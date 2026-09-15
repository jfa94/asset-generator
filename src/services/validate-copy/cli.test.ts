// @vitest-environment node

import {spawnSync} from 'node:child_process'
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {CopyShapeError, validateCopy, type CopyIssue} from '@/domain/validation/copy'
import {validateCopyBatch} from '@/domain/validation/batch'

interface CommandResult {
    code: number | null | undefined
    stdout: string
    stderr: string
}

interface CliModule {
    main: (args: string[]) => number | Promise<number>
}

declare global {
    interface ImportMeta {
        glob<T>(pattern: string): Record<string, () => Promise<T>>
    }
}

// A lazy glob lets RED reach assertions about command results before cli.ts exists.
// Once implemented, the same call executes the real adapter under V8 coverage.
const cliModules = import.meta.glob<CliModule>('./cli.ts')
const projectRoot = resolve(import.meta.dirname, '../../..')
const cliPath = join(projectRoot, 'src/services/validate-copy/cli.ts')
const tsxLoader = pathToFileURL(join(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href

const validInputs = [
    {
        platform: 'rsa',
        copy: {
            headlines: ['Own your privacy', 'No renewals, ever', 'Data brokers, gone'],
            descriptions: ['Buy once and keep control.', 'Remove your personal data.'],
            paths: [],
        },
    },
    {
        platform: 'pmax',
        copy: {
            shortHeadlines: ['Own your privacy', 'No renewals, ever', 'Data brokers, gone'],
            longHeadlines: ['Remove your data with one purchase'],
            descriptions: ['Buy once and keep control.', 'Remove your personal data.'],
            businessName: 'GoodbyeSpy',
        },
    },
    {
        platform: 'meta',
        copy: {primaryTexts: ['Café ☕ — privacy for you.'], headlines: ['Own your data'], descriptions: ['Buy once']},
    },
]

const invalidInputs = [
    {name: 'rsa empty', input: {platform: 'rsa', copy: {headlines: [], descriptions: [], paths: []}}},
    {
        name: 'pmax empty',
        input: {platform: 'pmax', copy: {shortHeadlines: [], longHeadlines: [], descriptions: [], businessName: ''}},
    },
    {name: 'meta empty', input: {platform: 'meta', copy: {primaryTexts: [], headlines: [], descriptions: []}}},
    {
        name: 'rsa overlong',
        input: {
            platform: 'rsa',
            copy: {...validInputs[0]?.copy, headlines: ['x'.repeat(31), 'No renewals, ever', 'Data brokers, gone']},
        },
    },
    {name: 'pmax overlong', input: {platform: 'pmax', copy: {...validInputs[1]?.copy, businessName: 'x'.repeat(26)}}},
    {
        name: 'meta overlong',
        input: {platform: 'meta', copy: {...validInputs[2]?.copy, primaryTexts: ['x'.repeat(126)]}},
    },
]

const shapeErrors = [
    {name: 'null', input: null},
    {name: 'array', input: []},
    {name: 'missing platform', input: {copy: {}}},
    {name: 'unknown platform', input: {platform: 'email', copy: {}}},
    {name: 'null copy', input: {platform: 'rsa', copy: null}},
    {name: 'array copy', input: {platform: 'meta', copy: []}},
    {name: 'missing field', input: {platform: 'rsa', copy: {headlines: [], descriptions: []}}},
    {name: 'non-string entry', input: {platform: 'meta', copy: {primaryTexts: [1], headlines: [], descriptions: []}}},
    {
        name: 'wrong scalar',
        input: {platform: 'pmax', copy: {shortHeadlines: [], longHeadlines: [], descriptions: [], businessName: 7}},
    },
]

let fixtureDirectory: string

beforeEach(() => {
    fixtureDirectory = mkdtempSync(join(tmpdir(), 'validate-copy-test-'))
})

afterEach(() => {
    vi.restoreAllMocks()
    rmSync(fixtureDirectory, {recursive: true})
})

function saveInput(input: unknown): string {
    const path = join(fixtureDirectory, 'campaign copy.json')
    writeFileSync(path, JSON.stringify(input), 'utf8')
    return path
}

function runNode(args: string[], cwd = projectRoot): CommandResult {
    // Fixed Node executable, argument vector, no shell; paths are isolated test fixtures.

    const result = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, ...args], {
        cwd,
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
        const module = await cliModules['./cli.ts']?.()
        const code = await module?.main(args)
        return {code, stdout, stderr}
    } finally {
        vi.restoreAllMocks()
    }
}

function expectDiagnostic(result: CommandResult): void {
    expect(result.code).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr.trim().length).toBeGreaterThan(0)
    expect(result.stderr.length).toBeLessThan(1500)
    expect(result.stderr).not.toMatch(/\n\s+at\s/)
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND')
}

describe.each([
    {name: 'in-process adapter', run: runAdapter},
    {name: 'actual Node/tsx entry point', run: runNode},
])('$name', ({run}) => {
    it.each(validInputs)('accepts valid $platform copy', async (input) => {
        const result = await run([saveInput(input)])
        expect(result).toEqual({
            code: 0,
            stdout: `${JSON.stringify({platform: input.platform, valid: true, issues: []})}\n`,
            stderr: '',
        })
    })

    it.each(invalidInputs)('reports platform issues for $name', async ({input}) => {
        const expected = validateCopy(input)
        expect(expected.valid).toBe(false)
        expect(expected.issues.length).toBeGreaterThan(0)
        expect(await run([saveInput(input)])).toEqual({code: 1, stdout: `${JSON.stringify(expected)}\n`, stderr: ''})
    })

    it.each(shapeErrors)('rejects $name as a shape error', async ({input}) => {
        expectDiagnostic(await run([saveInput(input)]))
    })

    it('rejects malformed JSON', async () => {
        const path = join(fixtureDirectory, 'broken.json')
        writeFileSync(path, '{"platform":', 'utf8')
        expectDiagnostic(await run([path]))
    })

    it('reports a nonexistent file', async () => {
        expectDiagnostic(await run([join(fixtureDirectory, 'missing.json')]))
    })

    it('reports a directory as an unreadable file', async () => {
        expectDiagnostic(await run([fixtureDirectory]))
    })

    it.each([
        {name: 'missing arguments', args: []},
        {name: 'extra paths', args: ['one.json', 'two.json']},
        {name: 'unsupported option', args: ['--unknown']},
        {name: 'option with path', args: ['--unknown', 'one.json']},
    ])('rejects $name with usage', async ({args}) => {
        const result = await run(args)
        expectDiagnostic(result)
        expect(result.stderr).toMatch(/usage/i)
    })

    it('preserves UTF-8 bytes and directory contents across repeated validation of a spaced path', async () => {
        const input = validInputs[2]
        const path = saveInput(input)
        const before = readFileSync(path)
        const entries = readdirSync(fixtureDirectory).sort()
        const first = await run([path])
        expect(first).toEqual({
            code: 0,
            stdout: `${JSON.stringify({platform: 'meta', valid: true, issues: []})}\n`,
            stderr: '',
        })
        expect(await run([path])).toEqual(first)
        expect(readFileSync(path)).toEqual(before)
        expect(readdirSync(fixtureDirectory).sort()).toEqual(entries)
    })
})

it('resolves a relative input path against the caller working directory', () => {
    saveInput(validInputs[2])
    expect(runNode(['campaign copy.json'], fixtureDirectory)).toEqual({
        code: 0,
        stdout: '{"platform":"meta","valid":true,"issues":[]}\n',
        stderr: '',
    })
})

it('can be imported by a different cli.ts process without command I/O or exit', () => {
    const importer = join(fixtureDirectory, 'cli.ts')
    writeFileSync(
        importer,
        `import(${JSON.stringify(pathToFileURL(cliPath).href)}).then(() => process.stdout.write('imported\\n'))`,
        'utf8'
    )
    // Fixed Node executable and literal test program, without a shell.

    const result = spawnSync(process.execPath, ['--import', tsxLoader, importer], {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 10000,
    })
    if (result.error !== undefined) {
        throw result.error
    }
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('imported\n')
    expect(result.stderr).toBe('')
})

describe('silent package script', () => {
    it.each([
        {name: 'valid copy', input: validInputs[2], code: 0},
        {name: 'platform-invalid copy', input: invalidInputs[2]?.input, code: 1},
        {name: 'shape-invalid copy', input: null, code: 2},
    ])(
        'wires pnpm --silent validate-copy for $name',
        ({input, code}) => {
            const path = saveInput(input)
            // Literal package-manager executable and command, fixture path as an argument; no shell.

            const result = spawnSync('pnpm', ['--silent', 'validate-copy', path], {
                cwd: projectRoot,
                // Stryker links installed dependencies; package tests must not reinstall that shared tree.
                env: {...process.env, pnpm_config_verify_deps_before_run: 'false'},
                encoding: 'utf8',
                timeout: 15000,
            })
            if (result.error !== undefined) {
                throw result.error
            }
            const actual = {code: result.status, stdout: result.stdout, stderr: result.stderr}
            if (code === 2) {
                expectDiagnostic(actual)
            } else {
                expect(actual).toEqual({code, stdout: `${JSON.stringify(validateCopy(input))}\n`, stderr: ''})
            }
        },
        20000
    )
})

// --- batch-003: pnpm validate-copy --batch <file.json>, exit codes 0 and 1 ---

interface BatchEntryPayload {
    id: string
    platform: string
    valid: boolean
    issues: CopyIssue[]
}

interface BatchPayload {
    valid: boolean
    results: BatchEntryPayload[]
}

const batchRsaCopy = {
    headlines: ['Stop paying for privacy', 'Delete your data for good', 'One purchase, zero renewals'],
    descriptions: [
        'Remove your personal data from broker sites with a single one-time purchase.',
        'No subscriptions, no surprises. Own your privacy tooling outright.',
    ],
    paths: ['privacy', 'pricing'],
}

const batchPmaxCopy = {
    shortHeadlines: ['Own your privacy', 'No renewals, ever', 'Data brokers, gone'],
    longHeadlines: ['Remove your data from broker sites with one purchase'],
    descriptions: [
        'One-time purchase, lifetime privacy. No subscription required.',
        'We file the removals so you never have to think about it.',
    ],
    businessName: 'GoodbyeSpy',
}

const batchMetaCopy = {
    primaryTexts: ['Take your name off the data-broker lists for good.'],
    headlines: ['Own your privacy'],
    descriptions: ['Own it outright'],
}

const rsaBatchEntry = {id: 'rsa-one', platform: 'rsa', copy: batchRsaCopy}
const pmaxBatchEntry = {id: 'pmax-two', platform: 'pmax', copy: batchPmaxCopy}
const metaBatchEntry = {id: 'meta-three', platform: 'meta', copy: batchMetaCopy}

const allValidBatch = {entries: [rsaBatchEntry, pmaxBatchEntry, metaBatchEntry]}
const allValidPayload: BatchPayload = {
    valid: true,
    results: [
        {id: 'rsa-one', platform: 'rsa', valid: true, issues: []},
        {id: 'pmax-two', platform: 'pmax', valid: true, issues: []},
        {id: 'meta-three', platform: 'meta', valid: true, issues: []},
    ],
}

// Index 0 breaks two rsa count rules, index 2 breaks one meta count rule, index 1 is valid:
// a rule violation must never abort the pass and every issue of every entry must be reported.
const twoIssueRsaCopy = {...batchRsaCopy, headlines: [], descriptions: []}
const oneIssueMetaCopy = {...batchMetaCopy, primaryTexts: []}
const mixedBatch = {
    entries: [
        {id: 'zebra', platform: 'rsa', copy: twoIssueRsaCopy},
        {id: 'alpha', platform: 'pmax', copy: batchPmaxCopy},
        {id: 'middle', platform: 'meta', copy: oneIssueMetaCopy},
    ],
}
const mixedPayload: BatchPayload = {
    valid: false,
    results: [
        {
            id: 'zebra',
            platform: 'rsa',
            valid: false,
            issues: validateCopy({platform: 'rsa', copy: twoIssueRsaCopy}).issues,
        },
        {id: 'alpha', platform: 'pmax', valid: true, issues: []},
        {
            id: 'middle',
            platform: 'meta',
            valid: false,
            issues: validateCopy({platform: 'meta', copy: oneIssueMetaCopy}).issues,
        },
    ],
}

function saveBatch(batch: unknown): string {
    const path = join(fixtureDirectory, 'campaign batch.json')
    writeFileSync(path, JSON.stringify(batch), 'utf8')
    return path
}

function parseBatchPayload(stdout: string): BatchPayload {
    return JSON.parse(stdout) as BatchPayload
}

describe.each([
    {name: 'in-process adapter', run: runAdapter},
    {name: 'actual Node/tsx entry point', run: runNode},
])('$name --batch mode [batch-003]', ({run}) => {
    it('writes exactly one newline-terminated compact JSON line and nothing to stderr', async () => {
        const result = await run(['--batch', saveBatch(allValidBatch)])
        expect(result.stderr).toBe('')
        expect(result.stdout.split('\n')).toEqual([JSON.stringify(allValidPayload), ''])
    })

    it('exits 0 with overall valid true for an all-valid mixed-platform batch', async () => {
        const result = await run(['--batch', saveBatch(allValidBatch)])
        expect(result).toEqual({code: 0, stdout: `${JSON.stringify(allValidPayload)}\n`, stderr: ''})
        expect(parseBatchPayload(result.stdout).valid).toBe(true)
    })

    it('exits 1 and reports every entry in input order with all of its issues', async () => {
        const result = await run(['--batch', saveBatch(mixedBatch)])
        expect(result).toEqual({code: 1, stdout: `${JSON.stringify(mixedPayload)}\n`, stderr: ''})
        const printed = parseBatchPayload(result.stdout)
        expect(printed.results.map((entry) => entry.id)).toEqual(['zebra', 'alpha', 'middle'])
        expect(printed.results.map((entry) => entry.valid)).toEqual([false, true, false])
        expect(printed.results.map((entry) => entry.issues.length)).toEqual([2, 0, 1])
        expect(printed.results[0]?.issues.map((issue) => issue.field)).toEqual(['headlines', 'descriptions'])
        expect(printed.results[2]?.issues).toEqual([{field: 'primaryTexts', message: 'needs 1-5 entries, got 0'}])
        expect(printed.valid).toBe(false)
    })

    it('prints exactly validateCopyBatch of the parsed file, without reordering or reformatting', async () => {
        const path = saveBatch(mixedBatch)
        const parsedFile = JSON.parse(readFileSync(path, 'utf8')) as unknown
        const result = await run(['--batch', path])
        expect(result.code).toBe(1)
        expect(result.stdout).toBe(`${JSON.stringify(validateCopyBatch(parsedFile))}\n`)
        expect(parseBatchPayload(result.stdout)).toEqual(validateCopyBatch(parsedFile))
    })

    it('accepts rsa, pmax and meta entries in a single --batch invocation and exits 0', async () => {
        const batch = {entries: [metaBatchEntry, rsaBatchEntry, pmaxBatchEntry]}
        const expected: BatchPayload = {
            valid: true,
            results: [
                {id: 'meta-three', platform: 'meta', valid: true, issues: []},
                {id: 'rsa-one', platform: 'rsa', valid: true, issues: []},
                {id: 'pmax-two', platform: 'pmax', valid: true, issues: []},
            ],
        }
        const result = await run(['--batch', saveBatch(batch)])
        expect(result).toEqual({code: 0, stdout: `${JSON.stringify(expected)}\n`, stderr: ''})
        expect(parseBatchPayload(result.stdout).results.map((entry) => entry.platform)).toEqual(['meta', 'rsa', 'pmax'])
    })
})

it('gives identical batch output through the in-process adapter and the actual Node/tsx entry point', async () => {
    const path = saveBatch(mixedBatch)
    const adapter = await runAdapter(['--batch', path])
    const entryPoint = runNode(['--batch', path])
    expect(adapter).toEqual({code: 1, stdout: `${JSON.stringify(mixedPayload)}\n`, stderr: ''})
    expect(entryPoint).toEqual(adapter)
})

// --- batch-004: --batch failure modes exit 2 with clean streams and no writes ---

interface UsagePaths {
    first: string
    second: string
}

/** The exact CopyShapeError message the CLI must surface; fails loudly when the batch is well shaped. */
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

const duplicateIdBatch = {entries: [rsaBatchEntry, pmaxBatchEntry, metaBatchEntry, {...rsaBatchEntry}]}
const blankIdBatch = {entries: [rsaBatchEntry, pmaxBatchEntry, {id: '  \t ', platform: 'meta', copy: batchMetaCopy}]}
const unknownPlatformBatch = {
    entries: [rsaBatchEntry, {id: 'email-four', platform: 'email', copy: {}}, metaBatchEntry],
}
// Shape violations at index 1 (unknown platform) and index 3 (blank id): one left-to-right pass reports index 1.
const twoShapeViolationBatch = {
    entries: [
        rsaBatchEntry,
        {id: 'email-four', platform: 'email', copy: {}},
        pmaxBatchEntry,
        {id: ' ', platform: 'meta', copy: batchMetaCopy},
    ],
}

const batchShapeFailures = [
    {name: 'an empty entries array', batch: {entries: []}, message: 'entries must have at least one entry'},
    {name: 'a non-array entries value', batch: {entries: {}}, message: 'entries must be an array'},
    {name: 'a root that is not an object', batch: [rsaBatchEntry], message: 'input must be an object'},
    {
        name: 'a duplicate id reported at the later index',
        batch: duplicateIdBatch,
        message: 'entries[3].id is a duplicate identifier',
    },
    {name: 'a blank id', batch: blankIdBatch, message: 'entries[2].id must be a nonempty string'},
    {name: 'a non-object entry', batch: {entries: ['not an entry']}, message: 'entries[0].input must be an object'},
    {
        name: 'an unknown platform',
        batch: unknownPlatformBatch,
        message: 'entries[1].platform must be rsa, pmax or meta',
    },
    {
        name: 'the first of two shape violations',
        batch: twoShapeViolationBatch,
        message: 'entries[1].platform must be rsa, pmax or meta',
    },
]

const usageCases: {name: string; build: (paths: UsagePaths) => string[]}[] = [
    {name: '--batch with no path', build: () => ['--batch']},
    {name: '--batch with two paths', build: ({first, second}) => ['--batch', first, second]},
    {name: 'a positional path followed by --batch', build: ({first}) => [first, '--batch']},
    {name: 'a repeated --batch flag', build: ({first}) => ['--batch', '--batch', first]},
    {name: 'an unknown option carrying a path', build: ({first}) => ['--unknown', first]},
    {name: 'an unknown option on its own', build: () => ['--verbose']},
    {name: 'an attached --batch=path form', build: ({first}) => [`--batch=${first}`]},
    {name: 'a --batch path beginning with a hyphen', build: () => ['--batch', '-campaign batch.json']},
]

function saveUsagePaths(): UsagePaths {
    const second = join(fixtureDirectory, 'second batch.json')
    writeFileSync(second, JSON.stringify(allValidBatch), 'utf8')
    return {first: saveBatch(allValidBatch), second}
}

describe.each([
    {name: 'in-process adapter', run: runAdapter},
    {name: 'actual Node/tsx entry point', run: runNode},
])('$name --batch failure modes [batch-004]', ({run}) => {
    it.each(usageCases)('rejects $name with a usage diagnostic naming --batch', async ({build}) => {
        const result = await run(build(saveUsagePaths()))
        expectDiagnostic(result)
        expect(result.stdout).toBe('')
        expect(result.stderr).toMatch(/usage/i)
        const lines = result.stderr.split('\n')
        expect(lines).toHaveLength(3)
        expect(lines[2]).toBe('')
        expect(lines[0]).toContain('<file.json>')
        expect(lines[0]).not.toContain('--batch')
        expect(lines[1]).toContain('--batch <file.json>')
    })

    it('prints one identical usage diagnostic for every usage permutation', async () => {
        const paths = saveUsagePaths()
        const results: CommandResult[] = []
        for (const {build} of usageCases) {
            results.push(await run(build(paths)))
        }
        const expected = results[0]
        expect(expected?.code).toBe(2)
        expect(expected?.stdout).toBe('')
        expect(results).toHaveLength(usageCases.length)
        for (const result of results) {
            expect(result).toEqual(expected)
        }
    })

    it.each(batchShapeFailures)('rejects $name with the CopyShapeError message on stderr', async ({batch, message}) => {
        expect(shapeErrorMessage(batch)).toBe(message)
        expect(await run(['--batch', saveBatch(batch)])).toEqual({code: 2, stdout: '', stderr: `${message}\n`})
    })

    it('reports a missing batch file exactly as the shipped single-file command does', async () => {
        const missing = join(fixtureDirectory, 'missing batch.json')
        const batchResult = await run(['--batch', missing])
        expectDiagnostic(batchResult)
        expect(batchResult.stderr).toBe('Unable to read copy file.\n')
        expect(batchResult).toEqual(await run([missing]))
    })

    it('reports a directory batch path exactly as the shipped single-file command does', async () => {
        const batchResult = await run(['--batch', fixtureDirectory])
        expectDiagnostic(batchResult)
        expect(batchResult.stderr).toBe('Unable to read copy file.\n')
        expect(batchResult).toEqual(await run([fixtureDirectory]))
    })

    it('reports malformed batch JSON exactly as the shipped single-file command does', async () => {
        const path = join(fixtureDirectory, 'broken batch.json')
        writeFileSync(path, '{"entries":[{"id":"rsa-one",', 'utf8')
        const batchResult = await run(['--batch', path])
        expectDiagnostic(batchResult)
        expect(batchResult.stderr).toBe('Copy file must contain valid JSON.\n')
        expect(batchResult).toEqual(await run([path]))
    })

    it('prints no stack-trace frame on any --batch failure', async () => {
        const paths = saveUsagePaths()
        const brokenPath = join(fixtureDirectory, 'broken batch.json')
        writeFileSync(brokenPath, '{"entries":', 'utf8')
        const results = [
            await run(['--batch']),
            await run(['--batch', paths.first, paths.second]),
            await run(['--batch', join(fixtureDirectory, 'missing batch.json')]),
            await run(['--batch', fixtureDirectory]),
            await run(['--batch', brokenPath]),
            await run(['--batch', saveBatch(duplicateIdBatch)]),
            await run(['--batch', saveBatch(twoShapeViolationBatch)]),
        ]
        expect(results.map((result) => result.code)).toEqual([2, 2, 2, 2, 2, 2, 2])
        for (const result of results) {
            expect(result.stdout).toBe('')
            expect(result.stderr.endsWith('\n')).toBe(true)
            expect(result.stderr).not.toMatch(/(^|\n)\s*at\s+\S/)
            expect(result.stderr).not.toContain('node:internal')
            expect(result.stderr).not.toContain('CopyShapeError:')
        }
    })

    it('writes no file: the directory listing and input bytes survive failing --batch runs', async () => {
        const path = saveBatch(duplicateIdBatch)
        const before = readFileSync(path)
        const listing = readdirSync(fixtureDirectory).sort()
        expect(listing).toEqual(['campaign batch.json'])
        expect(await run(['--batch', path])).toEqual({
            code: 2,
            stdout: '',
            stderr: 'entries[3].id is a duplicate identifier\n',
        })
        expect((await run(['--batch', path, path])).code).toBe(2)
        expect(readFileSync(path)).toEqual(before)
        expect(readdirSync(fixtureDirectory).sort()).toEqual(listing)
    })
})

it('propagates a non-CopyShapeError from the validator instead of turning it into an exit-2 diagnostic', async () => {
    vi.doMock('@/domain/validation/batch', () => ({
        validateCopyBatch: () => {
            throw new Error('unexpected validator failure')
        },
    }))
    vi.resetModules()
    try {
        const freshModule = (await import('./cli')) as CliModule
        await expect(async () => freshModule.main(['--batch', saveBatch(allValidBatch)])).rejects.toThrow(
            'unexpected validator failure'
        )
    } finally {
        vi.doUnmock('@/domain/validation/batch')
        vi.resetModules()
    }
})
