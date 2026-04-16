import type { APIRoute } from 'astro';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { subPathToFs, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS } from '../../lib/media';

const CHUNK_SIZE = 1024 * 1024; // 1 MB — low memory footprint for 4 GB RAM

const MIME: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.m4v': 'video/mp4',
    '.ts': 'video/mp2t',
    '.m2ts': 'video/mp2t',
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg; codecs=opus',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.wma': 'audio/x-ms-wma',
};

export const GET: APIRoute = async ({ url, request }) => {
    const subPath = url.searchParams.get('path') ?? '';
    if (!subPath) {
        return new Response('Missing path', { status: 400 });
    }

    const fsPath = subPathToFs(subPath);
    if (!existsSync(fsPath)) {
        return new Response('Not found', { status: 404 });
    }

    const ext = extname(fsPath).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(ext) && !AUDIO_EXTENSIONS.has(ext)) {
        return new Response('Forbidden', { status: 403 });
    }

    let stat;
    try {
        stat = statSync(fsPath);
    } catch {
        return new Response('Cannot stat file', { status: 500 });
    }

    const fileSize = stat.size;
    const mimeType = MIME[ext] ?? 'application/octet-stream';
    const rangeHeader = request.headers.get('range');

    if (rangeHeader) {
        // Parse Range header: bytes=start-end
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (!match) {
            return new Response('Invalid Range', { status: 416 });
        }

        const rawStart = match[1] ? parseInt(match[1], 10) : 0;
        const rawEnd = match[2] ? parseInt(match[2], 10) : fileSize - 1;

        const start = rawStart;
        const end = Math.min(rawEnd, start + CHUNK_SIZE - 1, fileSize - 1);

        if (start >= fileSize) {
            return new Response('Range Not Satisfiable', {
                status: 416,
                headers: { 'Content-Range': `bytes */${fileSize}` },
            });
        }

        const chunkLength = end - start + 1;

        // Node.js Readable → Web ReadableStream bridge
        const nodeStream = createReadStream(fsPath, { start, end });
        const webStream = new ReadableStream({
            start(controller) {
                nodeStream.on('data', (chunk) => controller.enqueue(chunk));
                nodeStream.on('end', () => controller.close());
                nodeStream.on('error', (err) => controller.error(err));
            },
            cancel() {
                nodeStream.destroy();
            },
        });

        return new Response(webStream, {
            status: 206,
            headers: {
                'Content-Type': mimeType,
                'Content-Length': String(chunkLength),
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-store',
            },
        });
    }

    // No Range — stream the whole file (browser will request ranges afterward)
    const nodeStream = createReadStream(fsPath);
    const webStream = new ReadableStream({
        start(controller) {
            nodeStream.on('data', (chunk) => controller.enqueue(chunk));
            nodeStream.on('end', () => controller.close());
            nodeStream.on('error', (err) => controller.error(err));
        },
        cancel() {
            nodeStream.destroy();
        },
    });

    return new Response(webStream, {
        status: 200,
        headers: {
            'Content-Type': mimeType,
            'Content-Length': String(fileSize),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store',
        },
    });
};
