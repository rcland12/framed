import { error } from '@sveltejs/kit';
import { GameError } from './game';

/** Reads {guess: number | null} from a request body; anything else is a 400. */
export async function readGuess(
	request: Request
): Promise<{ guess: number | null; body: Record<string, unknown> }> {
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body !== 'object') error(400, 'expected JSON');
	const g = body.guess;
	if (g === null) return { guess: null, body };
	if (typeof g !== 'number' || !Number.isInteger(g) || g <= 0)
		error(400, 'guess must be a title id or null');
	return { guess: g, body };
}

/** Rule violations (game over, duplicate guess) become 409s with the message; anything else rethrows. */
export function gameError(err: unknown): never {
	if (err instanceof GameError) error(409, err.message);
	throw err;
}
