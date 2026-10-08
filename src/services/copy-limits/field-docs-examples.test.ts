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

interface SectionFences {
    text: string
    json: string
}

const projectRoot = resolve(import.meta.dirname, '../../..')
const cliPath = join(projectRoot, 'src/services/copy-limits/cli.ts')
const tsxLoader = pathToFileURL(join(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href
const prettierCliPath = join(projectRoot, 'node_modules/prettier/bin/prettier.cjs')
const copyLimitsDocumentPath = join(projectRoot, 'docs/reference/copy-limits.md')
const entryPointTimeout = 20000
const testTimeout = 30000

const CLI_SECTION_TITLE = 'List copy limits from the CLI'
const FIELD_SECTION_TITLE = 'Filter copy limits by field'
const INTERFACE_SECTION_TITLE = 'Copy limit catalogue interface'
const FIELD_SECTION_SLUG = 'filter-copy-limits-by-field'
const FENCE_CONTRACT = 'the section must hold exactly one text fence followed by exactly one json fence'

const ACCEPTED_FIELDS = [
    'headlines',
    'descriptions',
    'paths',
    'shortHeadlines',
    'longHeadlines',
    'businessName',
    'primaryTexts',
]
const UNKNOWN_HEADLINES_MESSAGE =
    'Unknown field "Headlines". Accepted values: headlines, descriptions, paths, shortHeadlines, longHeadlines, businessName, primaryTexts.'

const HEADLINES_LINES = ['rsa headlines 3-15 30', 'meta headlines 1-5 40']
const PMAX_DESCRIPTIONS_PAYLOAD = {
    limits: [{platform: 'pmax', field: 'descriptions', min: 2, max: 5, maxChars: 90}],
}

function readCopyLimitsDocument(): string {
    return readFileSync(copyLimitsDocumentPath, 'utf8')
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

// GitHub-style anchor slug: lowercase, strip all but word characters, spaces and hyphens, trim, spaces to hyphens.
function slugify(heading: string): string {
    return heading
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
}

// Throws unless the section holds exactly one text fence followed by exactly one json fence.
function extractFences(section: DocSection): SectionFences {
    const fences = [...section.body.matchAll(/^```(\w*)\n([\s\S]*?)\n```$/gm)].map((match) => ({
        language: match[1] ?? '',
        content: match[2] ?? '',
    }))
    const languages = fences.map((fence) => fence.language)
    if (languages.length !== 2 || languages[0] !== 'text' || languages[1] !== 'json') {
        throw new Error(`"${section.heading}": ${FENCE_CONTRACT}; found fences: [${languages.join(', ')}]`)
    }
    return {text: fences[0]?.content ?? '', json: fences[1]?.content ?? ''}
}

// Byte-for-byte: stdout must equal the fence content plus one newline.
function textMismatch(fenceContent: string, stdout: string): string | undefined {
    const expected = `${fenceContent}\n`
    if (stdout === expected) {
        return undefined
    }
    return `text fence mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(stdout)}`
}

// Compacting the Prettier-expanded fence pins values and key order while allowing the expanded layout.
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

function runPrettierCheck(args: string[]): CommandResult {
    // Fixed Node executable and the repository's Prettier CLI, argument vector, no shell.
    const result = spawnSync(process.execPath, [prettierCliPath, '--check', ...args], {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: entryPointTimeout,
    })
    if (result.error !== undefined) {
        throw result.error
    }
    expect(result.signal).toBeNull()
    return {code: result.status, stdout: result.stdout, stderr: result.stderr}
}

function fieldSection(): DocSection {
    return sectionTitled(readCopyLimitsDocument(), FIELD_SECTION_TITLE)
}

function syntheticFieldSection(sectionBody: string[]): DocSection {
    const markdown = ['# Reference: copy limits', '', `## ${FIELD_SECTION_TITLE}`, '', ...sectionBody, ''].join('\n')
    return sectionTitled(markdown, FIELD_SECTION_TITLE)
}

describe('the "Filter copy limits by field" H2 in docs/reference/copy-limits.md', () => {
    it('appears exactly once, directly after the CLI H2 and before the interface H2, with a unique slug', () => {
        const headings = h2Sections(readCopyLimitsDocument()).map((section) => section.heading)
        expect(headings.filter((heading) => heading === FIELD_SECTION_TITLE)).toHaveLength(1)

        const cliIndex = headings.indexOf(CLI_SECTION_TITLE)
        const fieldIndex = headings.indexOf(FIELD_SECTION_TITLE)
        const interfaceIndex = headings.indexOf(INTERFACE_SECTION_TITLE)
        expect(cliIndex).toBeGreaterThanOrEqual(0)
        expect(fieldIndex).toBe(cliIndex + 1)
        expect(interfaceIndex).toBeGreaterThan(fieldIndex)

        const slugs = headings.map((heading) => slugify(heading))
        expect(slugs.filter((slug) => slug === FIELD_SECTION_SLUG)).toHaveLength(1)
    })

    it('slugifies the new heading to the documented anchor', () => {
        expect(slugify(FIELD_SECTION_TITLE)).toBe(FIELD_SECTION_SLUG)
    })
})

describe('the "Filter copy limits by field" section content', () => {
    it('names --field <name>, the three documented invocations, {"limits":[]} and the exact Headlines message', () => {
        const {body} = fieldSection()
        expect(body).toContain('--field <name>')
        expect(body).toContain('pnpm copy-limits --field headlines')
        expect(body).toContain('pnpm copy-limits --field descriptions --platform pmax --json')
        expect(body).toContain('pnpm copy-limits --platform meta --field paths')
        expect(body).toContain('{"limits":[]}')
        expect(body).toContain(UNKNOWN_HEADLINES_MESSAGE)
    })

    it('lists the seven accepted fields in catalogue order outside the error message', () => {
        const {body} = fieldSection()
        const withoutMessage = body.split(UNKNOWN_HEADLINES_MESSAGE).join('')
        const inOrder = new RegExp(ACCEPTED_FIELDS.map((field) => `\\b${field}\\b`).join('\\W+'))
        expect(withoutMessage).toMatch(inOrder)
    })
})

describe('fence extraction for the "Filter copy limits by field" section', () => {
    it('finds exactly one two-line text fence followed by exactly one Prettier-expanded json fence', () => {
        const fences = extractFences(fieldSection())
        expect(fences.text.split('\n')).toEqual(HEADLINES_LINES)
        expect(JSON.parse(fences.json)).toEqual(PMAX_DESCRIPTIONS_PAYLOAD)
        expect(fences.json.split('\n').length, 'the json fence must not be hand-compacted').toBeGreaterThan(1)
    })

    it('throws when a synthetic section lacks the json fence or has the fences reversed', () => {
        const missingJson = syntheticFieldSection(['```text', ...HEADLINES_LINES, '```'])
        expect(() => extractFences(missingJson)).toThrow(/exactly one text fence followed by exactly one json fence/)

        const reversed = syntheticFieldSection([
            '```json',
            JSON.stringify(PMAX_DESCRIPTIONS_PAYLOAD, null, 4),
            '```',
            '',
            '```text',
            ...HEADLINES_LINES,
            '```',
        ])
        expect(() => extractFences(reversed)).toThrow(/exactly one text fence followed by exactly one json fence/)

        const wellFormed = syntheticFieldSection([
            '```text',
            ...HEADLINES_LINES,
            '```',
            '',
            '```json',
            JSON.stringify(PMAX_DESCRIPTIONS_PAYLOAD, null, 4),
            '```',
        ])
        expect(extractFences(wellFormed)).toEqual({
            text: HEADLINES_LINES.join('\n'),
            json: JSON.stringify(PMAX_DESCRIPTIONS_PAYLOAD, null, 4),
        })
    })
})

describe('the documented field examples match the actual Node/tsx entry point', () => {
    it(
        '--field headlines exits 0 with empty stderr and stdout equal to the text fence plus one newline',
        () => {
            const fences = extractFences(fieldSection())
            expect(fences.text).toBe('rsa headlines 3-15 30\nmeta headlines 1-5 40')
            const result = runCli(['--field', 'headlines'])
            expect(result.code).toBe(0)
            expect(result.stderr).toBe('')
            expect(result.stdout).toBe(`${fences.text}\n`)
            expect(textMismatch(fences.text, result.stdout)).toBeUndefined()
        },
        testTimeout
    )

    it(
        '--field descriptions --platform pmax --json exits 0 with stdout equal to the compacted json fence plus one newline',
        () => {
            const fences = extractFences(fieldSection())
            const documented = JSON.parse(fences.json) as unknown
            expect(documented).toEqual(PMAX_DESCRIPTIONS_PAYLOAD)
            expect(Object.keys((documented as typeof PMAX_DESCRIPTIONS_PAYLOAD).limits[0] ?? {})).toEqual([
                'platform',
                'field',
                'min',
                'max',
                'maxChars',
            ])

            const result = runCli(['--field', 'descriptions', '--platform', 'pmax', '--json'])
            expect(result.code).toBe(0)
            expect(result.stderr).toBe('')
            expect(result.stdout).toBe(`${JSON.stringify(documented)}\n`)
            expect(jsonMismatch(fences.json, result.stdout)).toBeUndefined()
        },
        testTimeout
    )
})

describe('the field example comparisons report drift against actual CLI output', () => {
    it(
        'the text comparison reports a mismatch when the meta headlines line ends 30 instead of 40',
        () => {
            const {code, stdout} = runCli(['--field', 'headlines'])
            expect(code).toBe(0)
            expect(textMismatch(HEADLINES_LINES.join('\n'), stdout)).toBeUndefined()

            const drifted = ['rsa headlines 3-15 30', 'meta headlines 1-5 30']
            expect(textMismatch(drifted.join('\n'), stdout)).toMatch(/^text fence mismatch/)
        },
        testTimeout
    )

    it(
        'the JSON comparison reports a mismatch when the pmax descriptions limit has maxChars 25',
        () => {
            const {code, stdout} = runCli(['--field', 'descriptions', '--platform', 'pmax', '--json'])
            expect(code).toBe(0)
            expect(jsonMismatch(JSON.stringify(PMAX_DESCRIPTIONS_PAYLOAD, null, 4), stdout)).toBeUndefined()

            const drifted = structuredClone(PMAX_DESCRIPTIONS_PAYLOAD)
            const [limit] = drifted.limits
            if (limit === undefined) {
                throw new Error('the pmax descriptions payload must hold one limit')
            }
            limit.maxChars = 25
            expect(drifted.limits).toEqual([{platform: 'pmax', field: 'descriptions', min: 2, max: 5, maxChars: 25}])
            expect(jsonMismatch(JSON.stringify(drifted, null, 4), stdout)).toMatch(/^json fence mismatch/)
        },
        testTimeout
    )
})

describe('the documented unknown-field and empty-result statements hold for the entry point', () => {
    it(
        '--field Headlines exits 2 with empty stdout and stderr equal to the documented message plus a newline',
        () => {
            expect(fieldSection().body).toContain(UNKNOWN_HEADLINES_MESSAGE)
            const result = runCli(['--field', 'Headlines'])
            expect(result.code).toBe(2)
            expect(result.stdout).toBe('')
            expect(result.stderr).toBe(`${UNKNOWN_HEADLINES_MESSAGE}\n`)
        },
        testTimeout
    )

    it(
        '--platform meta --field paths exits 0 with empty stdout and empty stderr',
        () => {
            expect(fieldSection().body).toContain('pnpm copy-limits --platform meta --field paths')
            const result = runCli(['--platform', 'meta', '--field', 'paths'])
            expect(result.code).toBe(0)
            expect(result.stdout).toBe('')
            expect(result.stderr).toBe('')
        },
        testTimeout
    )

    it(
        '--platform meta --field paths --json prints exactly {"limits":[]} plus a newline',
        () => {
            expect(fieldSection().body).toContain('{"limits":[]}')
            const result = runCli(['--platform', 'meta', '--field', 'paths', '--json'])
            expect(result.code).toBe(0)
            expect(result.stderr).toBe('')
            expect(result.stdout).toBe('{"limits":[]}\n')
        },
        testTimeout
    )
})

describe('the CLI and interface sections document --field', () => {
    it('the CLI section has exactly one --field <name> option row linking to #filter-copy-limits-by-field', () => {
        const {body} = sectionTitled(readCopyLimitsDocument(), CLI_SECTION_TITLE)
        const rows = tableRows(body).filter((cells) => (cells[0] ?? '').includes('--field <name>'))
        expect(rows, 'the CLI section must hold exactly one row whose first cell names --field <name>').toHaveLength(1)
        expect((rows[0] ?? []).join(' | ')).toContain(`](#${FIELD_SECTION_SLUG})`)
    })

    it('the CLI section synopsis names --field <name> between --platform and --json', () => {
        const {body} = sectionTitled(readCopyLimitsDocument(), CLI_SECTION_TITLE)
        expect(body).toContain('pnpm copy-limits [--platform <platform>] [--field <name>] [--json]')
    })

    it('the CLI section exit-2 row mentions usage, unknown platform and unknown field', () => {
        const {body} = sectionTitled(readCopyLimitsDocument(), CLI_SECTION_TITLE)
        const exit2 = tableRows(body).filter((cells) => (cells[0] ?? '').replace(/^`|`$/g, '') === '2')
        expect(exit2, 'the CLI section exit-code table must hold exactly one row for 2').toHaveLength(1)
        const meaning = (exit2[0] ?? [])[1] ?? ''
        expect(meaning).toMatch(/\busage\b/i)
        expect(meaning).toMatch(/\bunknown platform\b/i)
        expect(meaning).toMatch(/\bunknown field\b/i)
    })

    it('the CLI section keeps exactly one text fence then one json fence and gains no H3', () => {
        const section = sectionTitled(readCopyLimitsDocument(), CLI_SECTION_TITLE)
        const fences = extractFences(section)
        expect(fences.text.split('\n')).toHaveLength(10)
        expect(section.body).not.toMatch(/^### /m)
    })

    it('the interface section names UnknownCopyFieldError and the two-parameter listCopyLimits', () => {
        const {body} = sectionTitled(readCopyLimitsDocument(), INTERFACE_SECTION_TITLE)
        expect(body).toMatch(/\bUnknownCopyFieldError\b/)
        expect(body).toContain('listCopyLimits(platform?: string, field?: string)')
    })
})

describe('the format:check gate on the edited copy-limits reference', () => {
    it(
        'Prettier --check exits 0 for docs/reference/copy-limits.md',
        () => {
            const result = runPrettierCheck(['docs/reference/copy-limits.md'])
            expect(result.stderr).toBe('')
            expect(result.code).toBe(0)
        },
        testTimeout
    )
})
