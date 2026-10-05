import { fail } from '@sveltejs/kit';
import { dashboard } from '$lib/server/admin';
import { log } from '$lib/server/config';
import { today } from '$lib/server/dates';
import { one, query } from '$lib/server/db';
import { ingestStatus, kickWorkers, scanLibrary } from '$lib/server/library';
import { runDailyEmail, sendDailyEmailTo } from '$lib/server/scheduler';
import { backfillTmdb, tmdbEnabled } from '$lib/server/tmdb';

export async function load() {
	return { ...(await dashboard()), ingest: ingestStatus(), tmdb: tmdbEnabled() };
}

export const actions = {
	scan: async ({ locals }) => {
		log('admin_scan', { by: locals.user?.email });
		const r = await scanLibrary();
		return {
			message: r.error
				? `Scan: ${r.error}`
				: `Scan found ${r.folders} folders: ${r.added} new, ${r.changed} changed, ${r.missing} gone.`
		};
	},
	retry: async () => {
		const rows = await query(
			`update titles set status = 'pending', error = null where status = 'error' and not missing returning id`
		);
		kickWorkers();
		return { message: `Queued ${rows.length} failed movies again.` };
	},
	tmdb: async () => {
		if (!tmdbEnabled()) return fail(400, { message: 'TMDB_API_KEY is not set.' });
		await query('update titles set tmdb_checked_at = null where tmdb_id is null');
		void backfillTmdb();
		return { message: 'TMDB lookup started for every movie without a match.' };
	},
	testEmail: async ({ locals }) => {
		const me = await one<{ id: number; email: string; unsubscribe_token: string }>(
			'select id, email, unsubscribe_token from users where id = $1',
			[locals.user!.id]
		);
		try {
			await sendDailyEmailTo(me!, today());
			return { message: `Sent today's email to ${me!.email}.` };
		} catch (err) {
			return fail(500, { message: `Send failed: ${(err as Error).message}` });
		}
	},
	sendNow: async ({ locals }) => {
		log('admin_send_daily', { by: locals.user?.email });
		await runDailyEmail(true);
		return { message: 'Today’s email has been sent (or had already gone out).' };
	}
};
