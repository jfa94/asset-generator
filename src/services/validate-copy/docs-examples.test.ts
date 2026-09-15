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
const commandsDocumentPath = join(projectRoot, 'docs/reference/commands.md')

const batchBlockContract =
    'the batch section of docs/reference/commands.md must hold exactly four fenced json blocks in document order: all-valid input, all-valid output, rule-violating input, rule-violating output'
const singleBlockContract =
    'the single-file section of docs/reference/commands.md must hold exactly five fenced json blocks in document order: rsa input, pmax input, meta input, meta output, meta-with-empty-primaryTexts output'

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

function batchSection(markdown: string): DocSection {
    const matched = h2Sections(markdown).filter((section) => /batch/i.test(section.heading))
    expect(
        matched.map((section) => section.heading),
        'docs/reference/commands.md must hold exactly one "## " section documenting the batch command'
    ).toHaveLength(1)
    return matched[0] ?? {heading: '', body: ''}
}

function singleFileSection(markdown: string): DocSection {
    const matched = h2Sections(markdown).filter(
        (section) => /validate/i.test(section.heading) && !/batch/i.test(section.heading)
    )
    expect(
        matched.map((section) => section.heading),
        'docs/reference/commands.md must keep exactly one "## " section for the single-file command'
    ).toHaveLength(1)
    return matched[0] ?? {heading: '', body: ''}
}

function batchJsonBlocks(markdown: string): string[] {
    const blocks = jsonFences(batchSection(markdown).body)
    expect(blocks, batchBlockContract).toHaveLength(4)
    return blocks
}

function singleFileJsonBlocks(markdown: string): string[] {
    const blocks = jsonFences(singleFileSection(markdown).body)
    expect(blocks, singleBlockContract).toHaveLength(5)
    return blocks
}

function exitCodeRow(section: DocSection, code: string): string {
    const rows = section.body.split('\n').filter((line) => line.startsWith('|'))
    const matched = rows.filter((row) => new RegExp(`^\\s*\`?${code}\`?\\s*$`).test(row.split('|')[1] ?? ''))
    expect(matched, `the batch section must document exit code ${code} in an exit-code table row`).toHaveLength(1)
    return matched[0] ?? ''
}

interface ExitCodeRowCells {
    meaning: string
    streams: string
}

