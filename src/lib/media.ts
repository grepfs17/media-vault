import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

export const VIDEO_EXTENSIONS = new Set([
    '.mp4', '.mkv', '.webm', '.avi', '.mov', '.wmv', '.flv', '.m4v', '.ts', '.m2ts',
]);

export const AUDIO_EXTENSIONS = new Set([
    '.mp3', '.flac', '.aac', '.ogg', '.opus', '.wav', '.m4a', '.wma', '.ape', '.alac',
]);

export type MediaType = 'video' | 'audio' | 'directory';

export interface MediaItem {
    name: string;
    path: string;       // relative URL path for API access
    fsPath: string;     // absolute filesystem path
    type: MediaType;
    ext?: string;
    size?: number;      // bytes
    mtime?: number;     // ms since epoch
    children?: MediaItem[];
}

/** Breadcrumb segment */
export interface Crumb {
    name: string;
    path: string;
}

/** Get the absolute path to the media root */
export function getMediaRoot(): string {
    // Works when Astro runs from the project directory
    return join(process.cwd(), '.', 'media');
}

/** Convert a relative URL sub-path (e.g. "Movies/Action") to an FS path  */
export function subPathToFs(subPath: string): string {
    // Strip leading slashes and prevent path traversal
    const clean = subPath.replace(/^\/+/, '').replace(/\.\./g, '');
    return join(getMediaRoot(), clean);
}

/** Convert an absolute FS path back to a URL sub-path */
export function fsToSubPath(fsPath: string): string {
    const root = getMediaRoot();
    return fsPath.startsWith(root) ? fsPath.slice(root.length).replace(/\\/g, '/') : '';
}

/** Read one level of a directory and return sorted MediaItems */
export function readDir(dirPath: string): MediaItem[] {
    if (!existsSync(dirPath)) return [];

    let entries: string[];
    try {
        entries = readdirSync(dirPath);
    } catch {
        return [];
    }

    const items: MediaItem[] = [];

    for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        let stat;
        try {
            stat = statSync(fullPath);
        } catch {
            continue;
        }

        const ext = extname(entry).toLowerCase();

        if (stat.isDirectory()) {
            items.push({
                name: entry,
                path: fsToSubPath(fullPath),
                fsPath: fullPath,
                type: 'directory',
                mtime: stat.mtimeMs,
            });
        } else if (VIDEO_EXTENSIONS.has(ext)) {
            items.push({
                name: entry,
                path: fsToSubPath(fullPath),
                fsPath: fullPath,
                type: 'video',
                ext,
                size: stat.size,
                mtime: stat.mtimeMs,
            });
        } else if (AUDIO_EXTENSIONS.has(ext)) {
            items.push({
                name: entry,
                path: fsToSubPath(fullPath),
                fsPath: fullPath,
                type: 'audio',
                ext,
                size: stat.size,
                mtime: stat.mtimeMs,
            });
        }
    }

    // Directories first, then sorted alphabetically
    items.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return items;
}

/** Build breadcrumb trail for a sub-path */
export function buildCrumbs(subPath: string): Crumb[] {
    const parts = subPath.split('/').filter(Boolean);
    const crumbs: Crumb[] = [{ name: 'Home', path: '' }];
    let accumulated = '';
    for (const part of parts) {
        accumulated += '/' + part;
        crumbs.push({ name: part, path: accumulated });
    }
    return crumbs;
}

/** Format bytes as human-readable string */
export function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
