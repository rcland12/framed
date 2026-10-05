import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { one } from '$lib/server/db';
import { framePath } from '$lib/server/library';

/**
 * Frame images, by their random token only. A token is handed out when a frame is revealed, so
 * there is no way to ask for frame 4 before earning it.
 */
export async function GET({ params }) {
	if (!/^[A-Za-z0-9_-]{16,40}$/.test(params.token)) error(404, 'not found');
	const row = await one<{ file: string }>('select file from frames where token = $1', [
		params.token
	]);
	if (!row) error(404, 'not found');
	const data = await readFile(framePath(row.file)).catch(() => null);
	if (!data) error(404, 'not found');
	return new Response(new Uint8Array(data), {
		headers: {
			'content-type': 'image/webp',
			'cache-control': 'public, max-age=31536000, immutable',
			'x-robots-tag': 'noindex'
		}
	});
}
