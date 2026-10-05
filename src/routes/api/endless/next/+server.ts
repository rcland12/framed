import { error, json } from '@sveltejs/kit';
import { endlessStats, endlessUnlocked, nextEndless } from '$lib/server/game';
import { gameError } from '$lib/server/api';

export async function POST({ locals }) {
	const player = { userId: locals.user?.id ?? null, anonId: locals.anonId };
	if (!(await endlessUnlocked(player))) error(403, 'finish today’s puzzle first');
	try {
		const play = await nextEndless(player);
		return json({ play, stats: await endlessStats(player) });
	} catch (err) {
		gameError(err);
	}
}
