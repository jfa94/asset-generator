import Link from 'next/link'
import {notFound} from 'next/navigation'
import {approveBriefAction} from '@/app/runs/[id]/actions'
import ApprovalForm from '@/app/runs/[id]/components/ApprovalForm'
import AutoRefresh from '@/app/runs/[id]/components/AutoRefresh'
import ReviewGallery from '@/app/runs/[id]/components/ReviewGallery'
import {readRun, RUNS_DIR} from '@/lib/state/store'
import type {RunStatus} from '@/types/run'

export const dynamic = 'force-dynamic'

const WAITING: Partial<Record<RunStatus, string>> = {
    briefing: 'Agent is inspecting the repo and drafting the brief…',
    generating: 'Agent is writing copy and rendering images…',
    regenerating: 'Agent is regenerating the assets you flagged…',
    finalizing: 'Agent is writing campaign folders to Downloads…',
}

interface RunPageProps {
    params: Promise<{id: string}>
}

const RunPage = async ({params}: RunPageProps) => {
    const {id} = await params
    const run = await readRun(RUNS_DIR, id)
    if (run === null) {
        notFound()
    }
    const waiting = WAITING[run.status]

    return (
        <div className='space-y-8'>
            <header className='flex items-center justify-between'>
                <div>
                    <Link href='/' className='text-sm text-neutral-400 hover:text-neutral-200'>
                        ← Runs
                    </Link>
                    <h1 className='font-mono text-xl'>{run.id}</h1>
                    <p className='text-sm text-neutral-400'>{run.repoPath}</p>
                </div>
                <span className='rounded bg-neutral-800 px-3 py-1 text-sm'>{run.status}</span>
            </header>

            {waiting !== undefined && (
                <div className='flex items-center gap-3 rounded-lg bg-neutral-900 p-6 text-neutral-300'>
                    <span className='inline-block h-3 w-3 animate-pulse rounded-full bg-emerald-500' />
                    {waiting}
                    <AutoRefresh />
                </div>
            )}

            {run.status === 'awaiting-approval' && (
                <ApprovalForm run={run} action={approveBriefAction.bind(null, run.id)} />
            )}

            {run.status === 'reviewing' && <ReviewGallery run={run} />}

            {run.status === 'complete' && (
                <div className='rounded-lg bg-neutral-900 p-6'>
                    <p className='text-sm text-neutral-300'>Done. Campaign folders written to:</p>
                    <p className='mt-2 font-mono text-emerald-400'>{run.outputDir ?? '(unknown)'}</p>
                </div>
            )}
        </div>
    )
}

export default RunPage
