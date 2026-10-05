// @vitest-environment node

import {spawnSync} from 'node:child_process'
import {existsSync, readFileSync} from 'node:fs'
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

// --- fmt-007: the commands reference, the architecture overview and the Prettier gate.

const commandsDocumentPath = join(projectRoot, 'docs/reference/commands.md')
const architectureDocumentPath = join(projectRoot, 'docs/architecture/overview.md')
const prettierCliPath = join(projectRoot, 'node_modules/prettier/bin/prettier.cjs')
const syntheticDocPath = 'docs/reference/synthetic.md'

function readCommandsDocument(): string {
    return readFileSync(commandsDocumentPath, 'utf8')
}

function readArchitectureDocument(): string {
    return readFileSync(architectureDocumentPath, 'utf8')
}

// A section's body ends at the next heading of level 1 to 3, so prose from a later section never leaks in.
function headedSections(markdown: string, level: 2 | 3): DocSection[] {
    const marker = '#'.repeat(level)
    return markdown
        .split(new RegExp(`^${marker} `, 'm'))
        .slice(1)
        .map((chunk) => {
            const breakIndex = chunk.indexOf('\n')
            const heading = (breakIndex === -1 ? chunk : chunk.slice(0, breakIndex)).trim()
            const rest = breakIndex === -1 ? '' : chunk.slice(breakIndex + 1)
            const nextHeading = /^#{1,3} /m.exec(rest)
            return {heading, body: nextHeading === null ? rest : rest.slice(0, nextHeading.index)}
        })
}

function sectionsMatching(sections: DocSection[], predicate: (heading: string) => boolean): DocSection[] {
    return sections.filter((section) => predicate(section.heading))
}

function onlySection(matched: DocSection[], requirement: string): DocSection {
    expect(
        matched.map((section) => section.heading),
        requirement
    ).toHaveLength(1)
    return matched[0] ?? {heading: '', body: ''}
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

function containerViewMermaidLines(markdown: string): string[] {
    const container = onlySection(
        sectionsMatching(headedSections(markdown, 2), (heading) => heading === 'Container view'),
        'docs/architecture/overview.md must hold exactly one "## Container view" section'
    )
    const fences = [...container.body.matchAll(/^```mermaid\n([\s\S]*?)\n```$/gm)].map((match) => match[1] ?? '')
    expect(fences, 'the container view must hold exactly one mermaid diagram').toHaveLength(1)
    return (fences[0] ?? '').split('\n').map((line) => line.trim())
}

function runPrettierCheck(args: string[], input?: string): CommandResult {
    // Fixed Node executable and the repository's Prettier CLI, argument vector, no shell.
    const result = spawnSync(process.execPath, [prettierCliPath, '--check', ...args], {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 20000,
        ...(input === undefined ? {} : {input}),
    })
    if (result.error !== undefined) {
        throw result.error
    }
    expect(result.signal).toBeNull()
    return {code: result.status, stdout: result.stdout, stderr: result.stderr}
}

function syntheticMarkdown(jsonFence: string): string {
    return ['# Synthetic', '', '```json', jsonFence, '```', ''].join('\n')
}

describe('pnpm formats in the docs/reference/commands.md Application table', () => {
    it('holds exactly one pnpm formats row, linking to ad-formats.md#list-formats-from-the-cli', () => {
        const application = onlySection(
            sectionsMatching(headedSections(readCommandsDocument(), 2), (heading) => heading === 'Application'),
            'docs/reference/commands.md must hold exactly one "## Application" section'
        )
        const rows = tableRows(application.body).filter((cells) => /\bpnpm formats\b/.test(cells[0] ?? ''))
        expect(
            rows,
            'the Application table must hold exactly one row whose command cell names pnpm formats'
        ).toHaveLength(1)
        const row = rows[0] ?? []
        expect(row[0] ?? '').toContain('--platform <platform>')
        expect(row[0] ?? '').toContain('--json')
        expect(row.join(' | ')).toMatch(/\]\((?:\.\/)?ad-formats\.md#list-formats-from-the-cli\)/)
    })

    it('links to an anchor that the "List formats from the CLI" heading of ad-formats.md actually produces', () => {
        const slugs = headedSections(readAdFormatsDocument(), 2).map((section) =>
            section.heading
                .toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .trim()
                .replace(/\s+/g, '-')
        )
        expect(slugs.filter((slug) => slug === 'list-formats-from-the-cli')).toHaveLength(1)
    })
})

describe('pnpm formats in docs/architecture/overview.md', () => {
    it('holds exactly one H3 "Format listing" section naming pnpm formats, src/services/formats/ and listFormats', () => {
        const section = onlySection(
            sectionsMatching(headedSections(readArchitectureDocument(), 3), (heading) =>
                /format listing/i.test(heading)
            ),
            'docs/architecture/overview.md must hold exactly one "### " section matching /format listing/i'
        )
        expect(section.body).toMatch(/\bpnpm formats\b/)
        expect(section.body).toContain('src/services/formats/')
        expect(section.body).toMatch(/\blistFormats\b/)
    })

    it('draws a FormatsCLI --> Formats edge in the container view and declares the FormatsCLI node once', () => {
        const lines = containerViewMermaidLines(readArchitectureDocument())
        expect(lines.filter((line) => line === 'FormatsCLI --> Formats')).toHaveLength(1)
        expect(lines.filter((line) => /^FormatsCLI\[[^\]]+\]$/.test(line))).toHaveLength(1)
        expect(lines.filter((line) => /^Formats\[[^\]]+\]$/.test(line))).toHaveLength(1)
    })

    it('names formatCatalogue.ts in the Domain (src/domain/) section', () => {
        const domain = onlySection(
            sectionsMatching(headedSections(readArchitectureDocument(), 3), (heading) =>
                /^Domain \(`?src\/domain\/`?\)$/.test(heading)
            ),
            'docs/architecture/overview.md must hold exactly one "### Domain (src/domain/)" section'
        )
        expect(domain.body).toMatch(/\bformatCatalogue\.ts\b/)
    })
})

