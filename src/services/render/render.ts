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

/** Compress if over the ad-platform byte cap, then verify pixel-exact dimensions. */
export const verifyPng = async (png: Buffer, width: number, height: number, label: string): Promise<Buffer> => {
    let out = png
    if (out.byteLength > MAX_IMAGE_BYTES) {
        out = await sharp(out).png({compressionLevel: 9, palette: true}).toBuffer()
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
