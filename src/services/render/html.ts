import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {Lockup} from '@/lib/lockups/lockups'
import type {CreativeSpec, SafeZone} from '@/types/creative'
import type {LockupFonts} from '@/lib/lockups/lockups'

// react-dom/server stays confined to the services layer so the lockup bank remains client-safe.

export interface RenderSpec {
    spec: CreativeSpec
    width: number
    height: number
    safeZone?: SafeZone | undefined
    fonts: LockupFonts
    /** inlined stylesheet text (typically the brand's fonts.css with its @imports) */
    cssText: string
    logoDataUri: string | null
    imageDataUri: string | null
}

/** Build the self-contained HTML document Puppeteer screenshots. */
export const buildHtml = (r: RenderSpec): string => {
    const markup = renderToStaticMarkup(
        createElement(Lockup, {
            spec: r.spec,
            width: r.width,
            height: r.height,
            safeZone: r.safeZone,
            fonts: r.fonts,
            logoSrc: r.logoDataUri,
            imageSrc: r.imageDataUri,
        })
    )
    return [
        '<!doctype html><html><head><meta charset="utf-8">',
        `<style>${r.cssText}</style>`,
        '<style>html,body{margin:0;padding:0}</style>',
        '</head><body>',
        markup,
        '</body></html>',
    ].join('')
}
