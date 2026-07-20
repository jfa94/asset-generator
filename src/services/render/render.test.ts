import {existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import sharp from 'sharp'
import {afterAll, describe, expect, it, vi} from 'vitest'
import {loadJobs, main, toDataUri, type RenderJobFile} from '@/services/render/cli'
import type {RenderSpec} from '@/services/render/html'
import {isBlockedRequestUrl, renderJobs, verifyPng} from '@/services/render/render'

const dir = mkdtempSync(join(tmpdir(), 'render-'))
afterAll(() => {
    rmSync(dir, {recursive: true, force: true})
})

const goodbyespyLogo = join(
    process.cwd(),
    'src/lib/brandkit/__fixtures__/goodbyespy/docs/design-system/assets/logo.png'
)

const renderSpec = (overrides: Partial<RenderSpec> = {}): RenderSpec => ({
    spec: {
        lockup: 'poster',
        palette: {background: '#fffbf5', text: '#064e3b', accent: '#b5541f'},
        copy: {
            headline: 'Render smoke test',
            subline: 'One purchase.',
            badge: '50% off',
            stat: '4.8',
            statLabel: 'stars',
        },
    },
    width: 1200,
    height: 628,
    fonts: {display: 'Georgia', body: 'Helvetica'},
    cssText: '',
    logoDataUri: null,
    imageDataUri: null,
    ...overrides,
})

const withLockup = (lockup: RenderSpec['spec']['lockup'], overrides: Partial<RenderSpec> = {}): RenderSpec => {
    const base = renderSpec(overrides)
    return {...base, spec: {...base.spec, lockup}}
}

describe('renderJobs', () => {
    it('renders each size pixel-exact, including 9:16 with safe zones', {timeout: 60_000}, async () => {
        const jobs = [
            {render: renderSpec({width: 1200, height: 628}), outPath: join(dir, 'landscape.png')},
            {render: withLockup('badge', {width: 1200, height: 1200}), outPath: join(dir, 'square.png')},
            {
                render: withLockup('stat', {width: 1080, height: 1920, safeZone: {top: 0.14, bottom: 0.2}}),
                outPath: join(dir, 'story.png'),
            },
            {
                render: withLockup('image-hero', {
                    width: 1080,
                    height: 1080,
                    imageDataUri: toDataUri(goodbyespyLogo),
                }),
                outPath: join(dir, 'hero.png'),
            },
        ]
        const results = await renderJobs(jobs)
        expect(results).toHaveLength(4)
        for (const job of jobs) {
            const meta = await sharp(job.outPath).metadata()
            expect([meta.width, meta.height]).toEqual([job.render.width, job.render.height])
            expect(statSync(job.outPath).size).toBeLessThan(5 * 1024 * 1024)
        }
    })

    it('renders brand background color onto the canvas', {timeout: 60_000}, async () => {
        const out = join(dir, 'bg.png')
        const base = renderSpec()
        await renderJobs([
            {
                render: {
                    ...base,
                    spec: {
                        ...base.spec,
                        palette: {background: '#ff0000', text: '#000', accent: '#000'},
                        copy: {headline: 'x'},
                    },
                },
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

describe('isBlockedRequestUrl', () => {
    it.each([
        'http://localhost/x',
        'http://localhost./x',
        'http://sub.localhost/x',
        'http://metadata.internal/x',
        'http://127.0.0.1/x',
        'http://127.1.2.3/x',
        'http://10.0.0.1/x',
        'http://169.254.169.254/latest/meta-data/',
        'http://172.16.0.1/x',
        'http://172.31.255.255/x',
        'http://192.168.1.1/x',
        'http://0.0.0.0/x',
        'http://2130706433/', // decimal-encoded 127.0.0.1 — URL canonicalizes to dotted-quad
        'http://0x7f000001/',
        'http://[::1]/x',
        'http://[fd00::1]/x',
        'file:///etc/passwd',
        'ftp://example.com/x',
        'not a url',
    ])('blocks %s', (u) => {
        expect(isBlockedRequestUrl(u)).toBe(true)
    })

    it.each([
        'https://fonts.googleapis.com/css2?family=Besley',
        'https://fonts.gstatic.com/s/besley/v14/x.woff2',
        'http://example.com/style.css',
        'data:font/woff2;base64,AAAA',
        'http://172.32.0.1/x', // just outside 172.16/12
        'http://172.15.255.255/x',
        'http://11.0.0.1/x',
    ])('allows %s', (u) => {
        expect(isBlockedRequestUrl(u)).toBe(false)
    })
})

const jobFile = (overrides: Partial<RenderJobFile>): RenderJobFile => ({
    lockup: 'poster',
    palette: {background: '#fffbf5', text: '#064e3b', accent: '#b5541f'},
    copy: {headline: 'Render smoke test'},
    width: 300,
    height: 300,
    fonts: {display: 'Georgia', body: 'Helvetica'},
    cssPaths: [],
    logoPath: null,
    imagePath: null,
    outPath: join(dir, 'out.png'),
    ...overrides,
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
        writeFileSync(jobsFile, JSON.stringify([jobFile({outPath: out})]))
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
    it('inlines css files, logo, and image data uris', () => {
        const css = join(dir, 'a.css')
        writeFileSync(css, 'body{--x:1}')
        const css2 = join(dir, 'b.css')
        writeFileSync(css2, 'body{--y:2}')
        const logo = join(dir, 'logo.png')
        writeFileSync(logo, Buffer.from('89504e47', 'hex'))
        const image = join(dir, 'shot.jpg')
        writeFileSync(image, Buffer.from('ffd8ffe0', 'hex'))
        const jobsFile = join(dir, 'jobs.json')
        writeFileSync(
            jobsFile,
            JSON.stringify([
                jobFile({
                    lockup: 'image-hero',
                    safeZone: {top: 0.14, bottom: 0.2},
                    cssPaths: [css, css2],
                    logoPath: logo,
                    imagePath: image,
                }),
            ])
        )
        const jobs = loadJobs(jobsFile)
        expect(jobs[0]?.render.spec.lockup).toBe('image-hero')
        expect(jobs[0]?.render.cssText).toBe('body{--x:1}\nbody{--y:2}')
        expect(jobs[0]?.render.logoDataUri).toMatch(/^data:image\/png;base64,/)
        expect(jobs[0]?.render.imageDataUri).toMatch(/^data:image\/jpeg;base64,/)
        expect(jobs[0]?.render.safeZone).toEqual({top: 0.14, bottom: 0.2})
        expect(jobs[0]?.outPath).toBe(join(dir, 'out.png'))
    })

    it('leaves logo and image null when the job has none', () => {
        const jobsFile = join(dir, 'jobs-null.json')
        writeFileSync(jobsFile, JSON.stringify([jobFile({})]))
        const jobs = loadJobs(jobsFile)
        expect(jobs[0]?.render.logoDataUri).toBeNull()
        expect(jobs[0]?.render.imageDataUri).toBeNull()
    })

    it('maps mime types by extension', () => {
        const cases: [string, string][] = [
            ['svg', 'image/svg+xml'],
            ['webp', 'image/webp'],
            ['jpg', 'image/jpeg'],
            ['jpeg', 'image/jpeg'],
            ['png', 'image/png'],
            ['css', 'text/css'],
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
