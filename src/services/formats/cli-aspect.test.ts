// @vitest-environment node

import {spawnSync} from 'node:child_process'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {listFormats} from '@/domain/formatCatalogue'

interface CommandResult {
    code: number | null | undefined
    stdout: string
    stderr: string
}

const projectRoot = resolve(import.meta.dirname, '../../..')
const cliPath = join(projectRoot, 'src/services/formats/cli.ts')
const tsxLoader = pathToFileURL(join(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href
const tsxEnv = {...process.env, TSX_TSCONFIG_PATH: join(projectRoot, 'tsconfig.json')}
const packageScriptTimeout = 20000

const USAGE_LINE = 'Usage: pnpm formats [--platform <platform>] [--json]'
const TIKTOK_MESSAGE = 'Unknown platform "tiktok". Accepted values: google-pmax, meta.'
const SQUARE_TEXT = 'google-pmax square 1200x1200 1:1\nmeta square 1080x1080 1:1\n'
const STORY_JSON_LINE =
    '{"formats":[{"platform":"meta","name":"story","width":1080,"height":1920,"aspectRatio":"9:16","safeZone":{"top":0.14,"bottom":0.2}}]}'
const PORTRAIT_JSON_LINE =
    '{"formats":[{"platform":"google-pmax","name":"portrait","width":960,"height":1200,"aspectRatio":"4:5"},{"platform":"meta","name":"feed","width":1080,"height":1350,"aspectRatio":"4:5"}]}'
const STORY_PAYLOAD = {
    formats: [
        {
            platform: 'meta',
            name: 'story',
            width: 1080,
            height: 1920,
            aspectRatio: '9:16',
            safeZone: {top: 0.14, bottom: 0.2},
        },
    ],
}
const BASE_TEXT = [
    'google-pmax landscape 1200x628 300:157',
    'google-pmax square 1200x1200 1:1',
    'google-pmax portrait 960x1200 4:5',
    'meta square 1080x1080 1:1',
    'meta feed 1080x1350 4:5',
    'meta story 1080x1920 9:16',
]
    .map((line) => `${line}\n`)
    .join('')
const BASE_META_TEXT = 'meta square 1080x1080 1:1\nmeta feed 1080x1350 4:5\nmeta story 1080x1920 9:16\n'
const BASE_META_JSON_LINE =
    '{"formats":[{"platform":"meta","name":"square","width":1080,"height":1080,"aspectRatio":"1:1"},{"platform":"meta","name":"feed","width":1080,"height":1350,"aspectRatio":"4:5"},{"platform":"meta","name":"story","width":1080,"height":1920,"aspectRatio":"9:16","safeZone":{"top":0.14,"bottom":0.2}}]}'

function invalidRatioMessage(value: string): string {
    return `Invalid aspect ratio ${JSON.stringify(value)}. Expected W:H with positive integers, for example 9:16.`
}

function runNode(args: string[]): CommandResult {
    // Fixed Node executable, argument vector, no shell.
    const result = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, ...args], {
        cwd: projectRoot,
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
        const module = await import('@/services/formats/cli')
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
        timeout: 15000,
    })
    if (result.error !== undefined) {
        throw result.error
    }
    expect(result.signal).toBeNull()
    return {code: result.status, stdout: result.stdout, stderr: result.stderr}
}

const storyPermutations = [
    ['--aspect', '9:16', '--platform', 'meta', '--json'],
    ['--aspect', '9:16', '--json', '--platform', 'meta'],
    ['--platform', 'meta', '--aspect', '9:16', '--json'],
    ['--platform', 'meta', '--json', '--aspect', '9:16'],
    ['--json', '--aspect', '9:16', '--platform', 'meta'],
    ['--json', '--platform', 'meta', '--aspect', '9:16'],
].map((args) => ({name: args.join(' '), args}))

const malformedValues = ['9-16', '0:1', '9:-16', '1.5:1', '9:16:1', '916', '']
const malformedCases = malformedValues.flatMap((value) => [
    {name: `--aspect ${JSON.stringify(value)}`, value, args: ['--aspect', value]},
    {name: `--aspect ${JSON.stringify(value)} --json`, value, args: ['--aspect', value, '--json']},
    {name: `--json --aspect ${JSON.stringify(value)}`, value, args: ['--json', '--aspect', value]},
    {name: `--platform meta --aspect ${JSON.stringify(value)}`, value, args: ['--platform', 'meta', '--aspect', value]},
])