describe('the headings that src/services/validate-copy/docs-examples.test.ts locates stay unique', () => {
    it('commands.md keeps one validate H2 without batch and one batch H2; overview.md keeps one validate-copy H3', () => {
        const commandsH2 = headedSections(readCommandsDocument(), 2).map((section) => section.heading)
        expect(commandsH2.filter((heading) => /validate/i.test(heading) && !/batch/i.test(heading))).toHaveLength(1)
        expect(commandsH2.filter((heading) => /batch/i.test(heading))).toHaveLength(1)

        const overviewH3 = headedSections(readArchitectureDocument(), 3).map((section) => section.heading)
        expect(overviewH3.filter((heading) => /validate-copy|saved-copy/i.test(heading))).toHaveLength(1)
    })
})

describe('the existing pnpm format:check gate on the edited docs', () => {
    it('Prettier --check exits 0 for ad-formats.md, commands.md and overview.md', () => {
        const result = runPrettierCheck([
            'docs/reference/ad-formats.md',
            'docs/reference/commands.md',
            'docs/architecture/overview.md',
        ])
        expect(result.stderr).toBe('')
        expect(result.code).toBe(0)
    }, 30000)

    it('Prettier --check exits 1 for a hand-compacted json fence on stdin and writes no file', () => {
        const syntheticAbsolutePath = join(projectRoot, syntheticDocPath)
        expect(existsSync(syntheticAbsolutePath)).toBe(false)

        const compacted = runPrettierCheck(
            ['--stdin-filepath', syntheticDocPath],
            syntheticMarkdown(JSON.stringify(D10_META_PAYLOAD))
        )
        expect(compacted.code).toBe(1)

        // Control: the same payload, expanded, passes, so exit 1 above is the compact fence and not a config error.
        const expanded = runPrettierCheck(
            ['--stdin-filepath', syntheticDocPath],
            syntheticMarkdown(JSON.stringify(D10_META_PAYLOAD, null, 4))
        )
        expect(expanded.code).toBe(0)

        expect(existsSync(syntheticAbsolutePath)).toBe(false)
    }, 30000)
})
