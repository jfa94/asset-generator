export type TokenKind = 'color' | 'font' | 'spacing' | 'radius' | 'shadow' | 'other'

export interface Token {
    name: string
    value: string
    kind: TokenKind
}

export interface BrandFont {
    family: string
    /** token names referencing this family, e.g. --font-display */
    tokens: string[]
}

export interface BrandKit {
    source: 'design-system' | 'css-fallback'
    /** absolute path of the repo the kit was extracted from */
    repoPath: string
    tokens: Token[]
    fonts: BrandFont[]
    /** absolute paths to logo image files, best candidates first */
    logos: string[]
    /** brand voice guidance as plain text; null when the repo has none (agent infers) */
    voice: string | null
    /** absolute CSS file paths, in load order, for the render layer */
    cssPaths: string[]
}
