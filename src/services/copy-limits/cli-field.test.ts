// @vitest-environment node

import {spawnSync} from 'node:child_process'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {listCopyLimits} from '@/domain/validation/copyLimits'

interface CommandResult {
    code: number | null | undefined
    stdout: string
    stderr: string
}

const projectRoot = resolve(import.meta.dirname, '../../..')
const cliPath = join(projectRoot, 'src/services/copy-limits/cli.ts')
const tsxLoader = pathToFileURL(join(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href
const tsxEnv = {...process.env, TSX_TSCONFIG_PATH: join(projectRoot, 'tsconfig.json')}
const entryPointTimeout = 20000
const packageScriptTimeout = 30000

const USAGE_LINE = 'Usage: pnpm copy-limits [--platform <platform>] [--json]'
const TIKTOK_PLATFORM_MESSAGE = 'Unknown platform "tiktok". Accepted values: rsa, pmax, meta.'
const FIELD_ACCEPTED_VALUES =
    'Accepted values: headlines, descriptions, paths, shortHeadlines, longHeadlines, businessName, primaryTexts.'
const HEADLINES_FIELD_MESSAGE =
    'Unknown field "Headlines". Accepted values: headlines, descriptions, paths, shortHeadlines, longHeadlines, businessName, primaryTexts.'

const HEADLINES_TEXT = 'rsa headlines 3-15 30\nmeta headlines 1-5 40\n'
const PMAX_DESCRIPTIONS_LINE = '{"limits":[{"platform":"pmax","field":"descriptions","min":2,"max":5,"maxChars":90}]}'
const PMAX_DESCRIPTIONS_PAYLOAD = {
    limits: [{platform: 'pmax', field: 'descriptions', min: 2, max: 5, maxChars: 90}],
}
const ALL_DESCRIPTIONS_LINE =
    '{"limits":[{"platform":"rsa","field":"descriptions","min":2,"max":4,"maxChars":90},' +
    '{"platform":"pmax","field":"descriptions","min":2,"max":5,"maxChars":90},' +
    '{"platform":"meta","field":"descriptions","min":1,"max":5,"maxChars":25}]}'

// Base bytes from the shipped CLI (D10 text and D3/D11 JSON).
const BASE_TEXT = [
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
    .map((line) => `${line}\n`)
    .join('')
const BASE_META_TEXT = 'meta primaryTexts 1-5 125\nmeta headlines 1-5 40\nmeta descriptions 1-5 25\n'
const BASE_JSON_LINE =
    '{"limits":[{"platform":"rsa","field":"headlines","min":3,"max":15,"maxChars":30},' +
    '{"platform":"rsa","field":"descriptions","min":2,"max":4,"maxChars":90},' +
    '{"platform":"rsa","field":"paths","min":0,"max":2,"maxChars":15},' +
    '{"platform":"pmax","field":"shortHeadlines","min":3,"max":15,"maxChars":30},' +
    '{"platform":"pmax","field":"longHeadlines","min":1,"max":5,"maxChars":90},' +
    '{"platform":"pmax","field":"descriptions","min":2,"max":5,"maxChars":90},' +
    '{"platform":"pmax","field":"businessName","min":1,"max":1,"maxChars":25},' +
    '{"platform":"meta","field":"primaryTexts","min":1,"max":5,"maxChars":125},' +
    '{"platform":"meta","field":"headlines","min":1,"max":5,"maxChars":40},' +
    '{"platform":"meta","field":"descriptions","min":1,"max":5,"maxChars":25}]}'
const BASE_META_JSON_LINE =
    '{"limits":[{"platform":"meta","field":"primaryTexts","min":1,"max":5,"maxChars":125},' +
    '{"platform":"meta","field":"headlines","min":1,"max":5,"maxChars":40},' +
    '{"platform":"meta","field":"descriptions","min":1,"max":5,"maxChars":25}]}'

function unknownFieldLine(value: string): string {
    return `Unknown field ${JSON.stringify(value)}. ${FIELD_ACCEPTED_VALUES}\n`
}

function runNode(args: string[]): CommandResult {
    // Fixed Node executable, argument vector, no shell.
    const result = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, ...args], {
        cwd: projectRoot,
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
        const module = await import('@/services/copy-limits/cli')
        const code = await Promise.resolve(module.main(args))
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

const pmaxDescriptionsPermutations = [
    ['--field', 'descriptions', '--platform', 'pmax', '--json'],
    ['--field', 'descriptions', '--json', '--platform', 'pmax'],
    ['--platform', 'pmax', '--field', 'descriptions', '--json'],
    ['--platform', 'pmax', '--json', '--field', 'descriptions'],
    ['--json', '--field', 'descriptions', '--platform', 'pmax'],
    ['--json', '--platform', 'pmax', '--field', 'descriptions'],
].map((args) => ({name: args.join(' '), args}))

const unknownFieldValues = ['Headlines', 'headline', 'HEADLINES', 'tiktok', '']
const unknownFieldCases = unknownFieldValues.flatMap((value) => [
    {name: `--field ${JSON.stringify(value)}`, value, args: ['--field', value]},
    {name: `--field ${JSON.stringify(value)} --json`, value, args: ['--field', value, '--json']},
    {name: `--json --field ${JSON.stringify(value)}`, value, args: ['--json', '--field', value]},
    {name: `--platform meta --field ${JSON.stringify(value)}`, value, args: ['--platform', 'meta', '--field', value]},
    {
        name: `--field ${JSON.stringify(value)} --platform meta --json`,
        value,
        args: ['--field', value, '--platform', 'meta', '--json'],
    },
])

const usageVectors = [
    ['--field'],
    ['--field', '--json'],
    ['--json', '--field'],
    ['--field', '-x'],
    ['--field', '--platform', 'meta'],
    ['--field=headlines'],
    ['--FIELD', 'headlines'],
    ['--field', 'headlines', '--field', 'headlines'],
    ['--field', 'headlines', '--field', 'descriptions'],
    ['--field', 'Headlines', '--field', 'Headlines'],
    ['--field', 'headlines', 'descriptions'],
    ['--field', 'Headlines', '--bogus'],
    ['--platform', 'tiktok', '--field', 'Headlines', '--json', '--json'],
    ['--platform', 'meta', '--field', 'headlines', '--platform', 'meta'],
].map((args) => ({name: JSON.stringify(args), args}))

describe.each([
    {name: 'in-process adapter', run: runAdapter},
    {name: 'actual Node/tsx entry point', run: runNode},
])('$name --field [fld-002]', ({run}) => {
    it(
        '--field headlines prints exactly the rsa and meta headlines lines with exit 0 and empty stderr',
        async () => {
            const result = await run(['--field', 'headlines'])
            expect(result).toEqual({code: 0, stdout: HEADLINES_TEXT, stderr: ''})
            expect(result.stdout.split('\n')).toEqual(['rsa headlines 3-15 30', 'meta headlines 1-5 40', ''])
        },
        entryPointTimeout
    )

    it.each(pmaxDescriptionsPermutations)(
        '$name prints exactly the compact pmax descriptions line with exit 0',
        async ({args}) => {
            const result = await run(args)
            expect(result).toEqual({code: 0, stdout: `${PMAX_DESCRIPTIONS_LINE}\n`, stderr: ''})
            expect(result.stdout).toBe(`${JSON.stringify({limits: listCopyLimits('pmax', 'descriptions')})}\n`)
            expect(JSON.parse(result.stdout)).toEqual(PMAX_DESCRIPTIONS_PAYLOAD)
        },
        entryPointTimeout
    )

    it(
        '--field descriptions --json prints rsa, pmax then meta descriptions as one JSON line with exit 0',
        async () => {
            const result = await run(['--field', 'descriptions', '--json'])
            expect(result).toEqual({code: 0, stdout: `${ALL_DESCRIPTIONS_LINE}\n`, stderr: ''})
            expect(result.stdout).toBe(`${JSON.stringify({limits: listCopyLimits(undefined, 'descriptions')})}\n`)
        },
        entryPointTimeout
    )

    it(
        '--platform meta --field headlines prints exactly the meta headlines line with exit 0',
        async () => {
            const result = await run(['--platform', 'meta', '--field', 'headlines'])
            expect(result).toEqual({code: 0, stdout: 'meta headlines 1-5 40\n', stderr: ''})
        },
        entryPointTimeout
    )

    it(
        '--platform meta --field paths exits 0 with empty stdout and empty stderr',
        async () => {
            const result = await run(['--platform', 'meta', '--field', 'paths'])
            expect(result).toEqual({code: 0, stdout: '', stderr: ''})
        },
        entryPointTimeout
    )

    it.each([
        {name: '--platform meta --field paths --json', args: ['--platform', 'meta', '--field', 'paths', '--json']},
        {
            name: '--field businessName --platform rsa --json',
            args: ['--field', 'businessName', '--platform', 'rsa', '--json'],
        },
    ])(
        '$name prints exactly {"limits":[]} plus a newline with exit 0',
        async ({args}) => {
            const result = await run(args)
            expect(result).toEqual({code: 0, stdout: '{"limits":[]}\n', stderr: ''})
        },
        entryPointTimeout
    )

    it(
        '--field Headlines exits 2 with exactly the documented unknown-field message',
        async () => {
            const result = await run(['--field', 'Headlines'])
            expect(result).toEqual({code: 2, stdout: '', stderr: `${HEADLINES_FIELD_MESSAGE}\n`})
        },
        entryPointTimeout
    )

    it.each(unknownFieldCases)(
        '$name exits 2 with empty stdout and exactly the UnknownCopyFieldError message',
        async ({args, value}) => {
            const result = await run(args)
            expect(result).toEqual({code: 2, stdout: '', stderr: unknownFieldLine(value)})
            expect(result.stderr).not.toContain('{"limits"')
        },
        entryPointTimeout
    )

    it.each(usageVectors)(
        '$name exits 2 with empty stdout and exactly the unchanged usage line',
        async ({args}) => {
            const result = await run(args)
            expect(result).toEqual({code: 2, stdout: '', stderr: `${USAGE_LINE}\n`})
        },
        entryPointTimeout
    )

    it.each([
        {name: '--platform tiktok --field Headlines', args: ['--platform', 'tiktok', '--field', 'Headlines']},
        {name: '--field Headlines --platform tiktok', args: ['--field', 'Headlines', '--platform', 'tiktok']},
    ])(
        '$name prints only the unknown-platform message with exit 2',
        async ({args}) => {
            const result = await run(args)
            expect(result).toEqual({code: 2, stdout: '', stderr: `${TIKTOK_PLATFORM_MESSAGE}\n`})
        },
        entryPointTimeout
    )

    it(
        'no arguments still prints the base ten text lines',
        async () => {
            expect(await run([])).toEqual({code: 0, stdout: BASE_TEXT, stderr: ''})
        },
        entryPointTimeout
    )

    it(
        '--platform meta still prints the base meta text lines',
        async () => {
            expect(await run(['--platform', 'meta'])).toEqual({code: 0, stdout: BASE_META_TEXT, stderr: ''})
        },
        entryPointTimeout
    )

    it(
        '--json still prints the base JSON line',
        async () => {
            expect(await run(['--json'])).toEqual({code: 0, stdout: `${BASE_JSON_LINE}\n`, stderr: ''})
        },
        entryPointTimeout
    )

    it(
        '--platform meta --json still prints the base meta JSON line',
        async () => {
            expect(await run(['--platform', 'meta', '--json'])).toEqual({
                code: 0,
                stdout: `${BASE_META_JSON_LINE}\n`,
                stderr: '',
            })
        },
        entryPointTimeout
    )
})

describe('main error handling with --field [fld-002]', () => {
    afterEach(() => {
        vi.doUnmock('@/domain/validation/copyLimits')
        vi.resetModules()
        vi.restoreAllMocks()
    })

    it.each([
        {name: '--field headlines', args: ['--field', 'headlines']},
        {
            name: '--field descriptions --platform pmax --json',
            args: ['--field', 'descriptions', '--platform', 'pmax', '--json'],
        },
    ])('rethrows a plain Error from listCopyLimits for $name instead of returning 2', async ({args}) => {
        const fault = new Error('catalogue fault')
        vi.resetModules()
        vi.doMock('@/domain/validation/copyLimits', async (importOriginal) => ({
            ...(await importOriginal<Record<string, unknown>>()),
            listCopyLimits: () => {
                throw fault
            },
        }))
        const writes: string[] = []
        vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            writes.push(String(chunk))
            return true
        })
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
            writes.push(String(chunk))
            return true
        })
        const module = await import('@/services/copy-limits/cli')

        await expect(Promise.resolve().then(() => module.main(args))).rejects.toBe(fault)
        expect(writes).toEqual([])
    })
})

