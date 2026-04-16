import type { APIRoute } from 'astro';
import { readDir, subPathToFs } from '../../lib/media';

export const GET: APIRoute = ({ url }) => {
    const subPath = url.searchParams.get('path') ?? '';
    const dirPath = subPathToFs(subPath);
    const items = readDir(dirPath);

    return new Response(JSON.stringify({ items }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        },
    });
};
