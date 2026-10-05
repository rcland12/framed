import type pg from 'pg';
import {
	FRAMES_PER_PUZZLE,
	type AnswerView,
	type CommunityView,
	type EndlessStats,
	type GuessView,
	type PlayView,
	type PlayerStats,
	type PlayStatus,
	type TitleOption
} from '$lib/types';
import { addDays, today } from './dates';
import { one, query, tx } from './db';
import { PLAYABLE, ensureDaily, getDaily, type Daily } from './puzzles';
import { posterUrl } from './tmdb';

/**
 * Game rules and state. The server holds every game: the browser only ever sees the frames it
 * has earned, and the answer once the game is over.
 */

export interface Player {
	userId: number | null;
	anonId: string;
}

interface PlayRow {
	id: string;
	mode: 'daily' | 'endless';
	puzzle_date: string | null;
	title_id: number;
	guesses: (number | null)[];
	status: PlayStatus;
}

/** Who owns a play: the account if signed in, otherwise this browser's anonymous id. */
function owner(p: Player, param: number): { sql: string; value: number | string } {
	return p.userId != null
		? { sql: `user_id = $${param}`, value: p.userId }
		: { sql: `anon_id = $${param} and user_id is null`, value: p.anonId };
}

// --- Titles for the guess box -----------------------------------------------------------------

let titleCache: { at: number; list: TitleOption[] } | null = null;

/**
 * Every title in the library, playable or not, so the list gives nothing away. One entry per
 * IMDb id: two copies of a film are one guess.
 */
export async function guessableTitles(): Promise<TitleOption[]> {
	if (titleCache && Date.now() - titleCache.at < 5 * 60_000) return titleCache.list;
	const rows = await query<{ id: number; title: string; year: number | null }>(
		`select distinct on (coalesce(imdb_id, id::text)) id, coalesce(tmdb_title, title) as title, year
		 from titles where kind = 'movie'
		 order by coalesce(imdb_id, id::text), missing, id`
	);
	const list = rows
		.map((r) => ({ id: r.id, title: r.title, year: r.year }))
		.sort((a, b) => a.title.localeCompare(b.title));
	titleCache = { at: Date.now(), list };
	return list;
}

// --- Views ------------------------------------------------------------------------------------

async function frameUrls(titleId: number, count: number): Promise<string[]> {
	const rows = await query<{ token: string }>(
		`select token from frames where title_id = $1 and position is not null
		 order by position limit $2`,
		[titleId, count]
	);
	return rows.map((r) => `/f/${r.token}`);
}

async function guessViews(guesses: (number | null)[], answerId: number): Promise<GuessView[]> {
	const ids = guesses.filter((g): g is number => g != null);
	const rows = ids.length
		? await query<{ id: number; label: string; imdb_id: string | null }>(
				`select id, coalesce(tmdb_title, title) || coalesce(' (' || year || ')', '') as label, imdb_id
				 from titles where id = any($1)`,
				[ids]
			)
		: [];
	const byId = new Map(rows.map((r) => [r.id, r]));
	return guesses.map((g) =>
		g == null
			? { titleId: null, label: null, correct: false }
			: { titleId: g, label: byId.get(g)?.label ?? '?', correct: g === answerId }
	);
}

async function answerView(titleId: number): Promise<AnswerView | null> {
	const t = await one<{
		id: number;
		title: string;
		year: number | null;
		poster_path: string | null;
		overview: string | null;
		imdb_id: string | null;
		tmdb_id: number | null;
	}>(
		`select id, coalesce(tmdb_title, title) as title, year, poster_path, overview, imdb_id, tmdb_id
		 from titles where id = $1`,
		[titleId]
	);
	if (!t) return null;
	return {
		id: t.id,
		title: t.title,
		year: t.year,
		posterUrl: posterUrl(t.poster_path),
		overview: t.overview,
		imdbId: t.imdb_id,
		tmdbId: t.tmdb_id
	};
}

export async function community(date: string): Promise<CommunityView> {
	const plays = await query<{ status: PlayStatus; n: number }>(
		`select status, jsonb_array_length(guesses) as n from plays
		 where mode = 'daily' and puzzle_date = $1 and status <> 'playing'`,
		[date]
	);
	const distribution = new Array(FRAMES_PER_PUZZLE + 1).fill(0);
	for (const p of plays) {
		distribution[p.status === 'won' ? Math.min(p.n, FRAMES_PER_PUZZLE) - 1 : FRAMES_PER_PUZZLE]++;
	}
	const wins = plays.filter((p) => p.status === 'won').length;
	const top = await query<{ label: string; count: number; correct: boolean }>(
		`select coalesce(t.tmdb_title, t.title) || coalesce(' (' || t.year || ')', '') as label,
			count(*)::int as count, bool_or(g.id = p.title_id) as correct
		 from plays p
		 cross join lateral (select (e #>> '{}')::int as id
			from jsonb_array_elements(p.guesses) e where e <> 'null'::jsonb) g
		 join titles t on t.id = g.id
		 where p.mode = 'daily' and p.puzzle_date = $1 and p.status <> 'playing'
		 group by t.id order by count desc, label limit 8`,
		[date]
	);
	return {
		players: plays.length,
		winRate: plays.length ? wins / plays.length : 0,
		distribution,
		topGuesses: top
	};
}

