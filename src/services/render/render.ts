import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'
import puppeteer, {type Browser} from 'puppeteer'
import sharp from 'sharp'
import {MAX_IMAGE_BYTES} from '@/domain/formats'
import {buildHtml} from '@/lib/templates/templates'
import type {TemplateSpec} from '@/lib/templates/types'

export interface RenderJob {
    spec: TemplateSpec
    outPath: string
}

export interface RenderResult {
    outPath: string
    width: number
    height: number
    bytes: number
}

const isPrivateIpv4 = (host: string): boolean => {
    const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host)
    if (m === null) {
        return false
    }
    const a = Number(m[1])
    const b = Number(m[2])
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
    )
}

/**
 * Hostname-level SSRF guard for the render browser: brand cssText is repo-controlled input and
 * its @imports fetch through Puppeteer. Allows data: and public http(s) hosts (font CDNs are the
 * designed feature); blocks other schemes, localhost/*.internal, IPv6 literals, and private/
 * loopback/link-local IPv4 (WHATWG URL canonicalizes encoded forms to dotted-quad first).
 * DNS rebinding is out of scope — CDP has no pre-connect resolved-IP hook; real containment
 * is deployment-level egress control.
 */
export const isBlockedRequestUrl = (rawUrl: string): boolean => {
    let url: URL
    try {
        url = new URL(rawUrl)
    } catch {
        return true
    }
    if (url.protocol === 'data:') {
        return false
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return true
    }
    const host = url.hostname.replace(/\.$/, '')
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
        return true
    }
    if (host.startsWith('[')) {
        return true
    }
    return isPrivateIpv4(host)
}

/** Compress if over the ad-platform byte cap, then verify the cap held and dimensions are pixel-exact. */
export const verifyPng = async (png: Buffer, width: number, height: number, label: string): Promise<Buffer> => {
    let out = png
    if (out.byteLength > MAX_IMAGE_BYTES) {
        out = await sharp(out).png({compressionLevel: 9, palette: true}).toBuffer()
        if (out.byteLength > MAX_IMAGE_BYTES) {
            throw new Error(
                `Rendered ${String(out.byteLength)} bytes, exceeds cap ${String(MAX_IMAGE_BYTES)} after compression (${label})`
            )
        }
    }
    const meta = await sharp(out).metadata()
    if (meta.width !== width || meta.height !== height) {
        throw new Error(
            `Rendered ${String(meta.width)}x${String(meta.height)}, expected ${String(width)}x${String(height)} (${label})`
        )
    }
    return out
}

const renderOne = async (browser: Browser, job: RenderJob): Promise<RenderResult> => {
    const {spec, outPath} = job
    const page = await browser.newPage()
    try {
        await page.setViewport({width: spec.width, height: spec.height})
        await page.setRequestInterception(true)
        page.on('request', (req) => {
            void (isBlockedRequestUrl(req.url()) ? req.abort('blockedbyclient') : req.continue())
        })
        await page.setContent(buildHtml(spec), {waitUntil: 'load'})
        await page.waitForNetworkIdle()
        await page.evaluate('document.fonts.ready')
        const raw = (await page.screenshot({type: 'png'})) as Buffer
        const png = await verifyPng(raw, spec.width, spec.height, outPath)
        mkdirSync(dirname(outPath), {recursive: true})
        writeFileSync(outPath, png)
        return {outPath, width: spec.width, height: spec.height, bytes: png.byteLength}
    } finally {
        await page.close()
    }
}

/** Render every job with one shared browser; throws on the first failure. */
export const renderJobs = async (jobs: RenderJob[]): Promise<RenderResult[]> => {
    const browser = await puppeteer.launch()
    try {
        const results: RenderResult[] = []
        for (const job of jobs) {
            results.push(await renderOne(browser, job))
        }
        return results
    } finally {
        await browser.close()
    }
}
