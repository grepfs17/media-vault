import type { APIRoute } from 'astro';
import { parseFile } from 'music-metadata';
import { subPathToFs } from '../../lib/media';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

export const GET: APIRoute = async ({ url }) => {
    const subPath = url.searchParams.get('path');
    if (!subPath) {
        return new Response('Missing path', { status: 400 });
    }

    const fsPath = subPathToFs(subPath);
    if (!existsSync(fsPath)) {
        return new Response('File not found', { status: 404 });
    }

    const ext = fsPath.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? '';
    const videoExtensions = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v'];

    // ── Video Thumbnail Extraction (FFmpeg) ──────────────────
    if (videoExtensions.includes(ext)) {
        try {
            const thumbnail = await new Promise<Buffer>((resolve, reject) => {
                const ffmpeg = spawn('ffmpeg', [
                    '-ss', '1', // Start at 1 second
                    '-i', fsPath,
                    '-vframes', '1',
                    '-f', 'image2',
                    '-vcodec', 'mjpeg',
                    'pipe:1'
                ]);

                const chunks: Buffer[] = [];
                ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
                ffmpeg.on('close', (code) => {
                    if (code === 0 && chunks.length > 0) {
                        resolve(Buffer.concat(chunks));
                    } else {
                        reject(new Error(`FFmpeg exited with code ${code}`));
                    }
                });
                ffmpeg.on('error', (err) => reject(err));

                // Set a timeout to prevent hanging
                setTimeout(() => {
                    ffmpeg.kill();
                    reject(new Error('FFmpeg timeout'));
                }, 5000);
            });

            return new Response(thumbnail, {
                headers: {
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'public, max-age=86400', // 24h for video thumbs
                },
            });
        } catch (error) {
            // Log but continue to metadata check as fallback
            console.warn(`Video thumbnail extraction failed for ${fsPath}:`, (error as Error).message);
        }
    }

    // ── Audio Metadata Extraction ───────────────────────────
    try {
        const metadata = await parseFile(fsPath);

        if (metadata.common.picture && metadata.common.picture.length > 0) {
            const pic = metadata.common.picture[0];

            let mimeType = (pic.format || 'image/jpeg').trim().toLowerCase();
            if (!mimeType.includes('/')) {
                if (mimeType === 'jpg' || mimeType === 'jpeg') mimeType = 'image/jpeg';
                else if (mimeType === 'png') mimeType = 'image/png';
                else if (mimeType === 'gif') mimeType = 'image/gif';
                else mimeType = `image/${mimeType}`;
            }

            return new Response(pic.data as any, {
                headers: {
                    'Content-Type': mimeType,
                    'Cache-Control': 'public, max-age=3600',
                },
            });
        }

        return new Response('No art found', { status: 404 });
    } catch (error) {
        console.error('Album art extraction error:', error);
        return new Response('Error extracting album art', { status: 500 });
    }
};
