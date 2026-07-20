import {describe, expect, it} from 'vitest'
import {extractFontCss} from '@/lib/brandkit/fontCss'

const brandCss = `
@import url('https://fonts.googleapis.com/css2?family=Besley&display=swap');
:root {
    --color-bg: #fffbf5;
    --font-display: 'Besley', serif;
}
@font-face {
    font-family: 'Familjen Grotesk';
    src: url('/fonts/familjen.woff2') format('woff2');
}
body { background: red; margin: 0 }
button { display: none }
`

describe('extractFontCss', () => {
    it('keeps @import statements and @font-face blocks only', () => {
        const out = extractFontCss(brandCss)
        expect(out).toContain("@import url('https://fonts.googleapis.com/css2?family=Besley&display=swap');")
        expect(out).toContain("font-family: 'Familjen Grotesk';")
        expect(out).not.toContain('background: red')
        expect(out).not.toContain('display: none')
        expect(out).not.toContain('--color-bg')
    })

    it('returns empty string when there is nothing font-related', () => {
        expect(extractFontCss('body { margin: 0 }')).toBe('')
        expect(extractFontCss('')).toBe('')
    })

    it('keeps multiple imports and faces', () => {
        const css = `@import url(a.css);@import url(b.css);@font-face{font-family:X;src:url(x.woff2)}@font-face{font-family:Y;src:url(y.woff2)}`
        const out = extractFontCss(css)
        expect(out.match(/@import/g)).toHaveLength(2)
        expect(out.match(/@font-face/g)).toHaveLength(2)
    })
})
