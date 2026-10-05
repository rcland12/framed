import { log } from './config';
import { addDays, today } from './dates';
import { one, query, tx } from './db';

/**
 * The daily schedule. A date gets its movie the first time anyone asks for it (or when the
 * scheduler fills the next fortnight), and keeps it. A movie is never the daily answer twice.
 */

/** A title that can be played: six frames chosen, still in the library, not switched off. */
export const PLAYABLE = `t.kind = 'movie' and t.status = 'ready' and not t.missing and t.enabled`;
/** …and well known enough to be everyone's puzzle of the day. */
export const DAILY_OK = `${PLAYABLE} and (t.daily_mode = 'always' or (t.daily_mode = 'auto' and t.auto_daily))`;

/** Daily-eligible movies needed before future days are scheduled in advance. */
const MIN_POOL_TO_SCHEDULE = 100;

export interface Daily {
	date: string;
	number: number;
	titleId: number;
}

/** Puzzle numbers count days from the first puzzle, so #1 is launch day. */
const NUMBER_SQL = `(select coalesce(($1::date - min(puzzle_date)) + 1, 1) from daily_puzzles)`;

export async function getDaily(date: string): Promise<Daily | null> {
	const row = await one<{ puzzle_date: string; number: number; title_id: number }>(
		'select puzzle_date, number, title_id from daily_puzzles where puzzle_date = $1',
		[date]
	);
	return row ? { date: row.puzzle_date, number: row.number, titleId: row.title_id } : null;
}

/** The puzzle for date, choosing one if nobody has asked yet. null if nothing is playable. */
export async function ensureDaily(date: string): Promise<Daily | null> {
	const existing = await getDaily(date);
	if (existing) return existing;
	return tx(async (c) => {
		await c.query("select pg_advisory_xact_lock(hashtext('framed:daily'))");
		const again = await c.query<{ number: number; title_id: number }>(
			'select number, title_id from daily_puzzles where puzzle_date = $1',
			[date]
		);
		if (again.rows[0])
			return { date, number: again.rows[0].number, titleId: again.rows[0].title_id };

		// Well-known films first; if they've all been used, anything playable that hasn't.
		let pick = await c.query<{ id: number }>(
			`select t.id from titles t where ${DAILY_OK}
			 and not exists (select 1 from daily_puzzles d where d.title_id = t.id)
			 order by random() limit 1`
		);
		if (!pick.rows[0]) {
			pick = await c.query<{ id: number }>(
				`select t.id from titles t where ${PLAYABLE}
				 and not exists (select 1 from daily_puzzles d where d.title_id = t.id)
				 order by random() limit 1`
			);
		}
		const titleId = pick.rows[0]?.id;
		if (!titleId) return null;
		const ins = await c.query<{ number: number }>(
			`insert into daily_puzzles (puzzle_date, number, title_id, set_by)
			 values ($1, ${NUMBER_SQL}, $2, 'auto') returning number`,
			[date, titleId]
		);
		log('daily_chosen', { date, title: titleId });
		return { date, number: ins.rows[0].number, titleId };
	});
}

/** Keeps the next `days` days scheduled, so admins can see and change what's coming. */
export async function scheduleAhead(days = 14) {
	const start = today();
	// A future day picked automatically whose movie no longer qualifies (TMDB found it obscure, an
	// admin switched it off, it left the NAS) gets picked again. Admin choices are left alone.
	const dropped = await query<{ puzzle_date: string }>(
		`delete from daily_puzzles d using titles t
		 where t.id = d.title_id and d.puzzle_date > $1 and d.set_by = 'auto' and not (${DAILY_OK})
		 returning d.puzzle_date`,
		[start]
	);
	if (dropped.length) log('daily_rerolled', { dates: dropped.map((d) => d.puzzle_date) });
	// While the first ingest is still running, don't lock in a fortnight of whatever happened to be
	// processed first: schedule only today until there's a real pool to choose from.
	const pool = await one<{ n: number }>(`select count(*)::int as n from titles t where ${DAILY_OK}`);
	if ((pool?.n ?? 0) < MIN_POOL_TO_SCHEDULE) days = 1;
	for (let i = 0; i < days; i++) {
		if (!(await ensureDaily(addDays(start, i)))) break;
	}
}

/** Admin: puts a title on a future date (replacing whatever was there). */
export async function setDaily(date: string, titleId: number, by: string) {
	if (date <= today()) throw new Error('only future dates can be changed');
	await tx(async (c) => {
		await c.query("select pg_advisory_xact_lock(hashtext('framed:daily'))");
		const used = await c.query<{ puzzle_date: string }>(
			'select puzzle_date from daily_puzzles where title_id = $1 and puzzle_date <> $2',
			[titleId, date]
		);
		if (used.rows[0]) throw new Error(`already the puzzle on ${used.rows[0].puzzle_date}`);
		const r = await c.query(
			'update daily_puzzles set title_id = $2, set_by = $3 where puzzle_date = $1',
			[date, titleId, by]
		);
		if (!r.rowCount) {
			await c.query(
				`insert into daily_puzzles (puzzle_date, number, title_id, set_by)
				 values ($1, ${NUMBER_SQL}, $2, $3)`,
				[date, titleId, by]
			);
		}
	});
	log('daily_set', { date, title: titleId, by });
}

/** Admin: clears a future date; it will be chosen again automatically. */
export async function clearDaily(date: string) {
	if (date <= today()) throw new Error('only future dates can be changed');
	await query('delete from daily_puzzles where puzzle_date = $1', [date]);
}

export interface ScheduleRow {
	date: string;
	number: number;
	titleId: number;
	title: string;
	year: number | null;
	setBy: string | null;
	players: number;
	wins: number;
}

export async function listSchedule(from: string, to: string): Promise<ScheduleRow[]> {
	const rows = await query<{
		puzzle_date: string;
		number: number;
		title_id: number;
		title: string;
		year: number | null;
		set_by: string | null;
		players: number;
		wins: number;
	}>(
		`select d.puzzle_date, d.number, d.title_id, coalesce(t.tmdb_title, t.title) as title, t.year,
			d.set_by,
			(select count(*)::int from plays p where p.mode = 'daily' and p.puzzle_date = d.puzzle_date and p.status <> 'playing') as players,
			(select count(*)::int from plays p where p.mode = 'daily' and p.puzzle_date = d.puzzle_date and p.status = 'won') as wins
		 from daily_puzzles d join titles t on t.id = d.title_id
		 where d.puzzle_date between $1 and $2 order by d.puzzle_date desc`,
		[from, to]
	);
	return rows.map((r) => ({
		date: r.puzzle_date,
		number: r.number,
		titleId: r.title_id,
		title: r.title,
		year: r.year,
		setBy: r.set_by,
		players: r.players,
		wins: r.wins
	}));
}
