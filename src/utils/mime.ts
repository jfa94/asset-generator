import {extname} from 'node:path'

const MIME: Record<string, string> = {
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.css': 'text/css',
}

/** Content type by file extension; octet-stream for anything unrecognized. */
export const mimeFor = (path: string): string => MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
