import { one, query } from './db';
import { posterUrl } from './tmdb';

/** Read models for the admin pages. hooks.server.ts has already checked the user is an admin. */

export async function dashboard() {
	const counts = await query<{ status: string; n: number }>(
		`select status, count(*)::int as n from titles where kind = 'movie' and not missing group by status`
	);
	const totals = await one<{
		titles: number;
		missing: number;
		disabled: number;
		reviewed: number;
		daily_ok: number;
		tmdb_pending: number;
		users: number;
		subscribers: number;
		plays_today: number;
		frames: number;
	}>(
		`select
			(select count(*)::int from titles where kind = 'movie') as titles,
			(select count(*)::int from titles where missing) as missing,
			(select count(*)::int from titles where not enabled) as disabled,
			(select count(*)::int from titles where reviewed) as reviewed,
			(select count(*)::int from titles t where t.status = 'ready' and not t.missing and t.enabled
				and (t.daily_mode = 'always' or (t.daily_mode = 'auto' and t.auto_daily))) as daily_ok,
			(select count(*)::int from titles where tmdb_checked_at is null) as tmdb_pending,
			(select count(*)::int from users) as users,
			(select count(*)::int from users where email_daily) as subscribers,
			(select count(*)::int from plays where started_at > now() - interval '1 day') as plays_today,
			(select count(*)::int from frames) as frames`
	);
	const errors = await query<{
		id: number;
		title: string;
		year: number | null;
		error: string | null;
	}>(
		`select id, title, year, error from titles where status = 'error' and not missing
		 order by processed_at desc nulls last limit 20`
	);
	const recent = await query<{
		id: number;
		title: string;
		year: number | null;
		processed_at: string;
	}>(
		`select id, title, year, processed_at from titles where status = 'ready'
		 order by processed_at desc nulls last limit 10`
	);
	const emails = await query<{
		run_date: string;
		sent: number;
		failed: number;
		finished_at: string | null;
	}>('select run_date, sent, failed, finished_at from email_runs order by run_date desc limit 7');
	return {
		status: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number>,
		totals: totals!,
		errors,
		recent,
		emails
	};
}

export const TITLE_FILTERS = [
	'all',
	'ready',
	'unreviewed',
	'pending',
	'processing',
	'error',
	'daily',
	'not-daily',
	'disabled',
	'missing'
] as const;
export type TitleFilter = (typeof TITLE_FILTERS)[number];

const FILTER_SQL: Record<TitleFilter, string> = {
	all: 'not t.missing',
	ready: "t.status = 'ready' and not t.missing",
	unreviewed: "t.status = 'ready' and not t.reviewed and not t.missing",
	pending: "t.status = 'pending' and not t.missing",
	processing: "t.status = 'processing'",
	error: "t.status = 'error' and not t.missing",
	daily:
		"not t.missing and t.enabled and (t.daily_mode = 'always' or (t.daily_mode = 'auto' and t.auto_daily))",
	'not-daily':
		"not t.missing and (t.daily_mode = 'never' or (t.daily_mode = 'auto' and not t.auto_daily))",
	disabled: 'not t.enabled',
	missing: 't.missing'
};

export const TITLE_SORTS = ['title', 'year', 'votes', 'recent'] as const;
export type TitleSort = (typeof TITLE_SORTS)[number];
const SORT_SQL: Record<TitleSort, string> = {
	title: 'coalesce(t.tmdb_title, t.title)',
	year: 't.year desc nulls last, coalesce(t.tmdb_title, t.title)',
	votes: 't.vote_count desc nulls last',
	recent: 't.created_at desc, t.id desc'
};

export interface TitleListRow {
	id: number;
	title: string;
	year: number | null;
	status: string;
	error: string | null;
	missing: boolean;
	enabled: boolean;
	reviewed: boolean;
	dailyMode: string;
	dailyOk: boolean;
	votes: number | null;
	frame: string | null;
	poster: string | null;
	usedOn: string | null;
}

