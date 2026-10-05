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
const cliPath = join(projectRoot, 'src/services/formats/cli.ts')
const tsxLoader = pathToFileURL(join(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href
const tsxEnv = {...process.env, TSX_TSCONFIG_PATH: join(projectRoot, 'tsconfig.json')}
const packageScriptTimeout = 20000

const D9_LINES = [
    'google-pmax landscape 1200x628 300:157',
    'google-pmax square 1200x1200 1:1',
    'google-pmax portrait 960x1200 4:5',
    'meta square 1080x1080 1:1',
    'meta feed 1080x1350 4:5',
    'meta story 1080x1920 9:16',
]
const D9_TEXT = D9_LINES.map((line) => `${line}\n`).join('')
const USAGE_LINE = 'Usage: pnpm formats [--platform <platform>] [--json]'

const usageCases = [
    {name: 'an unknown --bogus flag', args: ['--bogus']},
    {name: 'a positional meta', args: ['meta']},
    {name: '--help', args: ['--help']},
]

let fixtureDirectory: string

beforeEach(() => {
    fixtureDirectory = mkdtempSync(join(tmpdir(), 'formats-cli-test-'))
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

function runPackageScript(args: string[]): CommandResult {
    // Literal package-manager executable and command; no shell.

    const result = spawnSync('pnpm', args, {
        cwd: projectRoot,
        // Stryker links installed dependencies; package tests must not reinstall that shared tree.
        env: {...process.env, pnpm_config_verify_deps_before_run: 'false', pnpm_config_update_notifier: 'false'},
        encoding: 'utf8',
        timeout: 15000,
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
])('$name [fmt-003]', ({run}) => {
    it('lists all six formats as D9 text lines on stdout with exit 0 and empty stderr', async () => {
        const result = await run([])
        expect(result).toEqual({code: 0, stdout: D9_TEXT, stderr: ''})
        expect(result.stdout.split('\n')).toEqual([...D9_LINES, ''])
    })

    it.each(usageCases)('rejects $name with exit 2 and exactly the usage line on stderr', async ({args}) => {
        const result = await run(args)
        expectDiagnostic(result)
        expect(result).toEqual({code: 2, stdout: '', stderr: `${USAGE_LINE}\n`})
    })
})

it('gives the same no-argument bytes through the in-process adapter and the actual entry point', async () => {
    const adapter = await runAdapter([])
    const entryPoint = runNode([])
    expect(adapter).toEqual({code: 0, stdout: D9_TEXT, stderr: ''})
    expect(entryPoint).toEqual(adapter)
})

it('declares the formats package script as tsx src/services/formats/cli.ts', () => {
    const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
        scripts: {formats?: string}
    }
    expect(manifest.scripts.formats).toBe('tsx src/services/formats/cli.ts')
})

it(
    'pnpm formats exits 0 and prints exactly the six D9 lines on stdout',
    () => {
        const result = runPackageScript(['formats'])
        expect(result.code).toBe(0)
        expect(result.stdout).toBe(D9_TEXT)
    },
    packageScriptTimeout
)

it('can be imported by a separate cli.ts process without command I/O or exit', () => {
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
        timeout: 10000,
    })
    if (result.error !== undefined) {
        throw result.error
    }
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('imported\n')
    expect(result.stderr).toBe('')
})

it('gives byte-identical stdout for two no-argument runs from an empty directory and writes no file', () => {
    expect(readdirSync(fixtureDirectory)).toEqual([])
    const first = runNode([], fixtureDirectory)
    const second = runNode([], fixtureDirectory)
    expect(first).toEqual({code: 0, stdout: D9_TEXT, stderr: ''})
    expect(Buffer.from(second.stdout)).toEqual(Buffer.from(first.stdout))
    expect(second).toEqual(first)
    expect(readdirSync(fixtureDirectory)).toEqual([])
})
