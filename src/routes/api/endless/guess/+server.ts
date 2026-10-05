import { json } from '@sveltejs/kit';
import { guessEndless } from '$lib/server/game';
import { gameError, readGuess } from '$lib/server/api';

export async function POST({ request, locals }) {
	const { guess, body } = await readGuess(request);
	const player = { userId: locals.user?.id ?? null, anonId: locals.anonId };
	try {
		return json(await guessEndless(player, String(body.playId ?? ''), guess));
	} catch (err) {
		gameError(err);
	}
}
