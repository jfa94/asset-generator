import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {basename, join, sep} from 'node:path'
import {afterAll, describe, expect, it} from 'vitest'
import {listRuns, readAsset, readRun, RUNS_DIR, writeRun} from '@/lib/state/store'
import type {RunState} from '@/types/run'

const dir = mkdtempSync(join(tmpdir(), 'store-'))
afterAll(() => {
    rmSync(dir, {recursive: true, force: true})
})

const run = (id: string, createdAt: string): RunState => ({
    id,
    createdAt,
    repoPath: '/tmp/repo',
    campaignCount: 3,
    status: 'briefing',
})

describe('run store', () => {
    it('round-trips a run', async () => {
        await writeRun(dir, run('run-a', '2026-07-15T10:00:00Z'))
        expect((await readRun(dir, 'run-a'))?.repoPath).toBe('/tmp/repo')
    })

    it('returns null for missing or malicious ids', async () => {
        expect(await readRun(dir, 'nope')).toBeNull()
        expect(await readRun(dir, '../etc')).toBeNull()
    })

    it('lists runs newest first, skipping junk dirs', async () => {
        await writeRun(dir, run('run-b', '2026-07-16T10:00:00Z'))
        mkdirSync(join(dir, 'junk'))
        expect((await listRuns(dir)).map((r) => r.id)).toEqual(['run-b', 'run-a'])
    })

    it('lists nothing when the dir does not exist', async () => {
        expect(await listRuns(join(dir, 'missing'))).toEqual([])
    })

    it('resolves runs relative to the cwd', () => {
        expect(RUNS_DIR.endsWith(`${sep}runs`)).toBe(true)
    })

    it('writes exact formatted json and survives rewrites', async () => {
        const r = run('run-c', '2026-07-14T09:00:00Z')
        await writeRun(dir, r)
        await writeRun(dir, r)
        expect(readFileSync(join(dir, 'run-c', 'run.json'), 'utf8')).toBe(JSON.stringify(r, null, 2) + '\n')
    })

    it('rejects traversal ids even when they resolve to real files', async () => {
        const sibling = mkdtempSync(join(tmpdir(), 'store-esc-'))
        writeFileSync(join(sibling, 'run.json'), JSON.stringify(run('esc', '2026-07-15T00:00:00Z')))
        mkdirSync(join(sibling, 'assets'))
        writeFileSync(join(sibling, 'assets', 'a.png'), 'x')
        try {
            const escId = `..${sep}${basename(sibling)}`
            expect(await readRun(dir, escId)).toBeNull()
            expect(await readRun(dir, `junk${sep}..${sep}run-a`)).toBeNull()
            expect(await readAsset(dir, escId, 'assets/a.png')).toBeNull()
        } finally {
            rmSync(sibling, {recursive: true, force: true})
        }
    })

    it('reads run-relative assets, refusing escapes', async () => {
        const assets = join(dir, 'run-a', 'assets')
        mkdirSync(assets, {recursive: true})
        writeFileSync(join(assets, 'v1.png'), 'png-bytes')
        expect((await readAsset(dir, 'run-a', 'assets/v1.png'))?.toString()).toBe('png-bytes')
        expect(await readAsset(dir, 'run-a', '../run-b/run.json')).toBeNull()
        expect(await readAsset(dir, 'run-a', '/etc/passwd')).toBeNull()
        expect(await readAsset(dir, 'run-a', 'assets/missing.png')).toBeNull()
        expect(await readAsset(dir, '../x', 'assets/v1.png')).toBeNull()
    })
})
