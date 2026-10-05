import { json } from '@sveltejs/kit';
import { guessableTitles } from '$lib/server/game';

/** The guess list: [id, title, year] triples, compact because it's every film in the library. */
export async function GET() {
	const list = await guessableTitles();
	return json(
		list.map((t) => [t.id, t.title, t.year]),
		{ headers: { 'cache-control': 'public, max-age=300' } }
	);
}
