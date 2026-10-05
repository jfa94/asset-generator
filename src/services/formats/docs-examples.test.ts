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

const projectRoot = resolve(import.meta.dirname, '../../..')
const cliPath = join(projectRoot, 'src/services/formats/cli.ts')
const tsxLoader = pathToFileURL(join(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href
const adFormatsDocumentPath = join(projectRoot, 'docs/reference/ad-formats.md')

const CLI_SECTION_TITLE = 'List formats from the CLI'
const INTERFACE_SECTION_TITLE = 'Format catalogue interface'
const FENCE_CONTRACT = `the "${CLI_SECTION_TITLE}" section must hold exactly one text fence followed by exactly one json fence`

// D9: the exact pnpm formats listing.
const D9_LINES = [
    'google-pmax landscape 1200x628 300:157',
    'google-pmax square 1200x1200 1:1',
    'google-pmax portrait 960x1200 4:5',
    'meta square 1080x1080 1:1',
    'meta feed 1080x1350 4:5',
    'meta story 1080x1920 9:16',
]

interface FormatJson {
    platform: string
    name: string
    width: number
    height: number
    aspectRatio: string
    safeZone?: {top: number; bottom: number}
}

// D10: the pnpm formats --platform meta --json payload.
const D10_META_PAYLOAD: {formats: FormatJson[]} = {
    formats: [
        {platform: 'meta', name: 'square', width: 1080, height: 1080, aspectRatio: '1:1'},
        {platform: 'meta', name: 'feed', width: 1080, height: 1350, aspectRatio: '4:5'},
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

function readAdFormatsDocument(): string {
    return readFileSync(adFormatsDocumentPath, 'utf8')
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
        `docs/reference/ad-formats.md must hold exactly one "## ${title}" section`
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
        timeout: 20000,
    })
    if (result.error !== undefined) {
        throw result.error
    }
    expect(result.signal).toBeNull()
    return {code: result.status, stdout: result.stdout, stderr: result.stderr}
}

function synthetic(sectionBody: string[]): DocSection {
    const markdown = ['# Reference: ad formats', '', `## ${CLI_SECTION_TITLE}`, '', ...sectionBody, ''].join('\n')
    return cliSection(markdown)
}

describe('documented pnpm formats section in docs/reference/ad-formats.md', () => {
    it('holds one "List formats from the CLI" section naming the invocations, platforms, exact ratio and pnpm format caution', () => {
        const {body} = cliSection(readAdFormatsDocument())
        expect(body).toContain('pnpm formats --platform meta --json')
        expect(body).toContain('google-pmax')
        expect(body).toMatch(/\bmeta\b/)
        expect(body).toContain('pnpm --silent formats')
        expect(body).toContain('300:157')

        const cautions = body
            .split(/\n{2,}/)
            .filter((paragraph) => /pnpm format(?!s)\b/.test(paragraph) && /prettier/i.test(paragraph))
        expect(cautions, 'the section must caution that pnpm format (singular) is the Prettier writer').toHaveLength(1)
        expect(cautions[0] ?? '', 'the caution must say pnpm format rewrites files').toMatch(/\b(re)?writ\w*\b/i)
    })

    it('holds exactly one text fence followed by exactly one json fence', () => {
        const fences = extractCliFences(cliSection(readAdFormatsDocument()))
        expect(fences.text.split('\n')).toHaveLength(6)
        expect(Object.keys(JSON.parse(fences.json) as Record<string, unknown>)).toEqual(['formats'])
    })

    it('extraction throws naming the expected fences when a synthetic section lacks the json fence', () => {
        const missingJson = synthetic(['```text', ...D9_LINES, '```'])
        expect(() => extractCliFences(missingJson)).toThrow(/exactly one text fence followed by exactly one json fence/)

        const reversed = synthetic([
            '```json',
            JSON.stringify(D10_META_PAYLOAD, null, 4),
            '```',
            '',
            '```text',
            ...D9_LINES,
            '```',
        ])
        expect(() => extractCliFences(reversed)).toThrow(/exactly one text fence followed by exactly one json fence/)

        const wellFormed = synthetic([
            '```text',
            ...D9_LINES,
            '```',
            '',
            '```json',
            JSON.stringify(D10_META_PAYLOAD, null, 4),
            '```',
        ])
        expect(extractCliFences(wellFormed)).toEqual({
            text: D9_LINES.join('\n'),
            json: JSON.stringify(D10_META_PAYLOAD, null, 4),
        })
    })

    it('runs the entry point with no arguments: exit 0 and stdout equal to the text fence plus one newline', () => {
        const fences = extractCliFences(cliSection(readAdFormatsDocument()))
        const result = runCli([])
        expect(result.code).toBe(0)
        expect(result.stderr).toBe('')
        expect(result.stdout).toBe(`${fences.text}\n`)
        expect(textMismatch(fences.text, result.stdout)).toBeUndefined()
    }, 30000)

    it('runs the entry point with --platform meta --json: exit 0 and stdout parsing deep-equal to the json fence', () => {
        const fences = extractCliFences(cliSection(readAdFormatsDocument()))
        const result = runCli(['--platform', 'meta', '--json'])
        expect(result.code).toBe(0)
        expect(result.stderr).toBe('')
        expect(JSON.parse(result.stdout)).toEqual(JSON.parse(fences.json))
        expect(jsonMismatch(fences.json, result.stdout)).toBeUndefined()
    }, 30000)

    it('documents exit 0 and 2 with their streams, and --platform tiktok really exits 2 with empty stdout', () => {
        const section = cliSection(readAdFormatsDocument())

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
    }, 30000)
})

describe('documented format catalogue interface in docs/reference/ad-formats.md', () => {
    it('holds one "Format catalogue interface" section naming the module and its four exports', () => {
        const {body} = sectionTitled(readAdFormatsDocument(), INTERFACE_SECTION_TITLE)
        expect(body).toContain('@/domain/formatCatalogue')
        for (const symbol of ['listFormats', 'FormatSpec', 'UnknownPlatformError', 'reduceAspectRatio']) {
            expect(body, `the interface section must name ${symbol}`).toMatch(new RegExp(`\\b${symbol}\\b`))
        }
    })
})

describe('documented-example comparisons report drift against actual CLI output', () => {
    it('the text comparison accepts the D9 listing and reports a mismatch when the meta story line ends 16:9', () => {
        const {stdout, code} = runCli([])
        expect(code).toBe(0)
        expect(textMismatch(D9_LINES.join('\n'), stdout)).toBeUndefined()

        const drifted = D9_LINES.map((line) =>
            line === 'meta story 1080x1920 9:16' ? 'meta story 1080x1920 16:9' : line
        )
        expect(drifted).not.toEqual(D9_LINES)
        expect(textMismatch(drifted.join('\n'), stdout)).toMatch(/^text fence mismatch/)
    }, 30000)

    it('the JSON comparison accepts the D10 payload and reports a mismatch when the story object has no safeZone', () => {
        const {stdout, code} = runCli(['--platform', 'meta', '--json'])
        expect(code).toBe(0)
        expect(jsonMismatch(JSON.stringify(D10_META_PAYLOAD, null, 4), stdout)).toBeUndefined()

        const drifted = structuredClone(D10_META_PAYLOAD)
        const story = drifted.formats.find((format) => format.name === 'story')
        if (story === undefined) {
            throw new Error('the D10 payload must hold a story object')
        }
        delete story.safeZone
        expect(Object.keys(story)).toEqual(['platform', 'name', 'width', 'height', 'aspectRatio'])
        expect(jsonMismatch(JSON.stringify(drifted, null, 4), stdout)).toMatch(/^json fence mismatch/)
    }, 30000)
})
