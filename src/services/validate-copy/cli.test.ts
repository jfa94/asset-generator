// @vitest-environment node

import {spawnSync} from 'node:child_process'
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {validateCopy} from '@/domain/validation/copy'

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
