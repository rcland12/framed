import { error, json } from '@sveltejs/kit';
import { guessDaily } from '$lib/server/game';
import { isDate } from '$lib/server/dates';
import { gameError, readGuess } from '$lib/server/api';

export async function POST({ request, locals }) {
	const { guess, body } = await readGuess(request);
	const date = String(body.date ?? '');
	if (!isDate(date)) error(400, 'bad date');
	const player = { userId: locals.user?.id ?? null, anonId: locals.anonId };
	try {
		return json(await guessDaily(player, date, guess));
	} catch (err) {
		gameError(err);
	}
}