const usageVectors = [
    ['--aspect'],
    ['--aspect', '--json'],
    ['--json', '--aspect'],
    ['--aspect', '-9:16'],
    ['--aspect=9:16'],
    ['--ASPECT', '9:16'],
    ['--aspect', '1:1', '--aspect', '1:1'],
    ['--aspect', '1:1', '--aspect', '4:5'],
    ['--aspect', '9-16', '--aspect', '9-16'],
    ['--aspect', '1:1', '1:1'],
    ['--aspect', '9-16', '--bogus'],
    ['--platform', 'tiktok', '--aspect', '9-16', '--json', '--json'],
    ['--platform', 'meta', '--aspect', '1:1', '--platform', 'meta'],
].map((args) => ({name: JSON.stringify(args), args}))

describe.each([
    {name: 'in-process adapter', run: runAdapter},
    {name: 'actual Node/tsx entry point', run: runNode},
])('$name --aspect [asp-002]', ({run}) => {
    it.each([
        {name: '--aspect 2:2', args: ['--aspect', '2:2']},
        {name: '--aspect 1:1', args: ['--aspect', '1:1']},
    ])('$name prints exactly the google-pmax square and meta square lines with exit 0', async ({args}) => {
        const result = await run(args)
        expect(result).toEqual({code: 0, stdout: SQUARE_TEXT, stderr: ''})
        expect(result.stdout.split('\n')).toEqual(['google-pmax square 1200x1200 1:1', 'meta square 1080x1080 1:1', ''])
    })

    it.each(storyPermutations)('$name prints exactly the compact meta story line with exit 0', async ({args}) => {
        const result = await run(args)
        expect(result).toEqual({code: 0, stdout: `${STORY_JSON_LINE}\n`, stderr: ''})
        expect(result.stdout).toBe(`${JSON.stringify({formats: listFormats('meta', '9:16')})}\n`)
        expect(JSON.parse(result.stdout)).toEqual(STORY_PAYLOAD)
    })

    it('--aspect 4:5 --json prints google-pmax portrait then meta feed as one JSON line with exit 0', async () => {
        const result = await run(['--aspect', '4:5', '--json'])
        expect(result).toEqual({code: 0, stdout: `${PORTRAIT_JSON_LINE}\n`, stderr: ''})
        expect(result.stdout).toBe(`${JSON.stringify({formats: listFormats(undefined, '4:5')})}\n`)
    })

    it('--platform google-pmax --aspect 1:1 prints exactly the google-pmax square line with exit 0', async () => {
        const result = await run(['--platform', 'google-pmax', '--aspect', '1:1'])
        expect(result).toEqual({code: 0, stdout: 'google-pmax square 1200x1200 1:1\n', stderr: ''})
    })

    it('--aspect 16:9 exits 0 with empty stdout and empty stderr', async () => {
        const result = await run(['--aspect', '16:9'])
        expect(result).toEqual({code: 0, stdout: '', stderr: ''})
    })

    it.each([
        {name: '--aspect 16:9 --json', args: ['--aspect', '16:9', '--json']},
        {
            name: '--platform google-pmax --aspect 9:16 --json',
            args: ['--platform', 'google-pmax', '--aspect', '9:16', '--json'],
        },
    ])('$name prints exactly {"formats":[]} plus a newline with exit 0', async ({args}) => {
        const result = await run(args)
        expect(result).toEqual({code: 0, stdout: '{"formats":[]}\n', stderr: ''})
    })

    it('--aspect 9-16 exits 2 with exactly the documented invalid-ratio message', async () => {
        const result = await run(['--aspect', '9-16'])
        expect(result).toEqual({
            code: 2,
            stdout: '',
            stderr: 'Invalid aspect ratio "9-16". Expected W:H with positive integers, for example 9:16.\n',
        })
    })

    it.each(malformedCases)(
        '$name exits 2 with empty stdout and exactly the InvalidAspectRatioError message',
        async ({args, value}) => {
            const result = await run(args)
            expect(result).toEqual({code: 2, stdout: '', stderr: `${invalidRatioMessage(value)}\n`})
            expect(result.stderr).not.toContain('{"formats"')
        }
    )

    it.each(usageVectors)('$name exits 2 with empty stdout and exactly the unchanged usage line', async ({args}) => {
        const result = await run(args)
        expect(result).toEqual({code: 2, stdout: '', stderr: `${USAGE_LINE}\n`})
    })

    it.each([
        {name: '--platform tiktok --aspect 9-16', args: ['--platform', 'tiktok', '--aspect', '9-16']},
        {name: '--aspect 9-16 --platform tiktok', args: ['--aspect', '9-16', '--platform', 'tiktok']},
    ])('$name prints only the unknown-platform message with exit 2', async ({args}) => {
        const result = await run(args)
        expect(result).toEqual({code: 2, stdout: '', stderr: `${TIKTOK_MESSAGE}\n`})
    })

    it('no arguments still prints the base six text lines', async () => {
        expect(await run([])).toEqual({code: 0, stdout: BASE_TEXT, stderr: ''})
    })

    it('--platform meta still prints the base meta text lines', async () => {
        expect(await run(['--platform', 'meta'])).toEqual({code: 0, stdout: BASE_META_TEXT, stderr: ''})
    })

    it('--platform meta --json still prints the base meta JSON line', async () => {
        expect(await run(['--platform', 'meta', '--json'])).toEqual({
            code: 0,
            stdout: `${BASE_META_JSON_LINE}\n`,
            stderr: '',
        })
    })
})

