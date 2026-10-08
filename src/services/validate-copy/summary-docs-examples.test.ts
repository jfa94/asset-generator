// @vitest-environment node

import {spawnSync} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

interface CommandResult {
    code: number | null
    stdout: string
    stderr: string
}

interface DocSection {
    heading: string
    body: string
}

const projectRoot = resolve(import.meta.dirname, '../../..')
const cliPath = join(projectRoot, 'src/services/validate-copy/cli.ts')
const tsxLoader = pathToFileURL(join(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href
const prettierBin = join(projectRoot, 'node_modules/prettier/bin/prettier.cjs')
const commandsDocumentPath = join(projectRoot, 'docs/reference/commands.md')
const slowTimeout = 30000

const SUMMARY_HEADING = 'Summarise copy issues by field'
const BATCH_HEADING = 'Validate a batch of saved copy'
const QUALITY_HEADING = 'Quality commands'
const SUMMARY_ANCHOR = 'summarise-copy-issues-by-field'

const summaryBlockContract =
    'the summary section of docs/reference/commands.md must hold exactly two fenced json blocks in document order: a batch input then its summary output'

function readCommandsDocument(): string {
    return readFileSync(commandsDocumentPath, 'utf8')
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

function jsonFences(body: string): string[] {
    return [...body.matchAll(/^```json\n([\s\S]*?)\n```$/gm)].map((match) => match[1] ?? '')
}

function paragraphs(body: string): string[] {
    return body.split(/\n{2,}/)
}

// GitHub-style heading anchor: lowercase, drop punctuation, spaces become hyphens.
function githubSlug(heading: string): string {
    return heading
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .replace(/\s/g, '-')
}

function exactlyOneSection(markdown: string, heading: string): DocSection {
    const matched = h2Sections(markdown).filter((section) => section.heading === heading)
    expect(
        matched.map((section) => section.heading),
        `docs/reference/commands.md must hold exactly one "## ${heading}" section`
    ).toHaveLength(1)
    return matched[0] ?? {heading: '', body: ''}
}

function summarySection(markdown: string): DocSection {
    return exactlyOneSection(markdown, SUMMARY_HEADING)
}

function batchSection(markdown: string): DocSection {
    const matched = h2Sections(markdown).filter((section) => /batch/i.test(section.heading))
    expect(
        matched.map((section) => section.heading),
        'docs/reference/commands.md must hold exactly one "## " section matching /batch/i'
    ).toHaveLength(1)
    return matched[0] ?? {heading: '', body: ''}
}

function summaryJsonBlocks(markdown: string): string[] {
    const blocks = jsonFences(summarySection(markdown).body)
    expect(blocks, summaryBlockContract).toHaveLength(2)
    return blocks
}

function exitCodeRows(section: DocSection, code: string): string[] {
    return section.body
        .split('\n')
        .filter((line) => line.startsWith('|'))
        .filter((row) => new RegExp(`^\\s*\`?${code}\`?\\s*$`).test(row.split('|')[1] ?? ''))
}

function parseJson(text: string): unknown {
    return JSON.parse(text) as unknown
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
    expect(typeof value === 'object' && value !== null && !Array.isArray(value), `${label} must be a JSON object`).toBe(
        true
    )
    return value as Record<string, unknown>
}

function asArray(value: unknown, label: string): unknown[] {
    expect(Array.isArray(value), `${label} must be a JSON array`).toBe(true)
    return value as unknown[]
}

let fixtureDirectory: string

beforeEach(() => {
    fixtureDirectory = mkdtempSync(join(tmpdir(), 'summary-docs-examples-test-'))
})

afterEach(() => {
    rmSync(fixtureDirectory, {recursive: true})
})

function saveFixture(name: string, contents: string): string {
    const path = join(fixtureDirectory, name)
    writeFileSync(path, contents, 'utf8')
    return path
}

function runNode(args: string[]): CommandResult {
    // Fixed Node executable, argument vector, no shell; paths are isolated test fixtures.
    const result = spawnSync(process.execPath, args, {
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

function runCli(args: string[]): CommandResult {
    return runNode(['--import', tsxLoader, cliPath, ...args])
}

describe('documented --summary section in docs/reference/commands.md', () => {
    it('holds exactly one summary H2 directly after the batch H2 and before Quality commands, keeping the validate and batch H2 counts', () => {
        const markdown = readCommandsDocument()
        const headings = h2Sections(markdown).map((section) => section.heading)

        expect(headings.filter((heading) => heading === SUMMARY_HEADING)).toHaveLength(1)
        expect(headings.filter((heading) => heading === BATCH_HEADING)).toHaveLength(1)
        expect(headings.filter((heading) => heading === QUALITY_HEADING)).toHaveLength(1)

        const summaryIndex = headings.indexOf(SUMMARY_HEADING)
        const batchIndex = headings.indexOf(BATCH_HEADING)
        const qualityIndex = headings.indexOf(QUALITY_HEADING)
        expect(summaryIndex).toBe(batchIndex + 1)
        expect(summaryIndex).toBeLessThan(qualityIndex)

        expect(headings.filter((heading) => /validate/i.test(heading) && !/batch/i.test(heading))).toHaveLength(1)
        expect(headings.filter((heading) => /batch/i.test(heading))).toEqual([BATCH_HEADING])
    })

    it('names validate-copy --batch with --summary, the --silent form, both flag positions and the usage error', () => {
        const {body} = summarySection(readCommandsDocument())

        expect(body).toMatch(/pnpm validate-copy --batch [^\n]*--summary/)
        expect(body).toMatch(/pnpm --silent validate-copy [^\n]*--summary/)

        const positionParagraphs = paragraphs(body).filter(
            (paragraph) =>
                paragraph.includes('--summary') &&
                paragraph.includes('--batch <file.json>') &&
                /\bbefore\b/i.test(paragraph) &&
                /\bafter\b/i.test(paragraph)
        )
        expect(
            positionParagraphs.length,
            'the summary section must state --summary is accepted before or after --batch <file.json>'
        ).toBeGreaterThanOrEqual(1)

        const usageParagraphs = paragraphs(body).filter(
            (paragraph) => /--summary`?\s+without\s+`?--batch/.test(paragraph) && /\busage error\b/i.test(paragraph)
        )
        expect(
            usageParagraphs.length,
            'the summary section must state --summary without --batch is a usage error'
        ).toBeGreaterThanOrEqual(1)
    })

    it('holds exactly two json fences: a batch input then its summary output', () => {
        const blocks = summaryJsonBlocks(readCommandsDocument())
        const input = asRecord(parseJson(blocks[0] ?? ''), 'the documented summary input')
        expect(asArray(input['entries'], 'the documented summary input "entries"').length).toBeGreaterThanOrEqual(2)

        const output = asRecord(parseJson(blocks[1] ?? ''), 'the documented summary output')
        expect(output['entries']).toBe(asArray(input['entries'], 'entries').length)
    })

    it('fails loudly when the summary section holds a single json fence', () => {
        const truncated = [
            '# Reference: commands',
            '',
            `## ${SUMMARY_HEADING}`,
            '',
            '```json',
            '{"entries": []}',
            '```',
            '',
        ].join('\n')
        expect(jsonFences(summarySection(truncated).body)).toHaveLength(1)
        expect(() => summaryJsonBlocks(truncated)).toThrow(/exactly two fenced json blocks/i)
    })

    it(
        'runs the documented input with --batch F --summary: exit 1, empty stderr, the compacted documented output',
        () => {
            const blocks = summaryJsonBlocks(readCommandsDocument())
            const fixture = saveFixture('campaign batch.json', blocks[0] ?? '')
            const result = runCli(['--batch', fixture, '--summary'])
            expect(result.stderr).toBe('')
            expect(result.code).toBe(1)
            expect(result.stdout).toBe(`${JSON.stringify(parseJson(blocks[1] ?? ''))}\n`)
        },
        slowTimeout
    )

    it(
        'prints the same bytes for --summary --batch F as for --batch F --summary',
        () => {
            const blocks = summaryJsonBlocks(readCommandsDocument())
            const fixture = saveFixture('campaign batch.json', blocks[0] ?? '')
            const after = runCli(['--batch', fixture, '--summary'])
            const before = runCli(['--summary', '--batch', fixture])
            expect(before.code).toBe(1)
            expect(before.stderr).toBe('')
            expect(before.stdout).toBe(after.stdout)
            expect(before.stdout).toBe(`${JSON.stringify(parseJson(blocks[1] ?? ''))}\n`)
        },
        slowTimeout
    )

    it('documents an output keyed entries, valid, invalid, issuesByField with a leading count of 2 above every later count', () => {
        const blocks = summaryJsonBlocks(readCommandsDocument())
        const output = asRecord(parseJson(blocks[1] ?? ''), 'the documented summary output')
        expect(Object.keys(output)).toEqual(['entries', 'valid', 'invalid', 'issuesByField'])

        expect(typeof output['invalid']).toBe('number')
        expect(output['invalid'] as number).toBeGreaterThanOrEqual(2)

        const counts = asArray(output['issuesByField'], 'the documented "issuesByField"').map(
            (item, index) => asRecord(item, `issuesByField[${String(index)}]`)['count']
        )
        expect(counts[0]).toBe(2)
        for (const later of counts.slice(1)) {
            expect(typeof later).toBe('number')
            expect(later as number).toBeLessThan(2)
        }
    })

    it(
        'has one exit-code row per 0, 1 and 2 with usage and empty stdout on the 2 row, and --summary alone exits 2',
        () => {
            const section = summarySection(readCommandsDocument())
            expect(exitCodeRows(section, '0'), 'the summary section must document exit code 0 once').toHaveLength(1)
            expect(exitCodeRows(section, '1'), 'the summary section must document exit code 1 once').toHaveLength(1)
            const exit2 = exitCodeRows(section, '2')
            expect(exit2, 'the summary section must document exit code 2 once').toHaveLength(1)
            expect(exit2[0] ?? '').toMatch(/\busage\b/i)
            expect(exit2[0] ?? '').toMatch(/\bempty stdout\b/i)

            const alone = runCli(['--summary'])
            expect(alone.code).toBe(2)
            expect(alone.stdout).toBe('')
            expect(alone.stderr.trim().length).toBeGreaterThan(0)
        },
        slowTimeout
    )

    it('links the batch section to #summarise-copy-issues-by-field, the slug of the new heading, keeping four json fences', () => {
        const markdown = readCommandsDocument()
        expect(githubSlug(summarySection(markdown).heading)).toBe(SUMMARY_ANCHOR)

        const batch = batchSection(markdown)
        const linking = paragraphs(batch.body).filter((paragraph) => paragraph.includes(`(#${SUMMARY_ANCHOR})`))
        expect(linking.length, 'the batch section must link to the summary section').toBeGreaterThanOrEqual(1)
        expect(linking.some((paragraph) => paragraph.includes('--summary'))).toBe(true)
        expect(jsonFences(batch.body)).toHaveLength(4)
    })

    it(
        'passes prettier --check for docs/reference/commands.md',
        () => {
            const result = runNode([prettierBin, '--check', commandsDocumentPath])
            expect(result.stderr).toBe('')
            expect(result.code).toBe(0)
        },
        slowTimeout
    )
})

describe('githubSlug', () => {
    it('lowercases, drops punctuation and hyphenates spaces', () => {
        expect(githubSlug('Summarise copy issues by field')).toBe('summarise-copy-issues-by-field')
        expect(githubSlug('Validate a batch of saved copy')).toBe('validate-a-batch-of-saved-copy')
        expect(githubSlug('Run `pnpm` (quick) tests!')).toBe('run-pnpm-quick-tests')
    })
})
