// @vitest-environment node

import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
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

interface AspectFences {
    text: string
    json: string
}

interface FormatJson {
    platform: string
    name: string
    width: number
    height: number
    aspectRatio: string
    safeZone?: {top: number; bottom: number}
}

const projectRoot = resolve(import.meta.dirname, '../../..')
const cliPath = join(projectRoot, 'src/services/formats/cli.ts')
const tsxLoader = pathToFileURL(join(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href
const prettierCliPath = join(projectRoot, 'node_modules/prettier/bin/prettier.cjs')
const adFormatsDocumentPath = join(projectRoot, 'docs/reference/ad-formats.md')

const CLI_SECTION_TITLE = 'List formats from the CLI'
const ASPECT_SECTION_TITLE = 'Filter formats by aspect ratio'
const INTERFACE_SECTION_TITLE = 'Format catalogue interface'
const ASPECT_SLUG = 'filter-formats-by-aspect-ratio'
const FENCE_CONTRACT = `the "${ASPECT_SECTION_TITLE}" section must hold exactly one text fence followed by exactly one json fence`

const MALFORMED_9_16_MESSAGE = 'Invalid aspect ratio "9-16". Expected W:H with positive integers, for example 9:16.'

// pnpm formats --aspect 2:2: both 1:1 formats in catalogue order.
const SQUARE_LINES = ['google-pmax square 1200x1200 1:1', 'meta square 1080x1080 1:1']

// pnpm formats --aspect 9:16 --platform meta --json payload.
const META_STORY_PAYLOAD: {formats: FormatJson[]} = {
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

function readAdFormatsDocument(): string {
    return readFileSync(adFormatsDocumentPath, 'utf8')
}

// H2 sections; a body runs until the next H2, so H3 subsections stay inside it.
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

function githubSlug(heading: string): string {
    return heading
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
}

function sectionTitled(markdown: string, title: string): DocSection {
    const matched = h2Sections(markdown).filter((section) => section.heading === title)
    expect(
        matched.map((section) => section.heading),
        `docs/reference/ad-formats.md must hold exactly one "## ${title}" section`
    ).toHaveLength(1)
    return matched[0] ?? {heading: '', body: ''}
}

function aspectSection(markdown: string): DocSection {
    return sectionTitled(markdown, ASPECT_SECTION_TITLE)
}

// Extracts the section's fences; throws unless they are exactly one text fence then one json fence.
function extractAspectFences(section: DocSection): AspectFences {
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

// Byte-for-byte: stdout must equal the text fence content plus one newline.
function textMismatch(fenceContent: string, stdout: string): string | undefined {
    const expected = `${fenceContent}\n`
    if (stdout === expected) {
        return undefined
    }
    return `text fence mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(stdout)}`
}

// Compacted fence: pins values and key order while Prettier may expand the fence.
function jsonMismatch(fenceContent: string, stdout: string): string | undefined {
    const expected = `${JSON.stringify(JSON.parse(fenceContent))}\n`
    if (stdout === expected) {
        return undefined
    }
    return `json fence mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(stdout)}`
}

function tableRows(body: string): string[][] {
    return body
        .split('\n')
        .filter((line) => line.trimStart().startsWith('|'))
        .map((line) =>
            line
                .trim()
                .replace(/^\||\|$/g, '')
                .split('|')
                .map((cell) => cell.trim())
        )
}

function exitCodeRow(section: DocSection, code: string): string[] {
    const matched = tableRows(section.body).filter((cells) => (cells[0] ?? '').replace(/^`|`$/g, '') === code)
    expect(matched, `the "${CLI_SECTION_TITLE}" exit-code table must hold exactly one row for ${code}`).toHaveLength(1)
    return matched[0] ?? []
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

function runPrettierCheck(args: string[]): CommandResult {
    // Fixed Node executable and the repository's Prettier CLI, argument vector, no shell.
    const result = spawnSync(process.execPath, [prettierCliPath, '--check', ...args], {
        cwd: projectRoot,
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
    const markdown = ['# Reference: ad formats', '', `## ${ASPECT_SECTION_TITLE}`, '', ...sectionBody, ''].join('\n')
    return aspectSection(markdown)
}

describe('the "Filter formats by aspect ratio" section of docs/reference/ad-formats.md', () => {
    it('is exactly one H2, directly after the CLI H2 and before the interface H2, with a unique slug', () => {
        const headings = h2Sections(readAdFormatsDocument()).map((section) => section.heading)
        expect(headings.filter((heading) => heading === ASPECT_SECTION_TITLE)).toHaveLength(1)

        const cliIndex = headings.indexOf(CLI_SECTION_TITLE)
        const aspectIndex = headings.indexOf(ASPECT_SECTION_TITLE)
        const interfaceIndex = headings.indexOf(INTERFACE_SECTION_TITLE)
        expect(cliIndex).toBeGreaterThanOrEqual(0)
        expect(aspectIndex).toBe(cliIndex + 1)
        expect(interfaceIndex).toBeGreaterThan(aspectIndex)

        const slugs = headings.map(githubSlug)
        expect(slugs.filter((slug) => slug === ASPECT_SLUG)).toEqual([ASPECT_SLUG])
    })

    it('names --aspect <W:H>, both documented invocations, the reductions, the empty result and the 9-16 message', () => {
        const {body} = aspectSection(readAdFormatsDocument())
        expect(body).toContain('--aspect <W:H>')
        expect(body).toContain('pnpm formats --aspect 2:2')
        expect(body).toContain('pnpm formats --aspect 9:16 --platform meta --json')
        expect(body).toContain('2:2')
        expect(body).toContain('1:1')
        expect(body).toContain('1.91:1')
        expect(body).toContain('300:157')
        expect(body).toContain('{"formats":[]}')
        expect(body).toContain(MALFORMED_9_16_MESSAGE)
    })

    it('holds exactly one text fence followed by exactly one json fence', () => {
        const fences = extractAspectFences(aspectSection(readAdFormatsDocument()))
        expect(fences.text).toBe(SQUARE_LINES.join('\n'))
        expect(JSON.parse(fences.json)).toEqual(META_STORY_PAYLOAD)
    })

    it('extraction throws for a synthetic section that lacks the json fence or has the fences reversed', () => {
        const missingJson = synthetic(['```text', ...SQUARE_LINES, '```'])
        expect(() => extractAspectFences(missingJson)).toThrow(
            /exactly one text fence followed by exactly one json fence; found fences: \[text\]/
        )

        const reversed = synthetic([
            '```json',
            JSON.stringify(META_STORY_PAYLOAD, null, 4),
            '```',
            '',
            '```text',
            ...SQUARE_LINES,
            '```',
        ])
        expect(() => extractAspectFences(reversed)).toThrow(
            /exactly one text fence followed by exactly one json fence; found fences: \[json, text\]/
        )

        const wellFormed = synthetic([
            '```text',
            ...SQUARE_LINES,
            '```',
            '',
            '```json',
            JSON.stringify(META_STORY_PAYLOAD, null, 4),
            '```',
        ])
        expect(extractAspectFences(wellFormed)).toEqual({
            text: SQUARE_LINES.join('\n'),
            json: JSON.stringify(META_STORY_PAYLOAD, null, 4),
        })
    })
})

describe('the documented aspect examples match the actual Node/tsx entry point', () => {
    it('--aspect 2:2 exits 0 with empty stderr and stdout equal to the text fence plus one newline', () => {
        const fences = extractAspectFences(aspectSection(readAdFormatsDocument()))
        const result = runCli(['--aspect', '2:2'])
        expect(result.code).toBe(0)
        expect(result.stderr).toBe('')
        expect(result.stdout).toBe(`${fences.text}\n`)
        expect(textMismatch(fences.text, result.stdout)).toBeUndefined()
    }, 30000)

    it('--aspect 9:16 --platform meta --json exits 0 with stdout equal to the compacted json fence plus one newline', () => {
        const fences = extractAspectFences(aspectSection(readAdFormatsDocument()))
        const documented = JSON.parse(fences.json) as {formats: FormatJson[]}
        expect(documented).toEqual(META_STORY_PAYLOAD)
        expect(documented.formats).toHaveLength(1)

        const result = runCli(['--aspect', '9:16', '--platform', 'meta', '--json'])
        expect(result.code).toBe(0)
        expect(result.stderr).toBe('')
        expect(result.stdout).toBe(`${JSON.stringify(documented)}\n`)
        expect(jsonMismatch(fences.json, result.stdout)).toBeUndefined()
    }, 30000)

    it('--aspect 9-16 exits 2 with empty stdout and stderr equal to the documented message plus a newline', () => {
        expect(aspectSection(readAdFormatsDocument()).body).toContain(MALFORMED_9_16_MESSAGE)
        const result = runCli(['--aspect', '9-16'])
        expect(result.code).toBe(2)
        expect(result.stdout).toBe('')
        expect(result.stderr).toBe(`${MALFORMED_9_16_MESSAGE}\n`)
    }, 30000)

    it('--aspect 16:9 exits 0 with empty stdout and empty stderr', () => {
        const result = runCli(['--aspect', '16:9'])
        expect(result.code).toBe(0)
        expect(result.stdout).toBe('')
        expect(result.stderr).toBe('')
    }, 30000)

    it('--aspect 16:9 --json prints exactly the documented {"formats":[]} plus a newline', () => {
        expect(aspectSection(readAdFormatsDocument()).body).toContain('{"formats":[]}')
        const result = runCli(['--aspect', '16:9', '--json'])
        expect(result.code).toBe(0)
        expect(result.stderr).toBe('')
        expect(result.stdout).toBe('{"formats":[]}\n')
    }, 30000)
})

describe('the aspect example comparisons report drift against actual CLI output', () => {
    it('the text comparison accepts the 1:1 listing and reports a mismatch when the meta square line ends 4:5', () => {
        const {stdout, code} = runCli(['--aspect', '2:2'])
        expect(code).toBe(0)
        expect(textMismatch(SQUARE_LINES.join('\n'), stdout)).toBeUndefined()

        const drifted = SQUARE_LINES.map((line) =>
            line === 'meta square 1080x1080 1:1' ? 'meta square 1080x1080 4:5' : line
        )
        expect(drifted).not.toEqual(SQUARE_LINES)
        expect(textMismatch(drifted.join('\n'), stdout)).toMatch(/^text fence mismatch/)
    }, 30000)

    it('the JSON comparison accepts the meta story payload and reports a mismatch when the story has no safeZone', () => {
        const {stdout, code} = runCli(['--aspect', '9:16', '--platform', 'meta', '--json'])
        expect(code).toBe(0)
        expect(jsonMismatch(JSON.stringify(META_STORY_PAYLOAD, null, 4), stdout)).toBeUndefined()

        const drifted = structuredClone(META_STORY_PAYLOAD)
        const story = drifted.formats[0]
        if (story === undefined) {
            throw new Error('the meta story payload must hold one format')
        }
        delete story.safeZone
        expect(Object.keys(story)).toEqual(['platform', 'name', 'width', 'height', 'aspectRatio'])
        expect(jsonMismatch(JSON.stringify(drifted, null, 4), stdout)).toMatch(/^json fence mismatch/)
    }, 30000)
})

describe('the CLI and interface sections document --aspect', () => {
    it('the CLI section synopsis names --aspect <W:H> between --platform and --json', () => {
        const {body} = sectionTitled(readAdFormatsDocument(), CLI_SECTION_TITLE)
        expect(body).toContain('pnpm formats [--platform <platform>] [--aspect <W:H>] [--json]')
    })

    it('the CLI section has exactly one --aspect <W:H> option row, linking to #filter-formats-by-aspect-ratio', () => {
        const {body} = sectionTitled(readAdFormatsDocument(), CLI_SECTION_TITLE)
        const rows = tableRows(body).filter((cells) => (cells[0] ?? '').includes('--aspect <W:H>'))
        expect(rows, 'exactly one table row whose first cell names --aspect <W:H>').toHaveLength(1)
        expect((rows[0] ?? []).join(' | ')).toMatch(/\]\(#filter-formats-by-aspect-ratio\)/)
    })

    it('the CLI section exit-2 row meaning names usage, unknown platform and malformed aspect ratio', () => {
        const row = exitCodeRow(sectionTitled(readAdFormatsDocument(), CLI_SECTION_TITLE), '2')
        const meaning = row[1] ?? ''
        expect(meaning).toMatch(/\busage\b/i)
        expect(meaning).toMatch(/\bunknown platform\b/i)
        expect(meaning).toMatch(/\baspect ratio\b/i)
    })

    it('the interface section names InvalidAspectRatioError in a table row and the two-parameter listFormats', () => {
        const {body} = sectionTitled(readAdFormatsDocument(), INTERFACE_SECTION_TITLE)
        expect(body).toContain('listFormats(platform?: string, aspectRatio?: string)')
        const errorRows = tableRows(body).filter((cells) =>
            cells.some((cell) => cell.includes('InvalidAspectRatioError'))
        )
        expect(errorRows.length, 'a table row must name InvalidAspectRatioError').toBeGreaterThanOrEqual(1)
    })
})

describe('the pnpm format:check gate on the edited ad-formats reference', () => {
    it('Prettier --check exits 0 for docs/reference/ad-formats.md', () => {
        const result = runPrettierCheck(['docs/reference/ad-formats.md'])
        expect(result.stderr).toBe('')
        expect(result.code).toBe(0)
    }, 30000)
})