async function buildView(play: PlayRow, daily: Daily | null): Promise<PlayView> {
	const over = play.status !== 'playing';
	const revealed = over ? FRAMES_PER_PUZZLE : Math.min(play.guesses.length + 1, FRAMES_PER_PUZZLE);
	return {
		id: play.id,
		mode: play.mode,
		puzzleNumber: daily?.number ?? null,
		puzzleDate: play.puzzle_date,
		frames: await frameUrls(play.title_id, revealed),
		guesses: await guessViews(play.guesses, play.title_id),
		status: play.status,
		answer: over ? await answerView(play.title_id) : null,
		community:
			over && play.mode === 'daily' && play.puzzle_date ? await community(play.puzzle_date) : null
	};
}

// --- Daily ------------------------------------------------------------------------------------

async function findDailyPlay(p: Player, date: string): Promise<PlayRow | null> {
	const o = owner(p, 2);
	return one<PlayRow>(
		`select id, mode, puzzle_date, title_id, guesses, status from plays
		 where mode = 'daily' and puzzle_date = $1 and ${o.sql}`,
		[date, o.value]
	);
}

/**
 * The player's view of a day's puzzle. Nothing is written until the first guess, so a page view
 * (or a crawler) doesn't count as a player.
 */
export async function dailyView(p: Player, date = today()): Promise<PlayView | null> {
	const daily = date === today() ? await ensureDaily(date) : await getDaily(date);
	if (!daily) return null;
	const play = await findDailyPlay(p, date);
	if (play) return buildView(play, daily);
	return buildView(
		{
			id: '',
			mode: 'daily',
			puzzle_date: date,
			title_id: daily.titleId,
			guesses: [],
			status: 'playing'
		},
		daily
	);
}

export class GameError extends Error {}

async function applyGuess(c: pg.PoolClient, play: PlayRow, guess: number | null): Promise<PlayRow> {
	if (play.status !== 'playing') throw new GameError('this game is over');
	if (guess != null) {
		const t = await c.query<{ id: number; imdb_id: string | null }>(
			`select id, imdb_id from titles where id = $1 and kind = 'movie'`,
			[guess]
		);
		if (!t.rows[0]) throw new GameError('unknown title');
		if (play.guesses.includes(guess)) throw new GameError('already guessed');
	}
	const answer = await c.query<{ imdb_id: string | null }>(
		'select imdb_id from titles where id = $1',
		[play.title_id]
	);
	let correct = guess === play.title_id;
	if (!correct && guess != null && answer.rows[0]?.imdb_id) {
		// A second copy of the same film (same IMDb id) is the same answer.
		const same = await c.query('select 1 from titles where id = $1 and imdb_id = $2', [
			guess,
			answer.rows[0].imdb_id
		]);
		correct = Boolean(same.rowCount);
	}
	// Stored as the answer's id when correct, so views and stats need no IMDb matching.
	const guesses = [...play.guesses, correct ? play.title_id : guess];
	const status: PlayStatus = correct
		? 'won'
		: guesses.length >= FRAMES_PER_PUZZLE
			? 'lost'
			: 'playing';
	await c.query(
		`update plays set guesses = $2, status = $3,
			finished_at = case when $3 <> 'playing' then now() else null end
		 where id = $1`,
		[play.id, JSON.stringify(guesses), status]
	);
	return { ...play, guesses, status };
}

export async function guessDaily(p: Player, date: string, guess: number | null): Promise<PlayView> {
	// The page may have been open across midnight: yesterday's puzzle can still be finished.
	const now = today();
	if (date !== now && date !== addDays(now, -1)) throw new GameError('that puzzle is closed');
	const daily = await getDaily(date);
	if (!daily) throw new GameError('no puzzle for that day');
	const play = await tx(async (c) => {
		const o = owner(p, 2);
		const conflict =
			p.userId != null
				? "(puzzle_date, user_id) where mode = 'daily' and user_id is not null"
				: "(puzzle_date, anon_id) where mode = 'daily' and user_id is null";
		await c.query(
			`insert into plays (mode, puzzle_date, title_id, user_id, anon_id)
			 values ('daily', $1, $2, $3, $4) on conflict ${conflict} do nothing`,
			[date, daily.titleId, p.userId, p.anonId]
		);
		const { rows } = await c.query<PlayRow>(
			`select id, mode, puzzle_date, title_id, guesses, status from plays
			 where mode = 'daily' and puzzle_date = $1 and ${o.sql} for update`,
			[date, o.value]
		);
		return applyGuess(c, rows[0], guess);
	});
	return buildView(play, daily);
}