describe('adapter and entry point parity [fld-002]', () => {
    it(
        'gives byte-identical results for --field descriptions --platform pmax --json',
        async () => {
            const args = ['--field', 'descriptions', '--platform', 'pmax', '--json']
            const adapter = await runAdapter(args)
            const entryPoint = runNode(args)
            expect(adapter).toEqual({code: 0, stdout: `${PMAX_DESCRIPTIONS_LINE}\n`, stderr: ''})
            expect(entryPoint).toEqual(adapter)
        },
        entryPointTimeout
    )

    it(
        'gives byte-identical results for --field Headlines',
        async () => {
            const args = ['--field', 'Headlines']
            const adapter = await runAdapter(args)
            const entryPoint = runNode(args)
            expect(adapter).toEqual({code: 2, stdout: '', stderr: `${HEADLINES_FIELD_MESSAGE}\n`})
            expect(entryPoint).toEqual(adapter)
        },
        entryPointTimeout
    )
})

describe('package script [fld-002]', () => {
    it(
        'pnpm copy-limits --field descriptions --platform pmax --json exits 0 with stdout parsing to the pmax descriptions payload',
        () => {
            const result = runPackageScript(['copy-limits', '--field', 'descriptions', '--platform', 'pmax', '--json'])
            expect(result.code).toBe(0)
            expect(JSON.parse(result.stdout)).toEqual(PMAX_DESCRIPTIONS_PAYLOAD)
        },
        packageScriptTimeout
    )

    it(
        'pnpm --silent copy-limits --field Headlines exits 2 with empty stdout and the message on stderr without a stack frame',
        () => {
            const result = runPackageScript(['--silent', 'copy-limits', '--field', 'Headlines'])
            expect(result.code).toBe(2)
            expect(result.stdout).toBe('')
            expect(result.stderr).toContain(HEADLINES_FIELD_MESSAGE)
            expect(result.stderr).not.toMatch(/(^|\n)\s*at\s+\S/)
        },
        packageScriptTimeout
    )

    it(
        'bare pnpm copy-limits --field Headlines exits 2 with the message on stderr',
        () => {
            const result = runPackageScript(['copy-limits', '--field', 'Headlines'])
            expect(result.code).toBe(2)
            expect(result.stderr).toContain(HEADLINES_FIELD_MESSAGE)
        },
        packageScriptTimeout
    )
})
