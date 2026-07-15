import Link from 'next/link'
import {createRunAction} from '@/app/actions'
import {listRuns, RUNS_DIR} from '@/lib/state/store'

export const dynamic = 'force-dynamic'

const HomePage = async () => {
    const runs = await listRuns(RUNS_DIR)
    return (
        <div className='space-y-10'>
            <h1 className='text-2xl font-semibold'>Asset Generator</h1>

            <form action={createRunAction} className='flex flex-wrap items-end gap-4 rounded-lg bg-neutral-900 p-5'>
                <label className='flex flex-col gap-1 text-sm'>
                    Target repo path
                    <input
                        name='repoPath'
                        required
                        placeholder='/Users/you/Projects/product'
                        className='w-96 rounded bg-neutral-800 px-3 py-2'
                    />
                </label>
                <label className='flex flex-col gap-1 text-sm'>
                    Campaigns
                    <input
                        name='campaignCount'
                        type='number'
                        min={1}
                        max={10}
                        defaultValue={3}
                        required
                        className='w-24 rounded bg-neutral-800 px-3 py-2'
                    />
                </label>
                <button type='submit' className='rounded bg-emerald-600 px-4 py-2 text-sm font-medium'>
                    New run
                </button>
            </form>

            <section className='space-y-2'>
                <h2 className='text-lg font-medium'>Runs</h2>
                {runs.length === 0 ? (
                    <p className='text-sm text-neutral-400'>
                        No runs yet. Start one above, then drive it from your Claude Code session with /new-run.
                    </p>
                ) : (
                    <ul className='divide-y divide-neutral-800 rounded-lg bg-neutral-900'>
                        {runs.map((run) => (
                            <li key={run.id}>
                                <Link
                                    href={`/runs/${run.id}`}
                                    className='flex items-center justify-between px-5 py-3 hover:bg-neutral-800'
                                >
                                    <span className='font-mono text-sm'>{run.id}</span>
                                    <span className='text-sm text-neutral-400'>{run.repoPath}</span>
                                    <span className='rounded bg-neutral-800 px-2 py-1 text-xs'>{run.status}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    )
}

export default HomePage