describe('main error handling with --aspect [asp-002]', () => {
    afterEach(() => {
        vi.doUnmock('@/domain/formatCatalogue')
        vi.resetModules()
        vi.restoreAllMocks()
    })

    it.each([
        {name: '--aspect 1:1', args: ['--aspect', '1:1']},
        {name: '--aspect 9:16 --platform meta --json', args: ['--aspect', '9:16', '--platform', 'meta', '--json']},
    ])('rethrows a plain Error from listFormats for $name instead of returning 2', async ({args}) => {
        const fault = new Error('catalogue fault')
        vi.resetModules()
        vi.doMock('@/domain/formatCatalogue', async (importOriginal) => ({
            ...(await importOriginal<Record<string, unknown>>()),
            listFormats: () => {
                throw fault
            },
        }))
        vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
        vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
        const module = await import('@/services/formats/cli')

        await expect(Promise.resolve().then(() => module.main(args))).rejects.toBe(fault)
    })
})

describe('adapter and entry point parity [asp-002]', () => {
    it('gives byte-identical results for --aspect 9:16 --platform meta --json', async () => {
        const args = ['--aspect', '9:16', '--platform', 'meta', '--json']
        const adapter = await runAdapter(args)
        const entryPoint = runNode(args)
        expect(adapter).toEqual({code: 0, stdout: `${STORY_JSON_LINE}\n`, stderr: ''})
        expect(entryPoint).toEqual(adapter)
    })

    it('gives byte-identical results for --aspect 9-16', async () => {
        const args = ['--aspect', '9-16']
        const adapter = await runAdapter(args)
        const entryPoint = runNode(args)
        expect(adapter).toEqual({code: 2, stdout: '', stderr: `${invalidRatioMessage('9-16')}\n`})
        expect(entryPoint).toEqual(adapter)
    })
})

describe('package script [asp-002]', () => {
    it(
        'pnpm formats --aspect 9:16 --platform meta --json exits 0 with stdout parsing to the meta story payload',
        () => {
            const result = runPackageScript(['formats', '--aspect', '9:16', '--platform', 'meta', '--json'])
            expect(result.code).toBe(0)
            expect(JSON.parse(result.stdout)).toEqual(STORY_PAYLOAD)
        },
        packageScriptTimeout
    )

    it(
        'pnpm --silent formats --aspect 9-16 exits 2 with empty stdout and the message on stderr without a stack frame',
        () => {
            const result = runPackageScript(['--silent', 'formats', '--aspect', '9-16'])
            expect(result.code).toBe(2)
            expect(result.stdout).toBe('')
            expect(result.stderr).toContain(invalidRatioMessage('9-16'))
            expect(result.stderr).not.toMatch(/(^|\n)\s*at\s+\S/)
        },
        packageScriptTimeout
    )

    it(
        'bare pnpm formats --aspect 9-16 exits 2 with the message on stderr',
        () => {
            const result = runPackageScript(['formats', '--aspect', '9-16'])
            expect(result.code).toBe(2)
            expect(result.stderr).toContain(invalidRatioMessage('9-16'))
        },
        packageScriptTimeout
    )
})
