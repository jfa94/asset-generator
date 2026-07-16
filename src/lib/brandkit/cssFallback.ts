import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import type {BrandFont, BrandKit, Token, TokenKind} from '@/lib/brandkit/types'

const GLOBALS_CANDIDATES = [
    join('app', 'globals.css'),
    join('src', 'app', 'globals.css'),
    join('styles', 'globals.css'),
    join('src', 'styles', 'globals.css'),
]

const LOGO_CANDIDATES = [
    join('public', 'logo.svg'),
    join('public', 'logo.png'),
    join('public', 'icon.svg'),
    join('public', 'icon.png'),
    join('app', 'icon.png'),
    join('public', 'favicon.png'),
]

const kindFor = (name: string): TokenKind => {
    if (name.startsWith('--color-')) {
        return 'color'
    }
    if (name.startsWith('--font-')) {
        return 'font'
    }
    if (name.startsWith('--spacing-') || name.startsWith('--space-')) {
        return 'spacing'
    }
    if (name.startsWith('--radius-')) {
        return 'radius'
    }
    if (name.startsWith('--shadow-')) {
        return 'shadow'
    }
    return 'other'
}

/** Pull every `--name: value` declaration out of @theme blocks (Tailwind v4). */
const themeDeclarations = (css: string): [string, string][] => {
    const declarations: [string, string][] = []
    for (const block of css.matchAll(/@theme[^{]*\{/g)) {
        // walk to the matching closing brace
        const start = block.index + block[0].length
        let depth = 1
        let i = start
        while (i < css.length && depth > 0) {
            if (css[i] === '{') {
                depth++
            }
            if (css[i] === '}') {
                depth--
            }
            i++
        }
        const body = css.slice(start, i - 1)
        // split on ';' so the final declaration is kept even without a trailing semicolon
        for (const chunk of body.split(';')) {
            const match = /(--[\w-]+)\s*:\s*(\S[\s\S]*)/.exec(chunk)
            if (match?.[1] !== undefined && match[2] !== undefined) {
                declarations.push([match[1], match[2].trim()])
            }
        }
    }
    return declarations
}

const fontsFrom = (tokens: Token[]): BrandFont[] => {
    const byFamily = new Map<string, string[]>()
    for (const t of tokens.filter((t) => t.kind === 'font')) {
        // value is either a family list ("Besley, serif") or a var ref (var(--font-besley))
        const varRef = /var\(--font-([\w-]+)\)/.exec(t.value)
        const raw = varRef?.[1] ?? t.value.split(',')[0] ?? ''
        const family = raw.replace(/['"]/g, '').replace(/-/g, ' ').trim()
        if (family === '') {
            continue
        }
        byFamily.set(family, [...(byFamily.get(family) ?? []), t.name])
    }
    return [...byFamily].map(([family, tokenNames]) => ({family, tokens: tokenNames}))
}

/** Extract a BrandKit from a repo's global stylesheet; null when none found. */
export const extractFromCss = (repoPath: string): BrandKit | null => {
    const relative = GLOBALS_CANDIDATES.find((p) => existsSync(join(repoPath, p)))
    if (relative === undefined) {
        return null
    }
    const cssPath = join(repoPath, relative)

    const tokens: Token[] = themeDeclarations(readFileSync(cssPath, 'utf8')).map(([name, value]) => ({
        name,
        value,
        kind: kindFor(name),
    }))

    return {
        source: 'css-fallback',
        repoPath,
        tokens,
        fonts: fontsFrom(tokens),
        logos: LOGO_CANDIDATES.filter((p) => existsSync(join(repoPath, p))).map((p) => join(repoPath, p)),
        voice: null,
        cssPaths: [cssPath],
    }
}
