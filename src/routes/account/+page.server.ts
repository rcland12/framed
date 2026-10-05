import { fail, redirect } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/auth';
import { query } from '$lib/server/db';
import { dailyStats, endlessStats } from '$lib/server/game';
import { log } from '$lib/server/config';

export async function load({ locals }) {
	if (!locals.user) redirect(303, '/login?next=/account');
	const player = { userId: locals.user.id, anonId: locals.anonId };
	const [daily, endless] = await Promise.all([dailyStats(player), endlessStats(player)]);
	return { daily, endless };
}

export const actions = {
	email: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const form = await request.formData();
		const on = form.get('daily') === 'on';
		await query('update users set email_daily = $2 where id = $1', [locals.user.id, on]);
		return { saved: true };
	},
	delete: async ({ request, locals, cookies }) => {
		if (!locals.user) return fail(401);
		const form = await request.formData();
		if (
			String(form.get('confirm') ?? '')
				.trim()
				.toLowerCase() !== locals.user.email
		) {
			return fail(400, { deleteError: 'Type your email address to confirm.' });
		}
		// Sessions and plays go with the account (on delete cascade).
		await query('delete from users where id = $1', [locals.user.id]);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		log('account_deleted', { user: locals.user.id });
		redirect(303, '/');
	}
};
