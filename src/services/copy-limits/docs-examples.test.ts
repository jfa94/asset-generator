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

// --- cl-009: the commands reference, the architecture overview and the Prettier gate.

const commandsDocumentPath = join(projectRoot, 'docs/reference/commands.md')
const architectureDocumentPath = join(projectRoot, 'docs/architecture/overview.md')
const prettierCliPath = join(projectRoot, 'node_modules/prettier/bin/prettier.cjs')
const syntheticDocPath = 'docs/reference/synthetic.md'
const prettierTimeout = 20000

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

function onlySection(sections: DocSection[], predicate: (heading: string) => boolean, requirement: string): DocSection {
    const matched = sections.filter((section) => predicate(section.heading))
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

function applicationRows(): string[][] {
    const application = onlySection(
        headedSections(readCommandsDocument(), 2),
        (heading) => heading === 'Application',
        'docs/reference/commands.md must hold exactly one "## Application" section'
    )
    return tableRows(application.body)
}

// GitHub-style anchor slug: lowercase, strip all but word characters, spaces and hyphens, trim, spaces to hyphens.
function slugify(heading: string): string {
    return heading
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
}

function containerViewMermaidLines(markdown: string): string[] {
    const container = onlySection(
        headedSections(markdown, 2),
        (heading) => heading === 'Container view',
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
        timeout: prettierTimeout,
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

describe('pnpm copy-limits in the docs/reference/commands.md Application table', () => {
    it('holds exactly one pnpm copy-limits row with --platform <platform> and --json, linking to copy-limits.md#list-copy-limits-from-the-cli', () => {
        const rows = applicationRows().filter((cells) => /\bpnpm copy-limits\b/.test(cells[0] ?? ''))
        expect(
            rows,
            'the Application table must hold exactly one row whose command cell names pnpm copy-limits'
        ).toHaveLength(1)
        const row = rows[0] ?? []
        expect(row[0] ?? '').toContain('--platform <platform>')
        expect(row[0] ?? '').toContain('--json')
        expect(row.join(' | ')).toMatch(/\]\((?:\.\/)?copy-limits\.md#list-copy-limits-from-the-cli\)/)
    })

    it('links to an anchor that the "List copy limits from the CLI" heading of copy-limits.md actually produces', () => {
        const slugs = headedSections(readCopyLimitsDocument(), 2).map((section) => slugify(section.heading))
        expect(slugs.filter((slug) => slug === 'list-copy-limits-from-the-cli')).toHaveLength(1)
    })

    it('slugifies headings the way the link anchor expects', () => {
        expect(slugify('List copy limits from the CLI')).toBe('list-copy-limits-from-the-cli')
        expect(slugify('  Validate saved copy (`pnpm validate-copy`)  ')).toBe('validate-saved-copy-pnpm-validate-copy')
    })
})

describe('pnpm copy-limits in docs/architecture/overview.md', () => {
    it('holds exactly one H3 "Copy-limit listing" section naming pnpm copy-limits, src/services/copy-limits/ and listCopyLimits', () => {
        const section = onlySection(
            headedSections(readArchitectureDocument(), 3),
            (heading) => /copy-limit listing/i.test(heading),
            'docs/architecture/overview.md must hold exactly one "### " section matching /copy-limit listing/i'
        )
        expect(section.body).toMatch(/\bpnpm copy-limits\b/)
        expect(section.body).toContain('src/services/copy-limits/')
        expect(section.body).toMatch(/\blistCopyLimits\b/)
    })

    it('draws one CopyLimitsCLI --> CopyVal edge and declares the CopyLimitsCLI and CopyVal nodes once each', () => {
        const lines = containerViewMermaidLines(readArchitectureDocument())
        expect(lines.filter((line) => line === 'CopyLimitsCLI --> CopyVal')).toHaveLength(1)
        expect(lines.filter((line) => /^CopyLimitsCLI\[[^\]]+\]$/.test(line))).toHaveLength(1)
        expect(lines.filter((line) => /^CopyVal\[[^\]]+\]$/.test(line))).toHaveLength(1)
    })

    it('names both copyLimits.ts and formatCatalogue.ts in the Domain (src/domain/) section', () => {
        const domain = onlySection(
            headedSections(readArchitectureDocument(), 3),
            (heading) => /^Domain \(`?src\/domain\/`?\)$/.test(heading),
            'docs/architecture/overview.md must hold exactly one "### Domain (src/domain/)" section'
        )
        expect(domain.body).toMatch(/\bcopyLimits\.ts\b/)
        expect(domain.body).toMatch(/\bformatCatalogue\.ts\b/)
    })
})

describe('the commands.md and overview.md anchors the validate-copy and formats docs tests locate stay unique', () => {
    it('commands.md keeps one validate H2 without batch, one batch H2 and one pnpm formats Application row', () => {
        const commandsH2 = headedSections(readCommandsDocument(), 2).map((section) => section.heading)
        expect(commandsH2.filter((heading) => /validate/i.test(heading) && !/batch/i.test(heading))).toHaveLength(1)
        expect(commandsH2.filter((heading) => /batch/i.test(heading))).toHaveLength(1)
        expect(applicationRows().filter((cells) => /\bpnpm formats\b/.test(cells[0] ?? ''))).toHaveLength(1)
    })

    it('overview.md keeps one validate-copy H3, one format listing H3 and one FormatsCLI --> Formats line', () => {
        const overview = readArchitectureDocument()
        const overviewH3 = headedSections(overview, 3).map((section) => section.heading)
        expect(overviewH3.filter((heading) => /validate-copy|saved-copy/i.test(heading))).toHaveLength(1)
        expect(overviewH3.filter((heading) => /format listing/i.test(heading))).toHaveLength(1)
        expect(containerViewMermaidLines(overview).filter((line) => line === 'FormatsCLI --> Formats')).toHaveLength(1)
    })
})

describe('the existing pnpm format:check gate on the edited docs', () => {
    it(
        'Prettier --check exits 0 for copy-limits.md, commands.md and overview.md',
        () => {
            const result = runPrettierCheck([
                'docs/reference/copy-limits.md',
                'docs/reference/commands.md',
                'docs/architecture/overview.md',
            ])
            expect(result.stderr).toBe('')
            expect(result.code).toBe(0)
        },
        testTimeout
    )

    it(
        'Prettier --check exits 1 for a hand-compacted json fence on stdin, 0 for the expanded control, and writes no file',
        () => {
            const syntheticAbsolutePath = join(projectRoot, syntheticDocPath)
            expect(existsSync(syntheticAbsolutePath)).toBe(false)

            const compacted = runPrettierCheck(
                ['--stdin-filepath', syntheticDocPath],
                syntheticMarkdown(JSON.stringify(D11_META_PAYLOAD))
            )
            expect(compacted.code).toBe(1)

            // Control: the same payload, expanded, passes, so exit 1 above is the compact fence and not a config error.
            const expanded = runPrettierCheck(
                ['--stdin-filepath', syntheticDocPath],
                syntheticMarkdown(JSON.stringify(D11_META_PAYLOAD, null, 4))
            )
            expect(expanded.code).toBe(0)

            expect(existsSync(syntheticAbsolutePath)).toBe(false)
        },
        testTimeout
    )
})
