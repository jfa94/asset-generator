import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import ReviewControls from '@/components/creative/ReviewControls'
import type {Review} from '@/types/run'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('ReviewControls', () => {
    let container: HTMLDivElement
    let root: Root
    const onChange = vi.fn()

    const render = (review: Review): void => {
        act(() => {
            root.render(<ReviewControls review={review} onChange={onChange} />)
        })
    }

    const click = (label: string): void => {
        const button = [...container.querySelectorAll('button')].find((b) => b.textContent.includes(label))
        expect(button).toBeDefined()
        act(() => {
            button?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
        })
    }

    beforeEach(() => {
        onChange.mockClear()
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => {
            root.unmount()
        })
        container.remove()
    })

    it('approve click reports an approved review', () => {
        render({status: 'pending', note: ''})
        click('Approve')
        expect(onChange).toHaveBeenCalledWith({status: 'approved', note: ''})
    })

    it('redo click reports a redo review and highlights the choice', () => {
        render({status: 'pending', note: ''})
        click('Redo')
        expect(onChange).toHaveBeenCalledWith({status: 'redo', note: ''})
        render({status: 'redo', note: ''})
        const redoButton = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Redo'))
        expect(redoButton?.className).toContain('bg-amber-600')
    })

    it('shows the note input only for redo and reports typed notes', () => {
        render({status: 'approved', note: ''})
        expect(container.querySelector('input')).toBeNull()

        render({status: 'redo', note: ''})
        const input = container.querySelector('input')
        expect(input).not.toBeNull()
        if (input === null) {
            return
        }
        act(() => {
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
                input,
                'logo overlaps headline'
            )
            input.dispatchEvent(new Event('input', {bubbles: true}))
        })
        expect(onChange).toHaveBeenCalledWith({status: 'redo', note: 'logo overlaps headline'})
    })
})
