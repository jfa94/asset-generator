import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import type {BrandKit, Token, TokenKind} from '@/lib/brandkit/types'

const DS_DIR = join('docs', 'design-system')
const MANIFEST = '_ds_manifest.json'
const LOGO_EXTENSIONS = ['.png', '.svg', '.webp', '.jpg', '.jpeg']
const TOKEN_KINDS: readonly TokenKind[] = ['color', 'font', 'spacing', 'radius', 'shadow', 'other']

interface ManifestToken {
    name: string
    value: string
    kind: string
}

interface Manifest {
    tokens?: ManifestToken[]
    brandFonts?: {family: string; tokens?: string[]}[]
    globalCssPaths?: string[]
}

const toKind = (kind: string): TokenKind =>
    (TOKEN_KINDS as readonly string[]).includes(kind) ? (kind as TokenKind) : 'other'

const stripHtml = (html: string): string =>
    html
        .replace(/<(?:style|script)[\s\S]*?<\/(?:style|script)>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

const readVoice = (dsPath: string): string | null => {
    const parts: string[] = []
    const voiceHtml = join(dsPath, 'guidelines', 'brand-voice.html')
    if (existsSync(voiceHtml)) {
        parts.push(stripHtml(readFileSync(voiceHtml, 'utf8')))
    }
    const skill = join(dsPath, 'SKILL.md')
    if (existsSync(skill)) {
        parts.push(readFileSync(skill, 'utf8').trim())
    }
    return parts.length > 0 ? parts.join('\n\n') : null
}

const findDsLogos = (dsPath: string): string[] => {
    const assetsDir = join(dsPath, 'assets')
    if (!existsSync(assetsDir)) {
        return []
    }
    const files = readdirSync(assetsDir).filter((f) => LOGO_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)))
    // logo* first, then icon*, then the rest
    const rank = (f: string): number => (f.startsWith('logo') ? 0 : f.startsWith('icon') ? 1 : 2)
    return files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((f) => join(assetsDir, f))
}

/** Extract a BrandKit from a Claude-Design docs/design-system package; null when absent. */
export const extractFromManifest = (repoPath: string): BrandKit | null => {
    const dsPath = join(repoPath, DS_DIR)
    const manifestPath = join(dsPath, MANIFEST)
    if (!existsSync(manifestPath)) {
        return null
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
    const tokens: Token[] = (manifest.tokens ?? []).map((t) => ({
        name: t.name,
        value: t.value,
        kind: toKind(t.kind),
    }))

    return {
        source: 'design-system',
        repoPath,
        tokens,
        fonts: (manifest.brandFonts ?? []).map((f) => ({family: f.family, tokens: f.tokens ?? []})),
        logos: findDsLogos(dsPath),
        voice: readVoice(dsPath),
        cssPaths: (manifest.globalCssPaths ?? []).map((p) => join(dsPath, p)),
    }
}
