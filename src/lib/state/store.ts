import {mkdir, readdir, readFile, rename, writeFile} from 'node:fs/promises'
import {join, resolve, sep} from 'node:path'
import type {RunState} from '@/types/run'

export const RUNS_DIR = join(process.cwd(), 'runs')

const validId = (id: string): boolean => /^[\w-]+$/.test(id)

/** Missing files are expected (404/empty semantics); anything else deserves telemetry. */
const warnUnlessMissing = (ctx: string, err: unknown): void => {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`${ctx}: ${String(err)}`)
    }
}

export const readRun = async (dir: string, id: string): Promise<RunState | null> => {
    if (!validId(id)) {
        return null
    }
    try {
        return JSON.parse(await readFile(join(dir, id, 'run.json'), 'utf8')) as RunState
    } catch (err) {
        warnUnlessMissing(`readRun ${id}`, err)
        return null
    }
}

/** Atomic write (tmp + rename) so the agent's fs.watch never sees a torn file. */
export const writeRun = async (dir: string, run: RunState): Promise<void> => {
    const runDir = join(dir, run.id)
    await mkdir(runDir, {recursive: true})
    const tmp = join(runDir, 'run.json.tmp')
    await writeFile(tmp, JSON.stringify(run, null, 2) + '\n')
    await rename(tmp, join(runDir, 'run.json'))
}

export const listRuns = async (dir: string): Promise<RunState[]> => {
    let entries
    try {
        entries = await readdir(dir, {withFileTypes: true})
    } catch (err) {
        warnUnlessMissing(`listRuns ${dir}`, err)
        return []
    }
    const runs = await Promise.all(entries.filter((e) => e.isDirectory()).map((e) => readRun(dir, e.name)))
    return runs.filter((r): r is RunState => r !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Read a run-relative asset file; null if the path escapes the run dir or is missing. */
export const readAsset = async (dir: string, id: string, relPath: string): Promise<Buffer | null> => {
    if (!validId(id)) {
        return null
    }
    const base = resolve(dir, id)
    const path = resolve(base, relPath)
    if (!path.startsWith(base + sep)) {
        return null
    }
    try {
        return await readFile(path)
    } catch (err) {
        warnUnlessMissing(`readAsset ${id}/${relPath}`, err)
        return null
    }
}
