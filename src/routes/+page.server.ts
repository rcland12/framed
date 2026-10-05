import { dailyStats, dailyView } from '$lib/server/game';
import { longDate, today } from '$lib/server/dates';

export async function load({ locals }) {
	const player = { userId: locals.user?.id ?? null, anonId: locals.anonId };
	const date = today();
	const [play, stats] = await Promise.all([dailyView(player, date), dailyStats(player)]);
	return { date, dateLabel: longDate(date), play, stats };
}
