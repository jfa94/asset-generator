'use client'

import type {Review} from '@/types/run'

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

export default ReviewControls
