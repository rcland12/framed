import { error, fail } from '@sveltejs/kit';
import { titleDetail } from '$lib/server/admin';
import { log } from '$lib/server/config';
import { isDate } from '$lib/server/dates';
import { query } from '$lib/server/db';
import {
	addCandidates,
	addFrameAt,
	autoFill,
	deleteFrame,
	reprocess,
	setPositions
} from '$lib/server/library';
import { setDaily } from '$lib/server/puzzles';
import { refreshTmdb, tmdbEnabled } from '$lib/server/tmdb';

function titleId(params: { id: string }): number {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) error(404, 'not found');
	return id;
}

export async function load({ params }) {
	const detail = await titleDetail(titleId(params));
	if (!detail) error(404, 'not found');
	return { ...detail, tmdb: tmdbEnabled() };
}

/** "1:02:03", "62:03" or "3723" → seconds. */
function parseTime(s: string): number | null {
	const parts = s.trim().split(':').map(Number);
	if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0))
		return null;
	return parts.reduce((acc, n) => acc * 60 + n, 0);
}

async function act(fn: () => Promise<unknown>, message: string) {
	try {
		await fn();
		return { message };
	} catch (err) {
		return fail(400, { message: (err as Error).message });
	}
}

export const actions = {
	positions: async ({ request, params }) => {
		const form = await request.formData();
		const ids = String(form.get('frames') ?? '')
			.split(',')
			.filter(Boolean)
			.map(Number);
		if (ids.some((n) => !Number.isInteger(n))) return fail(400, { message: 'bad frame list' });
		return act(() => setPositions(titleId(params), ids), 'Saved the six frames.');
	},
	settings: async ({ request, params }) => {
		const form = await request.formData();
		const enabled = form.get('enabled') === 'on';
		const mode = String(form.get('daily_mode'));
		if (!['auto', 'always', 'never'].includes(mode))
			return fail(400, { message: 'bad daily mode' });
		await query(
			'update titles set enabled = $2, daily_mode = $3, updated_at = now() where id = $1',
			[titleId(params), enabled, mode]
		);
		return { message: 'Settings saved.' };
	},
	review: async ({ params, locals, request }) => {
		const form = await request.formData();
		const on = form.get('reviewed') === 'true';
		await query(
			`update titles set reviewed = $2, reviewed_by = case when $2 then $3 else null end,
				reviewed_at = case when $2 then now() else null end where id = $1`,
			[titleId(params), on, locals.user!.email]
		);
		return { message: on ? 'Marked as reviewed.' : 'Review cleared.' };
	},
	autofill: async ({ params }) => act(() => autoFill(titleId(params)), 'Filled the empty slots.'),
	more: async ({ params }) =>
		act(() => addCandidates(titleId(params), 8), 'Added 8 more candidates.'),
	addAt: async ({ request, params }) => {
		const form = await request.formData();
		const ts = parseTime(String(form.get('time') ?? ''));
		if (ts == null) return fail(400, { message: 'Use h:mm:ss, mm:ss or seconds.' });
		return act(() => addFrameAt(titleId(params), ts), 'Frame added.');
	},
	deleteFrame: async ({ request }) => {
		const form = await request.formData();
		return act(() => deleteFrame(Number(form.get('frame'))), 'Frame deleted.');
	},
	reprocess: async ({ request, params, locals }) => {
		const form = await request.formData();
		const mode = form.get('mode') === 'reset' ? 'reset' : 'keep';
		log('admin_reprocess', { title: params.id, mode, by: locals.user?.email });
		return act(() => reprocess(titleId(params), mode), 'Queued for processing.');
	},
	tmdb: async ({ params }) => {
		if (!tmdbEnabled()) return fail(400, { message: 'TMDB_API_KEY is not set.' });
		return act(async () => {
			if (!(await refreshTmdb(titleId(params))))
				throw new Error('TMDB has no match for this movie.');
		}, 'TMDB details refreshed.');
	},
	schedule: async ({ request, params, locals }) => {
		const form = await request.formData();
		const date = String(form.get('date') ?? '');
		if (!isDate(date)) return fail(400, { message: 'Pick a date.' });
		return act(() => setDaily(date, titleId(params), locals.user!.email), `Scheduled for ${date}.`);
	}
};
