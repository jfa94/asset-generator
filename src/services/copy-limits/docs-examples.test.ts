// @vitest-environment node

import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {isDeepStrictEqual} from 'node:util'
import {describe, expect, it} from 'vitest'

interface CommandResult {
    code: number | null
    stdout: string
    stderr: string
}

interface DocSection {
    heading: string
    body: string
}

interface CliFences {
    text: string
    json: string
}

interface CopyLimitJson {
    platform: string
    field: string
    min: number
    max: number
    maxChars: number
}

const projectRoot = resolve(import.meta.dirname, '../../..')
const cliPath = join(projectRoot, 'src/services/copy-limits/cli.ts')
const tsxLoader = pathToFileURL(join(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href
const copyLimitsDocumentPath = join(projectRoot, 'docs/reference/copy-limits.md')
const entryPointTimeout = 20000
const testTimeout = 30000

const CLI_SECTION_TITLE = 'List copy limits from the CLI'
const INTERFACE_SECTION_TITLE = 'Copy limit catalogue interface'
const FENCE_CONTRACT = `the "${CLI_SECTION_TITLE}" section must hold exactly one text fence followed by exactly one json fence`

// D10: the exact pnpm copy-limits listing.
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

// D11: the pnpm copy-limits --platform meta --json payload.
const D11_META_PAYLOAD: {limits: CopyLimitJson[]} = {
    limits: [
        {platform: 'meta', field: 'primaryTexts', min: 1, max: 5, maxChars: 125},
        {platform: 'meta', field: 'headlines', min: 1, max: 5, maxChars: 40},
        {platform: 'meta', field: 'descriptions', min: 1, max: 5, maxChars: 25},
    ],
}

function readCopyLimitsDocument(): string {
    return readFileSync(copyLimitsDocumentPath, 'utf8')
}

function introText(markdown: string): string {
    return markdown.split(/^## /m)[0] ?? ''
}

function h2Sections(markdown: string): DocSection[] {
    return markdown
        .split(/^## /m)
        .slice(1)
        .map((chunk) => {
            const breakIndex = chunk.indexOf('\n')
            if (breakIndex === -1) {
                return {heading: chunk.trim(), body: ''}
            }
            return {heading: chunk.slice(0, breakIndex).trim(), body: chunk.slice(breakIndex + 1)}
        })
}

function sectionTitled(markdown: string, title: string): DocSection {
    const matched = h2Sections(markdown).filter((section) => section.heading === title)
    expect(
        matched.map((section) => section.heading),
        `docs/reference/copy-limits.md must hold exactly one "## ${title}" section`
    ).toHaveLength(1)
    return matched[0] ?? {heading: '', body: ''}
}

function cliSection(markdown: string): DocSection {
    return sectionTitled(markdown, CLI_SECTION_TITLE)
}

// Extracts the section's fences; throws unless they are exactly one text fence then one json fence.
function extractCliFences(section: DocSection): CliFences {
    const fences = [...section.body.matchAll(/^```(\w*)\n([\s\S]*?)\n```$/gm)].map((match) => ({
        language: match[1] ?? '',
        content: match[2] ?? '',
    }))
    const languages = fences.map((fence) => fence.language)
    if (languages.length !== 2 || languages[0] !== 'text' || languages[1] !== 'json') {
        throw new Error(`${FENCE_CONTRACT}; found fences: [${languages.join(', ')}]`)
    }
    return {text: fences[0]?.content ?? '', json: fences[1]?.content ?? ''}
}

// Byte-for-byte: the CLI's stdout must equal the fence content plus one newline.
function textMismatch(fenceContent: string, stdout: string): string | undefined {
    const expected = `${fenceContent}\n`
    if (stdout === expected) {
        return undefined
    }
    return `text fence mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(stdout)}`
}

// By parsed value: prettier expands the json fence while the CLI prints compact JSON.
function jsonMismatch(fenceContent: string, stdout: string): string | undefined {
    const documented = JSON.parse(fenceContent) as unknown
    const actual = JSON.parse(stdout) as unknown
    if (isDeepStrictEqual(actual, documented)) {
        return undefined
    }
    return `json fence mismatch: expected ${JSON.stringify(documented)}, got ${JSON.stringify(actual)}`
}

interface ExitCodeRowCells {
    meaning: string
    streams: string
}

function exitCodeRowCells(section: DocSection, code: string): ExitCodeRowCells {
    const rows = section.body.split('\n').filter((line) => line.trimStart().startsWith('|'))
    const matched = rows.filter((row) => {
        const cell = (row.split('|')[1] ?? '').trim().replace(/^`|`$/g, '')
        return cell === code
    })
    expect(matched, `the "${CLI_SECTION_TITLE}" exit-code table must hold exactly one row for ${code}`).toHaveLength(1)
    const cells = (matched[0] ?? '').split('|')
    return {meaning: (cells[2] ?? '').trim(), streams: (cells[3] ?? '').trim()}
}

function runCli(args: string[]): CommandResult {
    // Fixed Node executable, argument vector, no shell.
    const result = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, ...args], {
        cwd: projectRoot,
        env: {...process.env, TSX_TSCONFIG_PATH: join(projectRoot, 'tsconfig.json')},
        encoding: 'utf8',
        timeout: entryPointTimeout,
    })
    if (result.error !== undefined) {
        throw result.error
    }
    expect(result.signal).toBeNull()
    return {code: result.status, stdout: result.stdout, stderr: result.stderr}
}

function synthetic(sectionBody: string[]): DocSection {
    const markdown = ['# Reference: copy limits', '', `## ${CLI_SECTION_TITLE}`, '', ...sectionBody, ''].join('\n')
    return cliSection(markdown)
}

describe('the copy-limits.md intro', () => {
    it('names src/domain/validation/copyLimits.ts, COPY_LIMITS and pnpm copy-limits before the first H2', () => {
        const intro = introText(readCopyLimitsDocument())
        expect(intro).toContain('src/domain/validation/copyLimits.ts')
        expect(intro).toMatch(/\bCOPY_LIMITS\b/)
        expect(intro).toMatch(/\bpnpm copy-limits\b/)
    })
})

describe('documented pnpm copy-limits section in docs/reference/copy-limits.md', () => {
    it('holds one "List copy limits from the CLI" section naming the JSON invocation, the platforms and pnpm --silent', () => {
        const {body} = cliSection(readCopyLimitsDocument())
        expect(body).toContain('pnpm copy-limits --platform meta --json')
        expect(body).toMatch(/\brsa\b/)
        expect(body).toMatch(/\bpmax\b/)
        expect(body).toMatch(/\bmeta\b/)
        expect(body).toContain('pnpm --silent copy-limits')
    })

    it('holds exactly one text fence followed by exactly one prettier-expanded json fence of limits entries', () => {
        const fences = extractCliFences(cliSection(readCopyLimitsDocument()))
        expect(fences.text.split('\n')).toHaveLength(10)

        const documented = JSON.parse(fences.json) as Record<string, unknown>
        expect(Object.keys(documented)).toEqual(['limits'])
        const limits = documented['limits'] as Record<string, unknown>[]
        expect(limits.length).toBeGreaterThan(0)
        for (const entry of limits) {
            expect(Object.keys(entry)).toEqual(['platform', 'field', 'min', 'max', 'maxChars'])
        }
        expect(fences.json.split('\n').length, 'the json fence must not be hand-compacted').toBeGreaterThan(1)
    })

    it('extraction throws naming the expected fences when a synthetic section lacks the json fence', () => {
        const missingJson = synthetic(['```text', ...D10_LINES, '```'])
        expect(() => extractCliFences(missingJson)).toThrow(/exactly one text fence followed by exactly one json fence/)

        const reversed = synthetic([
            '```json',
            JSON.stringify(D11_META_PAYLOAD, null, 4),
            '```',
            '',
            '```text',
            ...D10_LINES,
            '```',
        ])
        expect(() => extractCliFences(reversed)).toThrow(/exactly one text fence followed by exactly one json fence/)

        const wellFormed = synthetic([
            '```text',
            ...D10_LINES,
            '```',
            '',
            '```json',
            JSON.stringify(D11_META_PAYLOAD, null, 4),
            '```',
        ])
        expect(extractCliFences(wellFormed)).toEqual({
            text: D10_LINES.join('\n'),
            json: JSON.stringify(D11_META_PAYLOAD, null, 4),
        })
    })

    it(
        'runs the entry point with no arguments: exit 0 and stdout equal to the ten-line text fence plus one newline',
        () => {
            const fences = extractCliFences(cliSection(readCopyLimitsDocument()))
            expect(fences.text.split('\n')).toHaveLength(10)
            const result = runCli([])
            expect(result.code).toBe(0)
            expect(result.stderr).toBe('')
            expect(result.stdout).toBe(`${fences.text}\n`)
            expect(textMismatch(fences.text, result.stdout)).toBeUndefined()
        },
        testTimeout
    )

    it(
        'runs the entry point with --platform meta --json: exit 0 and stdout parsing deep-equal to the json fence',
        () => {
            const fences = extractCliFences(cliSection(readCopyLimitsDocument()))
            const result = runCli(['--platform', 'meta', '--json'])
            expect(result.code).toBe(0)
            expect(result.stderr).toBe('')
            expect(JSON.parse(result.stdout)).toEqual(JSON.parse(fences.json))
            expect(jsonMismatch(fences.json, result.stdout)).toBeUndefined()
        },
        testTimeout
    )

    it(
        'documents exit 0 and 2 with their streams, and --platform tiktok really exits 2 with empty stdout',
        () => {
            const section = cliSection(readCopyLimitsDocument())

            const exit0 = exitCodeRowCells(section, '0')
            expect(exit0.streams).toMatch(/\bstdout\b/i)
            expect(exit0.streams).toMatch(/\bempty stderr\b/i)
            expect(exit0.streams).not.toMatch(/\bempty stdout\b/i)

            const exit2 = exitCodeRowCells(section, '2')
            expect(exit2.meaning).toMatch(/\busage\b/i)
            expect(exit2.meaning).toMatch(/\bunknown platform\b/i)
            expect(exit2.streams).toMatch(/\bempty stdout\b/i)
            expect(exit2.streams).toMatch(/\bstderr\b/i)
            expect(exit2.streams).not.toMatch(/\bempty stderr\b/i)

            const result = runCli(['--platform', 'tiktok'])
            expect(result.code).toBe(2)
            expect(result.stdout).toBe('')
        },
        testTimeout
    )
})

describe('documented copy limit catalogue interface in docs/reference/copy-limits.md', () => {
    it('holds one "Copy limit catalogue interface" section naming the module and its exports', () => {
        const {body} = sectionTitled(readCopyLimitsDocument(), INTERFACE_SECTION_TITLE)
        expect(body).toContain('@/domain/validation/copyLimits')
        for (const symbol of ['COPY_LIMITS', 'CopyLimit', 'listCopyLimits', 'UnknownCopyPlatformError']) {
            expect(body, `the interface section must name ${symbol}`).toMatch(new RegExp(`\\b${symbol}\\b`))
        }
    })
})

describe('documented-example comparisons report drift against actual CLI output', () => {
    it(
        'the text comparison accepts the D10 listing and reports a mismatch when the last line is meta descriptions 1-5 26',
        () => {
            const {stdout, code} = runCli([])
            expect(code).toBe(0)
            expect(textMismatch(D10_LINES.join('\n'), stdout)).toBeUndefined()

            const drifted = [...D10_LINES.slice(0, -1), 'meta descriptions 1-5 26']
            expect(drifted).toHaveLength(10)
            expect(drifted.at(-1)).toBe('meta descriptions 1-5 26')
            expect(textMismatch(drifted.join('\n'), stdout)).toMatch(/^text fence mismatch/)
        },
        testTimeout
    )

    it(
        'the JSON comparison accepts the D11 payload and reports a mismatch when meta headlines maxChars is 30',
        () => {
            const {stdout, code} = runCli(['--platform', 'meta', '--json'])
            expect(code).toBe(0)
            expect(jsonMismatch(JSON.stringify(D11_META_PAYLOAD, null, 4), stdout)).toBeUndefined()

            const drifted = structuredClone(D11_META_PAYLOAD)
            const headlines = drifted.limits.find((entry) => entry.field === 'headlines')
            if (headlines === undefined) {
                throw new Error('the D11 payload must hold a meta headlines entry')
            }
            headlines.maxChars = 30
            expect(drifted.limits.map((entry) => entry.maxChars)).toEqual([125, 30, 25])
            expect(jsonMismatch(JSON.stringify(drifted, null, 4), stdout)).toMatch(/^json fence mismatch/)
        },
        testTimeout
    )
})

describe('the headings that src/services/validate-copy/docs-examples.test.ts locates stay unique', () => {
    it('copy-limits.md keeps exactly one H2 matching /batch/i and exactly one matching /exported helpers/i', () => {
        const headings = h2Sections(readCopyLimitsDocument()).map((section) => section.heading)
        expect(headings.filter((heading) => /batch/i.test(heading))).toHaveLength(1)
        expect(headings.filter((heading) => /exported helpers/i.test(heading))).toHaveLength(1)
    })
})
