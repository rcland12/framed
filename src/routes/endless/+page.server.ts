import { endlessStats, endlessUnlocked, endlessView } from '$lib/server/game';

export async function load({ locals }) {
	const player = { userId: locals.user?.id ?? null, anonId: locals.anonId };
	const unlocked = await endlessUnlocked(player);
	if (!unlocked) return { unlocked, play: null, stats: null };
	const [play, stats] = await Promise.all([endlessView(player), endlessStats(player)]);
	return { unlocked, play, stats };
}