// --- Endless ----------------------------------------------------------------------------------

/** Endless opens once today's daily is finished (or if there is no daily today). */
export async function endlessUnlocked(p: Player): Promise<boolean> {
	const date = today();
	if (!(await getDaily(date))) return true;
	const play = await findDailyPlay(p, date);
	return play != null && play.status !== 'playing';
}

async function latestEndless(p: Player): Promise<PlayRow | null> {
	const o = owner(p, 1);
	return one<PlayRow>(
		`select id, mode, puzzle_date, title_id, guesses, status from plays
		 where mode = 'endless' and ${o.sql} order by started_at desc limit 1`,
		[o.value]
	);
}

/** The game in progress, or the one just finished (to show its result), or null. */
export async function endlessView(p: Player): Promise<PlayView | null> {
	const play = await latestEndless(p);
	return play ? buildView(play, null) : null;
}

/** Starts the next endless game, unless one is still in progress. */
export async function nextEndless(p: Player): Promise<PlayView> {
	const current = await latestEndless(p);
	if (current?.status === 'playing') return buildView(current, null);
	const o = owner(p, 2);
	// Never a scheduled daily (that would spoil one), and preferably nothing this player has seen.
	const base = `select t.id from titles t where ${PLAYABLE}
		and not exists (select 1 from daily_puzzles d where d.title_id = t.id and d.puzzle_date >= $1)`;
	let pick = await one<{ id: number }>(
		`${base} and not exists (select 1 from plays p where p.title_id = t.id and p.${o.sql})
		 order by random() limit 1`,
		[today(), o.value]
	);
	if (!pick) pick = await one<{ id: number }>(`${base} order by random() limit 1`, [today()]);
	if (!pick) throw new GameError('no movies are ready yet');
	const play = await one<PlayRow>(
		`insert into plays (mode, title_id, user_id, anon_id) values ('endless', $1, $2, $3)
		 returning id, mode, puzzle_date, title_id, guesses, status`,
		[pick.id, p.userId, p.anonId]
	);
	return buildView(play!, null);
}

export async function guessEndless(
	p: Player,
	playId: string,
	guess: number | null
): Promise<PlayView> {
	if (!/^[0-9a-f-]{36}$/.test(playId)) throw new GameError('unknown game');
	const play = await tx(async (c) => {
		const o = owner(p, 2);
		const { rows } = await c.query<PlayRow>(
			`select id, mode, puzzle_date, title_id, guesses, status from plays
			 where id = $1 and mode = 'endless' and ${o.sql} for update`,
			[playId, o.value]
		);
		if (!rows[0]) throw new GameError('unknown game');
		return applyGuess(c, rows[0], guess);
	});
	return buildView(play, null);
}

// --- Stats ------------------------------------------------------------------------------------

export async function dailyStats(p: Player): Promise<PlayerStats> {
	const o = owner(p, 1);
	const rows = await query<{ puzzle_date: string; status: PlayStatus; n: number }>(
		`select puzzle_date, status, jsonb_array_length(guesses) as n from plays
		 where mode = 'daily' and status <> 'playing' and ${o.sql} order by puzzle_date`,
		[o.value]
	);
	const distribution = new Array(FRAMES_PER_PUZZLE + 1).fill(0);
	let maxStreak = 0;
	let run = 0;
	let prev: string | null = null;
	for (const r of rows) {
		distribution[r.status === 'won' ? Math.min(r.n, FRAMES_PER_PUZZLE) - 1 : FRAMES_PER_PUZZLE]++;
		if (r.status === 'won') {
			run = prev && addDays(prev, 1) === r.puzzle_date ? run + 1 : 1;
			maxStreak = Math.max(maxStreak, run);
		} else {
			run = 0;
		}
		prev = r.status === 'won' ? r.puzzle_date : null;
	}
	// A streak survives until a day is missed: it still counts if the last win was yesterday.
	const last = rows.at(-1);
	const now = today();
	const live =
		last?.status === 'won' && (last.puzzle_date === now || last.puzzle_date === addDays(now, -1));
	return {
		played: rows.length,
		won: rows.filter((r) => r.status === 'won').length,
		currentStreak: live ? run : 0,
		maxStreak,
		distribution
	};
}

export async function endlessStats(p: Player): Promise<EndlessStats> {
	const o = owner(p, 1);
	const rows = await query<{ status: PlayStatus }>(
		`select status from plays where mode = 'endless' and status <> 'playing' and ${o.sql}
		 order by finished_at`,
		[o.value]
	);
	let run = 0;
	let maxStreak = 0;
	for (const r of rows) {
		run = r.status === 'won' ? run + 1 : 0;
		maxStreak = Math.max(maxStreak, run);
	}
	return {
		played: rows.length,
		won: rows.filter((r) => r.status === 'won').length,
		currentStreak: run,
		maxStreak
	};
}