export async function listTitles(opts: {
	q: string;
	filter: TitleFilter;
	sort: TitleSort;
	page: number;
	perPage: number;
}): Promise<{ rows: TitleListRow[]; total: number }> {
	const params: unknown[] = [];
	let where = FILTER_SQL[opts.filter];
	if (opts.q) {
		params.push(`%${opts.q}%`);
		where += ` and (t.title ilike $${params.length} or t.tmdb_title ilike $${params.length} or t.imdb_id = $${params.length + 1})`;
		params.push(opts.q);
	}
	const total = await one<{ n: number }>(
		`select count(*)::int as n from titles t where t.kind = 'movie' and ${where}`,
		params
	);
	params.push(opts.perPage, (opts.page - 1) * opts.perPage);
	const rows = await query<{
		id: number;
		title: string;
		year: number | null;
		status: string;
		error: string | null;
		missing: boolean;
		enabled: boolean;
		reviewed: boolean;
		daily_mode: string;
		auto_daily: boolean;
		vote_count: number | null;
		token: string | null;
		poster_path: string | null;
		used_on: string | null;
	}>(
		`select t.id, coalesce(t.tmdb_title, t.title) as title, t.year, t.status, t.error, t.missing,
			t.enabled, t.reviewed, t.daily_mode, t.auto_daily, t.vote_count, t.poster_path,
			(select token from frames f where f.title_id = t.id and f.position = 1) as token,
			(select max(puzzle_date)::text from daily_puzzles d where d.title_id = t.id) as used_on
		 from titles t where t.kind = 'movie' and ${where}
		 order by ${SORT_SQL[opts.sort]}, t.id
		 limit $${params.length - 1} offset $${params.length}`,
		params
	);
	return {
		total: total?.n ?? 0,
		rows: rows.map((r) => ({
			id: r.id,
			title: r.title,
			year: r.year,
			status: r.status,
			error: r.error,
			missing: r.missing,
			enabled: r.enabled,
			reviewed: r.reviewed,
			dailyMode: r.daily_mode,
			dailyOk: r.daily_mode === 'always' || (r.daily_mode === 'auto' && r.auto_daily),
			votes: r.vote_count,
			frame: r.token ? `/f/${r.token}` : null,
			poster: posterUrl(r.poster_path, 'w185'),
			usedOn: r.used_on
		}))
	};
}

export interface AdminFrame {
	id: number;
	url: string;
	ts: number;
	width: number;
	height: number;
	brightness: number | null;
	contrast: number | null;
	entropy: number | null;
	score: number | null;
	rejected: boolean;
	position: number | null;
	source: string;
}

export async function titleDetail(id: number) {
	const t = await one<{
		id: number;
		folder: string;
		title: string;
		tmdb_title: string | null;
		year: number | null;
		imdb_id: string | null;
		tmdb_id: number | null;
		video_file: string | null;
		file_size: string | null;
		duration_s: number | null;
		width: number | null;
		height: number | null;
		hdr: boolean | null;
		crop: string | null;
		status: string;
		error: string | null;
		missing: boolean;
		enabled: boolean;
		daily_mode: string;
		auto_daily: boolean;
		reviewed: boolean;
		reviewed_by: string | null;
		reviewed_at: string | null;
		poster_path: string | null;
		overview: string | null;
		vote_count: number | null;
		vote_average: number | null;
		genres: string[];
		processed_at: string | null;
	}>('select * from titles where id = $1', [id]);
	if (!t) return null;
	const frames = await query<{
		id: number;
		token: string;
		ts: number;
		width: number;
		height: number;
		brightness: number | null;
		contrast: number | null;
		entropy: number | null;
		score: number | null;
		rejected: boolean;
		position: number | null;
		source: string;
	}>(
		`select id, token, ts, width, height, brightness, contrast, entropy, score, rejected, position, source
		 from frames where title_id = $1 order by ts`,
		[id]
	);
	const dailies = await query<{ puzzle_date: string; number: number }>(
		'select puzzle_date, number from daily_puzzles where title_id = $1 order by puzzle_date',
		[id]
	);
	const plays = await one<{ n: number; won: number }>(
		`select count(*)::int as n, count(*) filter (where status = 'won')::int as won
		 from plays where title_id = $1 and status <> 'playing'`,
		[id]
	);
	return {
		title: {
			...t,
			file_size: t.file_size ? Number(t.file_size) : null,
			poster: posterUrl(t.poster_path, 'w342')
		},
		frames: frames.map((f): AdminFrame => ({
			id: f.id,
			url: `/f/${f.token}`,
			ts: f.ts,
			width: f.width,
			height: f.height,
			brightness: f.brightness,
			contrast: f.contrast,
			entropy: f.entropy,
			score: f.score,
			rejected: f.rejected,
			position: f.position,
			source: f.source
		})),
		dailies,
		plays: plays ?? { n: 0, won: 0 }
	};
}

export async function listUsers() {
	return query<{
		id: number;
		email: string;
		is_admin: boolean;
		email_daily: boolean;
		created_at: string;
		last_login_at: string | null;
		daily_played: number;
		endless_played: number;
	}>(
		`select u.id, u.email, u.is_admin, u.email_daily, u.created_at, u.last_login_at,
			(select count(*)::int from plays p where p.user_id = u.id and p.mode = 'daily' and p.status <> 'playing') as daily_played,
			(select count(*)::int from plays p where p.user_id = u.id and p.mode = 'endless' and p.status <> 'playing') as endless_played
		 from users u order by u.created_at desc`
	);
}
