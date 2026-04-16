import type { APIRoute } from 'astro';
import { parseFile } from 'music-metadata';
import { subPathToFs } from '../../lib/media';
import { existsSync } from 'node:fs';

export const GET: APIRoute = async ({ url }) => {
    const subPath = url.searchParams.get('path');
    if (!subPath) {
        return new Response(JSON.stringify({ error: 'Missing path' }), { status: 400 });
    }

    const fsPath = subPathToFs(subPath);
    if (!existsSync(fsPath)) {
        return new Response(JSON.stringify({ error: 'File not found' }), { status: 404 });
    }

    try {
        const metadata = await parseFile(fsPath);

        const extractText = (val: any): string => {
            if (!val) return '';
            if (typeof val === 'string') return val;
            if (Array.isArray(val)) return val.map(extractText).filter(Boolean).join('\n');
            if (typeof val === 'object') {
                return val.text || val.value || val.description || JSON.stringify(val);
            }
            return String(val);
        };

        const comment = extractText(metadata.common.comment || metadata.common.description);
        const hasArt = !!(metadata.common.picture && metadata.common.picture.length > 0);

        return new Response(JSON.stringify({
            title: metadata.common.title || null,
            artist: metadata.common.artist || null,
            album: metadata.common.album || null,
            comment,
            hasArt
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error) {
        console.error('Metadata extraction error:', error);
        return new Response(JSON.stringify({ error: 'Failed to extract metadata' }), { status: 500 });
    }
};
