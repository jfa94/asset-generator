// @vitest-environment node

import {spawnSync} from 'node:child_process'
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

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
const cliPath = join(projectRoot, 'src/services/copy-limits/cli.ts')
const tsxLoader = pathToFileURL(join(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href
const tsxEnv = {...process.env, TSX_TSCONFIG_PATH: join(projectRoot, 'tsconfig.json')}
const entryPointTimeout = 20000
const packageScriptTimeout = 30000

// D10, verbatim from the spec.
const D10_LINES = [
    'rsa headlines 3-15 30',
    'rsa descriptions 2-4 90',
    'rsa paths 0-2 15',
    'pmax shortHeadlines 3-15 30',
    'pmax longHeadlines 1-5 90',
    'pmax descriptions 2-5 90',
    'pmax businessName 1-1 25',
    'meta primaryTexts 1-5 125',
    'meta headlines 1-5 40',
    'meta descriptions 1-5 25',
]
const D10_TEXT = D10_LINES.map((line) => `${line}\n`).join('')
const USAGE_LINE = 'Usage: pnpm copy-limits [--platform <platform>] [--json]'

const usageCases = [
    {name: 'an unknown --bogus flag', args: ['--bogus']},
    {name: 'a positional meta', args: ['meta']},
    {name: '--help', args: ['--help']},
]

let fixtureDirectory: string

beforeEach(() => {
    fixtureDirectory = mkdtempSync(join(tmpdir(), 'copy-limits-cli-test-'))
})

afterEach(() => {
    vi.restoreAllMocks()
    rmSync(fixtureDirectory, {recursive: true})
})

function runNode(args: string[], cwd = projectRoot): CommandResult {
    // Fixed Node executable, argument vector, no shell.
    const result = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, ...args], {
        cwd,
        env: tsxEnv,
        encoding: 'utf8',
        timeout: 15000,
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

function runPackageScript(args: string[]): CommandResult {
    // Literal package-manager executable and command; no shell.
    const result = spawnSync('pnpm', args, {
        cwd: projectRoot,
        // Stryker links installed dependencies; package tests must not reinstall that shared tree.
        env: {...process.env, pnpm_config_verify_deps_before_run: 'false', pnpm_config_update_notifier: 'false'},
        encoding: 'utf8',
        timeout: 25000,
    })
    if (result.error !== undefined) {
        throw result.error
    }
    expect(result.signal).toBeNull()
    return {code: result.status, stdout: result.stdout, stderr: result.stderr}
}

function expectDiagnostic(result: CommandResult): void {
    expect(result.code).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr.trim().length).toBeGreaterThan(0)
    expect(result.stderr.length).toBeLessThan(1500)
    expect(result.stderr).not.toMatch(/(^|\n)\s*at\s+\S/)
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND')
}

describe.each([
    {name: 'in-process adapter', run: runAdapter},
    {name: 'actual Node/tsx entry point', run: runNode},
])('$name [cl-005]', ({run}) => {
    it(
        'lists all ten copy limits as D10 text lines on stdout with exit 0 and empty stderr',
        async () => {
            const result = await run([])
            expect(result).toEqual({code: 0, stdout: D10_TEXT, stderr: ''})
            expect(result.stdout.split('\n')).toEqual([...D10_LINES, ''])
        },
        entryPointTimeout
    )

    it.each(usageCases)(
        'rejects $name with exit 2 and exactly the usage line on stderr',
        async ({args}) => {
            const result = await run(args)
            expectDiagnostic(result)
            expect(result).toEqual({code: 2, stdout: '', stderr: `${USAGE_LINE}\n`})
        },
        entryPointTimeout
    )
})

it(
    'gives the same no-argument bytes through the in-process adapter and the actual entry point [cl-005]',
    async () => {
        const adapter = await runAdapter([])
        const entryPoint = runNode([])
        expect(adapter).toEqual({code: 0, stdout: D10_TEXT, stderr: ''})
        expect(entryPoint).toEqual(adapter)
    },
    entryPointTimeout
)

it('declares the copy-limits package script as tsx src/services/copy-limits/cli.ts [cl-005]', () => {
    const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
        scripts: Record<string, string | undefined>
    }
    expect(manifest.scripts['copy-limits']).toBe('tsx src/services/copy-limits/cli.ts')
})

it(
    'pnpm copy-limits exits 0 and prints exactly the ten D10 lines on stdout [cl-005]',
    () => {
        const result = runPackageScript(['copy-limits'])
        expect(result.code).toBe(0)
        expect(result.stdout).toBe(D10_TEXT)
    },
    packageScriptTimeout
)

it(
    'can be imported by a separate cli.ts process without command I/O or exit [cl-005]',
    () => {
        const importer = join(fixtureDirectory, 'cli.ts')
        writeFileSync(
            importer,
            `import(${JSON.stringify(pathToFileURL(cliPath).href)}).then(() => process.stdout.write('imported\\n'))`,
            'utf8'
        )
        // Fixed Node executable and literal test program, without a shell.
        const result = spawnSync(process.execPath, ['--import', tsxLoader, importer], {
            cwd: projectRoot,
            env: tsxEnv,
            encoding: 'utf8',
            timeout: 15000,
        })
        if (result.error !== undefined) {
            throw result.error
        }
        expect(result.status).toBe(0)
        expect(result.stdout).toBe('imported\n')
        expect(result.stderr).toBe('')
    },
    entryPointTimeout
)

it(
    'gives byte-identical stdout for two no-argument runs from an empty directory and writes no file [cl-005]',
    () => {
        expect(readdirSync(fixtureDirectory)).toEqual([])
        const first = runNode([], fixtureDirectory)
        const second = runNode([], fixtureDirectory)
        expect(first).toEqual({code: 0, stdout: D10_TEXT, stderr: ''})
        expect(Buffer.from(second.stdout)).toEqual(Buffer.from(first.stdout))
        expect(second).toEqual(first)
        expect(readdirSync(fixtureDirectory)).toEqual([])
    },
    entryPointTimeout * 2
)

const ACCEPTED_VALUES = 'Accepted values: rsa, pmax, meta.'

function unknownPlatformLine(value: string): string {
    return `Unknown platform ${JSON.stringify(value)}. ${ACCEPTED_VALUES}\n`
}

const platformCases = [
    {platform: 'rsa', lines: D10_LINES.slice(0, 3)},
    {platform: 'pmax', lines: D10_LINES.slice(3, 7)},
    {platform: 'meta', lines: D10_LINES.slice(7, 10)},
]

const unknownPlatformCases = [
    {value: 'tiktok', stderr: 'Unknown platform "tiktok". Accepted values: rsa, pmax, meta.\n'},
    {value: 'META', stderr: 'Unknown platform "META". Accepted values: rsa, pmax, meta.\n'},
    {value: '', stderr: 'Unknown platform "". Accepted values: rsa, pmax, meta.\n'},
]

const platformUsageCases = [
    {name: '--platform with no value', args: ['--platform']},
    {name: '--platform -x', args: ['--platform', '-x']},
    {name: '--platform --bogus', args: ['--platform', '--bogus']},
    {name: '--platform -', args: ['--platform', '-']},
    {name: '--platform meta --platform meta', args: ['--platform', 'meta', '--platform', 'meta']},
    {name: '--platform meta --platform rsa', args: ['--platform', 'meta', '--platform', 'rsa']},
    {name: '--platform meta followed by a positional', args: ['--platform', 'meta', 'rsa']},
    {name: '--platform=meta', args: ['--platform=meta']},
    {name: '--platform tiktok --bogus', args: ['--platform', 'tiktok', '--bogus']},
    {name: '--bogus --platform tiktok', args: ['--bogus', '--platform', 'tiktok']},
    {name: '--platform tiktok --platform meta', args: ['--platform', 'tiktok', '--platform', 'meta']},
]

describe.each([
    {name: 'in-process adapter', run: runAdapter},
    {name: 'actual Node/tsx entry point', run: runNode},
])('$name --platform [cl-006]', ({run}) => {
    it.each(platformCases)(
        '--platform $platform exits 0 with exactly that platform D10 lines and empty stderr',
        async ({platform, lines}) => {
            const result = await run(['--platform', platform])
            expect(result).toEqual({code: 0, stdout: lines.map((line) => `${line}\n`).join(''), stderr: ''})
            expect(result.stdout.split('\n')).toEqual([...lines, ''])
        },
        entryPointTimeout
    )

    it.each(unknownPlatformCases)(
        'rejects --platform $value with exit 2, empty stdout and exactly the accepted-values message',
        async ({value, stderr}) => {
            const result = await run(['--platform', value])
            expectDiagnostic(result)
            expect(result).toEqual({code: 2, stdout: '', stderr})
            expect(result.stderr).toBe(unknownPlatformLine(value))
        },
        entryPointTimeout
    )

    it.each(platformUsageCases)(
        'rejects $name with exit 2 and exactly the usage line on stderr',
        async ({args}) => {
            const result = await run(args)
            expectDiagnostic(result)
            expect(result).toEqual({code: 2, stdout: '', stderr: `${USAGE_LINE}\n`})
            expect(result.stderr).not.toContain('Unknown platform')
        },
        entryPointTimeout
    )
})

describe('main error handling [cl-006]', () => {
    const CATALOGUE = '@/domain/validation/copyLimits'

    afterEach(() => {
        vi.doUnmock(CATALOGUE)
        vi.resetModules()
    })

    async function loadMainWithFailingCatalogue(failure: Error): Promise<CliModule> {
        vi.resetModules()
        vi.doMock(CATALOGUE, async (importOriginal) => {
            const actual = await importOriginal<Record<string, unknown>>()
            return {
                ...actual,
                listCopyLimits: () => {
                    throw failure
                },
            }
        })
        const module = await cliModules['./cli.ts']?.()
        if (module === undefined) {
            throw new Error('cli.ts is not available')
        }
        return module
    }

    it.each([
        {name: 'no arguments', args: []},
        {name: '--platform rsa', args: ['--platform', 'rsa']},
        {name: '--platform tiktok', args: ['--platform', 'tiktok']},
    ])('rethrows a plain Error from listCopyLimits for $name instead of returning 2', async ({args}) => {
        const failure = new Error('catalogue fault')
        const module = await loadMainWithFailingCatalogue(failure)
        const writes: string[] = []
        vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            writes.push(String(chunk))
            return true
        })
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
            writes.push(String(chunk))
            return true
        })
        await expect(Promise.resolve().then(() => module.main(args))).rejects.toBe(failure)
        expect(writes).toEqual([])
    })

    it('rethrows a TypeError from listCopyLimits for --platform meta', async () => {
        const failure = new TypeError('unexpected shape')
        const module = await loadMainWithFailingCatalogue(failure)
        vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
        vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
        await expect(Promise.resolve().then(() => module.main(['--platform', 'meta']))).rejects.toBe(failure)
    })
})

it(
    'pnpm --silent copy-limits --platform tiktok exits 2 with empty stdout and the accepted values on stderr [cl-006]',
    () => {
        const result = runPackageScript(['--silent', 'copy-limits', '--platform', 'tiktok'])
        expect(result.code).toBe(2)
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain(ACCEPTED_VALUES)
        expect(result.stderr).toContain('Unknown platform "tiktok".')
    },
    packageScriptTimeout
)
