import type { APIRoute } from 'astro';
import { parseFile } from 'music-metadata';
import { subPathToFs } from '../../lib/media';
import { existsSync } from 'node:fs';

export const GET: APIRoute = async ({ url }) => {
    const subPath = url.searchParams.get('path');
    if (!subPath) {
        return new Response('Missing path', { status: 400 });
    }

    const fsPath = subPathToFs(subPath);
    if (!existsSync(fsPath)) {
        return new Response('File not found', { status: 404 });
    }

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