// Splits "| code | Meaning | Streams |" into its own cells so a table row's cells are
// asserted independently, not against the row's concatenated text.
function exitCodeRowCells(section: DocSection, code: string): ExitCodeRowCells {
    const cells = exitCodeRow(section, code).split('|')
    return {meaning: (cells[2] ?? '').trim(), streams: (cells[3] ?? '').trim()}
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

function entriesOf(block: string): Record<string, unknown>[] {
    const root = asRecord(parseJson(block), 'a documented batch input')
    return asArray(root['entries'], 'a documented batch input "entries"').map((entry, index) =>
        asRecord(entry, `entries[${String(index)}]`)
    )
}

let fixtureDirectory: string

beforeEach(() => {
    fixtureDirectory = mkdtempSync(join(tmpdir(), 'docs-examples-test-'))
})

afterEach(() => {
    rmSync(fixtureDirectory, {recursive: true})
})

function saveFixture(name: string, contents: string): string {
    const path = join(fixtureDirectory, name)
    writeFileSync(path, contents, 'utf8')
    return path
}

function runCli(args: string[]): CommandResult {
    // Fixed Node executable, argument vector, no shell; paths are isolated test fixtures.

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

function runDocumentedBatch(documentedInput: string): CommandResult {
    return runCli(['--batch', saveFixture('campaign batch.json', documentedInput)])
}

describe('documented --batch examples in docs/reference/commands.md', () => {
    it('documents the --batch invocation with a mixed-platform input holding at least two entries', () => {
        const markdown = readCommandsDocument()
        expect(batchSection(markdown).body).toMatch(/validate-copy\s+--batch/)
        const blocks = batchJsonBlocks(markdown)
        const entries = entriesOf(blocks[0] ?? '')
        expect(entries.length).toBeGreaterThanOrEqual(2)
        expect(new Set(entries.map((entry) => entry['platform'])).size).toBeGreaterThanOrEqual(2)
    })

    it('runs the documented all-valid batch input through the CLI: exit 0 and the documented output', () => {
        const blocks = batchJsonBlocks(readCommandsDocument())
        const documented = asRecord(parseJson(blocks[1] ?? ''), 'the documented all-valid batch output')
        expect(documented['valid']).toBe(true)
        const result = runDocumentedBatch(blocks[0] ?? '')
        expect(result.stderr).toBe('')
        expect(result.code).toBe(0)
        expect(parseJson(result.stdout)).toEqual(documented)
    }, 30000)

    it('runs the documented rule-violating batch input through the CLI: exit 1 and the documented output', () => {
        const blocks = batchJsonBlocks(readCommandsDocument())
        const documented = asRecord(parseJson(blocks[3] ?? ''), 'the documented rule-violating batch output')
        expect(documented['valid']).toBe(false)
        const result = runDocumentedBatch(blocks[2] ?? '')
        expect(result.stderr).toBe('')
        expect(result.code).toBe(1)
        expect(parseJson(result.stdout)).toEqual(documented)
    }, 30000)

    it('documents the rule-violating output as every entry in input order with at least one issue', () => {
        const blocks = batchJsonBlocks(readCommandsDocument())
        const documented = asRecord(parseJson(blocks[3] ?? ''), 'the documented rule-violating batch output')
        const results = asArray(documented['results'], 'the documented "results"').map((entry, index) =>
            asRecord(entry, `results[${String(index)}]`)
        )
        expect(results.map((entry) => entry['id'])).toEqual(entriesOf(blocks[2] ?? '').map((entry) => entry['id']))
        const issueCounts = results.map(
            (entry, index) => asArray(entry['issues'], `results[${String(index)}].issues`).length
        )
        expect(issueCounts.filter((count) => count > 0).length).toBeGreaterThanOrEqual(1)
    })

    it('prints the batch payload as one compact JSON line closed by a single trailing newline', () => {
        const blocks = batchJsonBlocks(readCommandsDocument())
        const {stdout} = runDocumentedBatch(blocks[0] ?? '')
        expect(stdout).toBe(`${JSON.stringify(parseJson(stdout))}\n`)
        expect(stdout.indexOf('\n')).toBe(stdout.length - 1)
    }, 30000)

    it('documents exit 0, 1 and 2 for the batch command, and exit 2 really leaves stdout empty', () => {
        const section = batchSection(readCommandsDocument())

        const exit0 = exitCodeRowCells(section, '0')
        expect(exit0.meaning).toMatch(/\bevery entry is valid\b/i)
        expect(exit0.meaning).not.toMatch(/invalid/i)
        expect(exit0.streams).toMatch(/\bjson\b.*\bstdout\b/i)
        expect(exit0.streams).toMatch(/\bempty stderr\b/i)
        expect(exit0.streams).not.toMatch(/\bempty stdout\b/i)
        expect(exit0.streams).not.toMatch(/\bdiagnostic\b/i)

        const exit1 = exitCodeRowCells(section, '1')
        expect(exit1.meaning).toMatch(/\bviolates platform rules\b/i)
        expect(exit1.streams).toMatch(/\bjson\b.*\bstdout\b/i)
        expect(exit1.streams).toMatch(/\bempty stderr\b/i)
        expect(exit1.streams).not.toMatch(/\bempty stdout\b/i)
        expect(exit1.streams).not.toMatch(/\bdiagnostic\b/i)

        const exit2 = exitCodeRowCells(section, '2')
        expect(exit2.meaning).toMatch(/\busage\b/i)
        expect(exit2.meaning).toMatch(/\b(unreadable|read failure)\b/i)
        expect(exit2.meaning).toMatch(/\bmalformed json\b/i)
        expect(exit2.meaning).toMatch(/\bshape\b/i)
        expect(exit2.meaning).not.toMatch(/\bevery entry is valid\b/i)
        expect(exit2.meaning).not.toMatch(/\bexit 0\b/i)
        expect(exit2.streams).toMatch(/\bempty stdout\b/i)
        expect(exit2.streams).toMatch(/\bdiagnostic\b.*\bstderr\b/i)
        expect(exit2.streams).not.toMatch(/\bjson\b.*\bstdout\b/i)

        const missingFile = runCli(['--batch', join(fixtureDirectory, 'missing batch.json')])
        expect(missingFile.code).toBe(2)
        expect(missingFile.stdout).toBe('')
        expect(missingFile.stderr.trim().length).toBeGreaterThan(0)

        const badUsage = runCli(['--batch'])
        expect(badUsage.code).toBe(2)
        expect(badUsage.stdout).toBe('')
        expect(badUsage.stderr.trim().length).toBeGreaterThan(0)
    }, 30000)

    it('fails loudly when the batch section holds fewer than four json blocks', () => {
        const truncated = [
            '# Reference: commands',
            '',
            '## Validate a batch of saved copy',
            '',
            '```json',
            '{"entries": []}',
            '```',
            '',
            '```json',
            '{"valid": true, "results": []}',
            '```',
            '',
            '```json',
            '{"entries": []}',
            '```',
            '',
        ].join('\n')
        expect(jsonFences(batchSection(truncated).body)).toHaveLength(3)
        expect(() => batchJsonBlocks(truncated)).toThrow(/exactly four fenced json blocks/i)
    })
})

describe('documented single-file examples in docs/reference/commands.md', () => {
    it('still exits 0 for each documented rsa, pmax and meta input', () => {
        const inputs = singleFileJsonBlocks(readCommandsDocument()).slice(0, 3)
        expect(inputs.map((block) => asRecord(parseJson(block), 'a documented single-file input')['platform'])).toEqual(
            ['rsa', 'pmax', 'meta']
        )
        expect(inputs.map((block) => runCli([saveFixture('campaign copy.json', block)]).code)).toEqual([0, 0, 0])
    }, 40000)

    it('matches the documented outputs for the meta input and its empty primaryTexts variant', () => {
        const blocks = singleFileJsonBlocks(readCommandsDocument())
        const metaInput = asRecord(parseJson(blocks[2] ?? ''), 'the documented meta input')
        const accepted = runCli([saveFixture('campaign copy.json', blocks[2] ?? '')])
        expect(accepted.code).toBe(0)
        expect(parseJson(accepted.stdout)).toEqual(parseJson(blocks[3] ?? ''))

        const emptied = {
            ...metaInput,
            copy: {...asRecord(metaInput['copy'], 'the documented meta copy'), primaryTexts: []},
        }
        const rejected = runCli([saveFixture('campaign copy.json', JSON.stringify(emptied))])
        expect(rejected.code).toBe(1)
        expect(parseJson(rejected.stdout)).toEqual(parseJson(blocks[4] ?? ''))
    }, 30000)
})
