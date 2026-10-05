import { fail } from '@sveltejs/kit';
import { addDays, isDate, today } from '$lib/server/dates';
import { clearDaily, listSchedule, scheduleAhead, setDaily } from '$lib/server/puzzles';

export async function load() {
	const now = today();
	const rows = await listSchedule(addDays(now, -60), addDays(now, 30));
	return { today: now, rows };
}

export const actions = {
	set: async ({ request, locals }) => {
		const form = await request.formData();
		const date = String(form.get('date') ?? '');
		const titleId = Number(form.get('title'));
		if (!isDate(date) || !Number.isInteger(titleId)) return fail(400, { message: 'Pick a movie.' });
		try {
			await setDaily(date, titleId, locals.user!.email);
			return { message: `Changed ${date}.` };
		} catch (err) {
			return fail(400, { message: (err as Error).message });
		}
	},
	reroll: async ({ request }) => {
		const form = await request.formData();
		const date = String(form.get('date') ?? '');
		if (!isDate(date)) return fail(400, { message: 'bad date' });
		try {
			await clearDaily(date);
			await scheduleAhead(31);
			return { message: `Picked a new movie for ${date}.` };
		} catch (err) {
			return fail(400, { message: (err as Error).message });
		}
	}
};
