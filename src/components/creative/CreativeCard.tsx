'use client'

import {AD_FORMATS, REPRESENTATIVE} from '@/domain/formats'
import {LOCKUP_META} from '@/lib/lockups/lockups'
import LockupPreview from '@/components/creative/LockupPreview'
import ReviewControls from '@/components/creative/ReviewControls'
import type {SlotName} from '@/types/creative'
import type {Creative, Review, RunBrand} from '@/types/run'

interface CreativeCardProps {
    runId: string
    brand: RunBrand
    creative: Creative
    onEdit: (slot: SlotName, value: string) => void
    onReview: (review: Review) => void
}

/** One variant: an editable representative preview + a live strip of the other formats. */
const CreativeCard = ({runId, brand, creative, onEdit, onReview}: CreativeCardProps) => {
    const {spec, review, variant} = creative
    if (!(spec.lockup in LOCKUP_META)) {
        return (
            <div className='rounded border border-red-900 bg-red-950 p-4 text-xs text-red-300'>
                Unknown lockup &lsquo;{spec.lockup}&rsquo; in run.json (v{variant}) — the agent must fix this spec.
            </div>
        )
    }
    return (
        <figure className='space-y-3'>
            <div className='overflow-hidden rounded border border-neutral-800'>
                <LockupPreview
                    runId={runId}
                    brand={brand}
                    spec={spec}
                    width={REPRESENTATIVE.width}
                    height={REPRESENTATIVE.height}
                    safeZone={REPRESENTATIVE.safeZone}
                    displayWidth={320}
                    onEdit={onEdit}
                />
            </div>
            <div className='flex flex-wrap gap-2'>
                {AD_FORMATS.filter((fmt) => fmt !== REPRESENTATIVE).map((fmt) => (
                    <div key={`${fmt.platform}-${fmt.name}`} className='space-y-1'>
                        <div className='overflow-hidden rounded border border-neutral-800'>
                            <LockupPreview
                                runId={runId}
                                brand={brand}
                                spec={spec}
                                width={fmt.width}
                                height={fmt.height}
                                safeZone={fmt.safeZone}
                                displayWidth={90}
                            />
                        </div>
                        <p className='text-[10px] text-neutral-500'>
                            {fmt.width}×{fmt.height}
                        </p>
                    </div>
                ))}
            </div>
            <figcaption className='text-xs text-neutral-400'>
                {spec.lockup} · v{variant} — click any text in the large preview to edit
            </figcaption>
            <ReviewControls review={review} onChange={onReview} />
        </figure>
    )
}

export default CreativeCard
