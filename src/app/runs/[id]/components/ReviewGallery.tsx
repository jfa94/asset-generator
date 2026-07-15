'use client'

import {useRouter} from 'next/navigation'
import {useState, useTransition} from 'react'
import {submitReviewsAction} from '@/app/runs/[id]/actions'
import type {Campaign, CampaignCopy, Review, RunState} from '@/types/run'

interface ReviewGalleryProps {
    run: RunState
}

type CopyPlatform = keyof CampaignCopy

const COPY_LISTS: Record<CopyPlatform, [string, string][]> = {
    rsa: [
        ['headlines', 'Headlines (≤30 chars)'],
        ['descriptions', 'Descriptions (≤90)'],
        ['paths', 'Paths (≤15)'],
    ],
    pmax: [
        ['shortHeadlines', 'Short headlines (≤30)'],
        ['longHeadlines', 'Long headlines (≤90)'],
        ['descriptions', 'Descriptions (≤90)'],
    ],
    meta: [
        ['primaryTexts', 'Primary texts (≤125)'],
        ['headlines', 'Headlines (≤40)'],
        ['descriptions', 'Descriptions (≤25)'],
    ],
}

interface ReviewControlsProps {
    review: Review
    onChange: (review: Review) => void
}

const ReviewControls = ({review, onChange}: ReviewControlsProps) => (
    <div className='flex items-center gap-2'>
        <button
            type='button'
            onClick={() => {
                onChange({...review, status: 'approved'})
            }}
            className={`rounded px-2 py-1 text-xs ${review.status === 'approved' ? 'bg-emerald-600' : 'bg-neutral-800'}`}
        >
            ✓ Approve
        </button>
        <button
            type='button'
            onClick={() => {
                onChange({...review, status: 'redo'})
            }}
            className={`rounded px-2 py-1 text-xs ${review.status === 'redo' ? 'bg-amber-600' : 'bg-neutral-800'}`}
        >
            ↻ Redo
        </button>
        {review.status === 'redo' && (
            <input
                value={review.note}
                onChange={(e) => {
                    onChange({...review, note: e.target.value})
                }}
                placeholder='What should change?'
                className='w-64 rounded bg-neutral-800 px-2 py-1 text-xs'
            />
        )}
    </div>
)

/** Gallery + selective regeneration: decide every asset, edit copy inline, then submit. */
const ReviewGallery = ({run}: ReviewGalleryProps) => {
    const [campaigns, setCampaigns] = useState<Campaign[]>(run.campaigns ?? [])
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()
    const router = useRouter()

    const patch = (index: number, fn: (c: Campaign) => void): void => {
        setCampaigns((prev) => {
            const next = structuredClone(prev)
            const c = next[index]
            if (c !== undefined) {
                fn(c)
            }
            return next
        })
    }

    const themeName = (slug: string): string => run.themes?.find((t) => t.slug === slug)?.name ?? slug

    const submit = (): void => {
        startTransition(async () => {
            const [, err] = await submitReviewsAction(run.id, campaigns)
            setError(err)
            if (err === null) {
                router.refresh()
            }
        })
    }

    const anyRedo = campaigns.some((c) =>
        [c.copyReviews.rsa, c.copyReviews.pmax, c.copyReviews.meta, ...c.images.map((i) => i.review)].some(
            (r) => r.status === 'redo'
        )
    )

    return (
        <div className='space-y-10'>
            {campaigns.map((c, ci) => (
                <section key={c.slug} className='space-y-6 rounded-lg bg-neutral-900 p-5'>
                    <h2 className='text-lg font-medium'>
                        {themeName(c.slug)} <span className='font-mono text-xs text-neutral-500'>{c.slug}</span>
                    </h2>

                    <div className='grid grid-cols-2 gap-4 md:grid-cols-3'>
                        {c.images.map((img, ii) => (
                            <figure key={img.file} className='space-y-2'>
                                <img
                                    src={`/api/asset?run=${run.id}&f=${encodeURIComponent(img.file)}`}
                                    alt={`${c.slug} ${img.platform} ${img.format} v${String(img.variant)}`}
                                    className='w-full rounded border border-neutral-800'
                                />
                                <figcaption className='text-xs text-neutral-400'>
                                    {img.platform} · {img.format} · v{img.variant}
                                </figcaption>
                                <ReviewControls
                                    review={img.review}
                                    onChange={(review) => {
                                        patch(ci, (draft) => {
                                            const target = draft.images[ii]
                                            if (target !== undefined) {
                                                target.review = review
                                            }
                                        })
                                    }}
                                />
                            </figure>
                        ))}
                    </div>

                    {(Object.keys(COPY_LISTS) as CopyPlatform[]).map((platform) => (
                        <div key={platform} className='space-y-3 rounded bg-neutral-950 p-4'>
                            <div className='flex items-center justify-between'>
                                <h3 className='text-sm font-medium tracking-wide uppercase'>{platform}</h3>
                                <ReviewControls
                                    review={c.copyReviews[platform]}
                                    onChange={(review) => {
                                        patch(ci, (draft) => {
                                            draft.copyReviews[platform] = review
                                        })
                                    }}
                                />
                            </div>
                            {COPY_LISTS[platform].map(([key, label]) => {
                                const items = (c.copy[platform] as unknown as Record<string, string[]>)[key] ?? []
                                return (
                                    <label key={key} className='flex flex-col gap-1 text-xs text-neutral-400'>
                                        {label}
                                        <textarea
                                            value={items.join('\n')}
                                            rows={Math.max(2, items.length)}
                                            onChange={(e) => {
                                                const value = e.target.value.split('\n')
                                                patch(ci, (draft) => {
                                                    ;(draft.copy[platform] as unknown as Record<string, string[]>)[
                                                        key
                                                    ] = value
                                                })
                                            }}
                                            className='rounded bg-neutral-800 px-3 py-2 font-mono text-xs text-neutral-100'
                                        />
                                    </label>
                                )
                            })}
                            {platform === 'pmax' && (
                                <label className='flex flex-col gap-1 text-xs text-neutral-400'>
                                    Business name (≤25)
                                    <input
                                        value={c.copy.pmax.businessName}
                                        onChange={(e) => {
                                            const value = e.target.value
                                            patch(ci, (draft) => {
                                                draft.copy.pmax.businessName = value
                                            })
                                        }}
                                        className='rounded bg-neutral-800 px-3 py-2 font-mono text-xs text-neutral-100'
                                    />
                                </label>
                            )}
                        </div>
                    ))}
                </section>
            ))}

            {error !== null && (
                <pre className='rounded bg-red-950 p-4 text-xs whitespace-pre-wrap text-red-300'>{error}</pre>
            )}

            <button
                type='button'
                onClick={submit}
                disabled={pending}
                className='rounded bg-emerald-600 px-5 py-2 font-medium disabled:opacity-50'
            >
                {anyRedo ? 'Send redos to agent' : 'Approve all & finalize'}
            </button>
        </div>
    )
}

export default ReviewGallery
