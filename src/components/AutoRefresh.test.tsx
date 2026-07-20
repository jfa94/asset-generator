import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {refresh} = vi.hoisted(() => ({refresh: vi.fn()}))
vi.mock('next/navigation', () => ({useRouter: () => ({refresh})}))

import AutoRefresh from '@/components/AutoRefresh'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('AutoRefresh', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        vi.useFakeTimers()
        refresh.mockClear()
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => {
            root.unmount()
        })
        container.remove()
        vi.useRealTimers()
    })

    it('polls router.refresh on the given interval', () => {
        act(() => {
            root.render(<AutoRefresh ms={500} />)
        })
        expect(refresh).not.toHaveBeenCalled()
        act(() => {
            vi.advanceTimersByTime(1600)
        })
        expect(refresh).toHaveBeenCalledTimes(3)
    })

    it('defaults to a 2s interval and stops polling on unmount', () => {
        act(() => {
            root.render(<AutoRefresh />)
        })
        act(() => {
            vi.advanceTimersByTime(2100)
        })
        expect(refresh).toHaveBeenCalledTimes(1)
        act(() => {
            root.unmount()
        })
        act(() => {
            vi.advanceTimersByTime(10_000)
        })
        expect(refresh).toHaveBeenCalledTimes(1)
    })
})
