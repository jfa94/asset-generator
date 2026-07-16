import {existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import sharp from 'sharp'
import {afterAll, describe, expect, it, vi} from 'vitest'
import type {TemplateSpec} from '@/lib/templates/types'
import {loadJobs, main, toDataUri} from '@/services/render/cli'
import {renderJobs, verifyPng} from '@/services/render/render'

const dir = mkdtempSync(join(tmpdir(), 'render-'))
afterAll(() => {
    rmSync(dir, {recursive: true, force: true})
})

const spec = (overrides: Partial<TemplateSpec>): TemplateSpec => ({
    template: 'poster-type',
    width: 1200,
    height: 628,
    palette: {
        background: '#fffbf5',
        text: '#064e3b',
        accent: '#b5541f',
        ctaBackground: '#064e3b',
        ctaText: '#fffbf5',
    },
    fonts: {display: 'Georgia', body: 'Helvetica'},
    cssText: '',
    logoDataUri: null,
    copy: {headline: 'Render smoke test', cta: 'Go'},
    ...overrides,
})

describe('renderJobs', () => {
    it('renders each size pixel-exact, including 9:16 with safe zones', {timeout: 60_000}, async () => {
        const jobs = [
            {spec: spec({width: 1200, height: 628}), outPath: join(dir, 'landscape.png')},
            {spec: spec({template: 'offer-stamp', width: 1200, height: 1200}), outPath: join(dir, 'square.png')},
            {
                spec: spec({
                    template: 'stat-callout',
                    width: 1080,
                    height: 1920,
                    safeZone: {top: 0.14, bottom: 0.2},
                }),
                outPath: join(dir, 'story.png'),
            },
        ]
        const results = await renderJobs(jobs)
        expect(results).toHaveLength(3)
        for (const job of jobs) {
            const meta = await sharp(job.outPath).metadata()
            expect([meta.width, meta.height]).toEqual([job.spec.width, job.spec.height])
            expect(statSync(job.outPath).size).toBeLessThan(5 * 1024 * 1024)
        }
    })

    it('renders brand background color onto the canvas', {timeout: 60_000}, async () => {
        const out = join(dir, 'bg.png')
        await renderJobs([
            {
                spec: spec({
                    copy: {headline: 'x'},
                    palette: {
                        background: '#ff0000',
                        text: '#000',
                        accent: '#000',
                        ctaBackground: '#000',
                        ctaText: '#fff',
                    },
                }),
                outPath: out,
            },
        ])
        const {data} = await sharp(out).extract({left: 1150, top: 10, width: 4, height: 4}).raw().toBuffer({
            resolveWithObject: true,
        })
        expect([data[0], data[1], data[2]]).toEqual([255, 0, 0])
    })
})

describe('verifyPng', () => {
    it('rejects dimension mismatches, including single-axis ones', async () => {
        const png = await sharp({create: {width: 10, height: 10, channels: 3, background: '#fff'}})
            .png()
            .toBuffer()
        await expect(verifyPng(png, 20, 20, 'x.png')).rejects.toThrow('Rendered 10x10, expected 20x20 (x.png)')
        await expect(verifyPng(png, 10, 20, 'x.png')).rejects.toThrow('expected 10x20')
        await expect(verifyPng(png, 20, 10, 'x.png')).rejects.toThrow('expected 20x10')
    })

    it('returns the buffer untouched when within limits', async () => {
        const png = await sharp({create: {width: 10, height: 10, channels: 3, background: '#fff'}})
            .png()
            .toBuffer()
        expect(await verifyPng(png, 10, 10, 'x.png')).toBe(png)
    })

    it('compresses oversized images while keeping dimensions', async () => {
        // deterministic pseudo-noise stored uncompressed → well over the 5MB cap
        const raw = Buffer.alloc(1500 * 1500 * 3)
        for (let i = 0; i < raw.length; i++) {
            raw[i] = (i * 2654435761) % 256
        }
        const big = await sharp(raw, {raw: {width: 1500, height: 1500, channels: 3}})
            .png({compressionLevel: 0})
            .toBuffer()
        expect(big.byteLength).toBeGreaterThan(5 * 1024 * 1024)
        const out = await verifyPng(big, 1500, 1500, 'big.png')
        expect(out.byteLength).toBeLessThan(big.byteLength)
        const meta = await sharp(out).metadata()
        expect([meta.width, meta.height]).toEqual([1500, 1500])
    })

    it('throws when compression cannot bring the image under the cap', {timeout: 60_000}, async () => {
        // xorshift noise resists palette quantization + deflate → stays over 5MB
        const raw = Buffer.alloc(3000 * 3000 * 3)
        let s = 42
        for (let i = 0; i < raw.length; i++) {
            s ^= s << 13
            s ^= s >>> 17
            s ^= s << 5
            raw[i] = s & 0xff
        }
        const big = await sharp(raw, {raw: {width: 3000, height: 3000, channels: 3}})
            .png({compressionLevel: 0})
            .toBuffer()
        await expect(verifyPng(big, 3000, 3000, 'huge.png')).rejects.toThrow(
            /exceeds cap \d+ after compression \(huge\.png\)/
        )
    })
})

describe('cli main', () => {
    it('throws usage without a jobs path', async () => {
        const argv = process.argv
        process.argv = argv.slice(0, 2)
        try {
            await expect(main()).rejects.toThrow('Usage')
        } finally {
            process.argv = argv
        }
    })

    it('renders jobs from the file given on argv', {timeout: 60_000}, async () => {
        const jobsFile = join(dir, 'main-jobs.json')
        const out = join(dir, 'main-out.png')
        const base = spec({width: 300, height: 300})
        writeFileSync(
            jobsFile,
            JSON.stringify([
                {
                    template: base.template,
                    width: base.width,
                    height: base.height,
                    palette: base.palette,
                    fonts: base.fonts,
                    copy: base.copy,
                    cssPaths: [],
                    logoPath: null,
                    outPath: out,
                },
            ])
        )
        const argv = process.argv
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        process.argv = [...argv.slice(0, 2), jobsFile]
        try {
            await main()
            expect(logged).toHaveBeenCalledWith(`rendered ${out} (300x300, ${String(statSync(out).size)} bytes)`)
        } finally {
            process.argv = argv
            logged.mockRestore()
        }
        const meta = await sharp(out).metadata()
        expect([meta.width, meta.height]).toEqual([300, 300])
    })
})

describe('loadJobs', () => {
    it('inlines css files and logo data uri', () => {
        const css = join(dir, 'a.css')
        writeFileSync(css, 'body{--x:1}')
        const css2 = join(dir, 'b.css')
        writeFileSync(css2, 'body{--y:2}')
        const logo = join(dir, 'logo.png')
        writeFileSync(logo, Buffer.from('89504e47', 'hex'))
        const jobsFile = join(dir, 'jobs.json')
        const base = spec({})
        writeFileSync(
            jobsFile,
            JSON.stringify([
                {
                    template: base.template,
                    width: base.width,
                    height: base.height,
                    palette: base.palette,
                    fonts: base.fonts,
                    copy: base.copy,
                    cssPaths: [css, css2],
                    logoPath: logo,
                    outPath: join(dir, 'out.png'),
                },
            ])
        )
        const jobs = loadJobs(jobsFile)
        expect(jobs[0]?.spec.cssText).toBe('body{--x:1}\nbody{--y:2}')
        expect(jobs[0]?.spec.logoDataUri).toMatch(/^data:image\/png;base64,/)
        expect(jobs[0]?.outPath).toBe(join(dir, 'out.png'))
    })

    it('maps mime types by extension', () => {
        const cases: [string, string][] = [
            ['svg', 'image/svg+xml'],
            ['webp', 'image/webp'],
            ['jpg', 'image/jpeg'],
            ['jpeg', 'image/jpeg'],
            ['png', 'image/png'],
        ]
        for (const [ext, mime] of cases) {
            const f = join(dir, `mime.${ext}`)
            writeFileSync(f, 'x')
            expect(toDataUri(f)).toBe(`data:${mime};base64,eA==`)
        }
    })

    it('toDataUri falls back to octet-stream for unknown extensions', () => {
        const f = join(dir, 'blob.bin')
        writeFileSync(f, 'x')
        expect(toDataUri(f)).toContain('application/octet-stream')
        expect(existsSync(f)).toBe(true)
        expect(readFileSync(f, 'utf8')).toBe('x')
    })
})
