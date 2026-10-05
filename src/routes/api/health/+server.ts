import { json } from '@sveltejs/kit';
import { query } from '$lib/server/db';

export async function GET() {
	await query('select 1');
	return json({ ok: true });
}
