import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {renderToStaticMarkup} from 'react-dom/server'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import CreativeCard from '@/components/creative/CreativeCard'
import type {LockupId} from '@/types/creative'
import type {Creative, RunBrand} from '@/types/run'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const brand: RunBrand = {
    cssFile: 'brand/brand.css',
    fonts: {display: 'Besley', body: 'Familjen Grotesk'},
    logoFile: null,
}

const creative = (lockup: LockupId = 'poster'): Creative => ({
    variant: 2,
    spec: {
        lockup,
        palette: {background: '#fffbf5', text: '#064e3b', accent: '#b5541f'},
        copy: {headline: 'Original headline'},
    },
    review: {status: 'pending', note: ''},
})

const noop = (): void => undefined

const markup = (c: Creative): string =>
    renderToStaticMarkup(<CreativeCard runId='run-1' brand={brand} creative={c} onEdit={noop} onReview={noop} />)

describe('CreativeCard (static)', () => {
    it('shows the representative preview plus a strip of the 5 other formats', () => {
        const out = markup(creative())
        // representative editable preview at 320px, strip previews at 90px
        expect(out.match(/width:320px/g)).toHaveLength(1)
        expect(out.match(/width:90px/g)).toHaveLength(5)
        expect(out).toContain('1200×628')
        expect(out).toContain('1200×1200')
        expect(out).toContain('1080×1080')
        expect(out).toContain('1080×1350')
        expect(out).toContain('1080×1920')
        expect(out).not.toContain('960×1200')
    })

    it('labels the card with lockup and variant', () => {
        expect(markup(creative())).toContain('poster · v2')
    })

    it('renders an error card for an unknown lockup instead of crashing', () => {
        const out = markup(creative('holographic' as LockupId))
        expect(out).toContain('Unknown lockup')
        expect(out).toContain('holographic')
        expect(out).not.toContain('width:320px')
    })
})

describe('CreativeCard (interactive)', () => {
    let container: HTMLDivElement
    let root: Root
    const onEdit = vi.fn()
    const onReview = vi.fn()

    beforeEach(() => {
        onEdit.mockClear()
        onReview.mockClear()
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
        act(() => {
            root.render(
                <CreativeCard runId='run-1' brand={brand} creative={creative()} onEdit={onEdit} onReview={onReview} />
            )
        })
    })

    afterEach(() => {
        act(() => {
            root.unmount()
        })
        container.remove()
    })

    it('click → edit → blur commits the edited slot text', () => {
        const editable = container.querySelector('[contenteditable]')
        expect(editable).not.toBeNull()
        if (editable === null) {
            return
        }
        editable.textContent = 'Sharper headline'
        act(() => {
            editable.dispatchEvent(new FocusEvent('focusout', {bubbles: true}))
        })
        expect(onEdit).toHaveBeenCalledWith('headline', 'Sharper headline')
    })

    it('only the representative preview is editable — strip previews are not', () => {
        // poster with headline only: exactly one editable slot across all 6 previews
        expect(container.querySelectorAll('[contenteditable]')).toHaveLength(1)
    })

    it('review controls report decisions upward', () => {
        const approve = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Approve'))
        act(() => {
            approve?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
        })
        expect(onReview).toHaveBeenCalledWith({status: 'approved', note: ''})
    })
})
