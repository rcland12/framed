import pg from 'pg';
import { config, log } from './config';

/**
 * Framed's own database (`framed`, owned by the `framed` role) in Postgres.
 *
 * Migrations run in order on first use and are recorded in schema_version. Only ever append.
 */
const MIGRATIONS: string[] = [
	`
	-- Everything in the library that can be guessed. kind = 'show' is reserved for TV mode.
	create table titles (
		id               serial primary key,
		kind             text not null default 'movie' check (kind in ('movie', 'show')),
		-- The library folder name, relative to the library root. A rename is a new title.
		folder           text not null,
		title            text not null,
		year             integer,
		imdb_id          text,
		-- Relative to the folder.
		video_file       text,
		file_size        bigint,
		file_mtime       double precision,
		duration_s       double precision,
		width            integer,
		height           integer,
		hdr              boolean,
		-- ffmpeg crop=w:h:x:y that removes letterbox bars, from cropdetect.
		crop             text,
		status           text not null default 'pending'
		                 check (status in ('pending', 'processing', 'ready', 'error')),
		error            text,
		processed_at     timestamptz,
		-- The folder is gone from the library. Kept for past puzzles; never chosen again.
		missing          boolean not null default false,
		-- Admin switch: false keeps it guessable but never the answer.
		enabled          boolean not null default true,
		-- auto: the answer to a daily only if TMDB says it is well known (see auto_daily).
		daily_mode       text not null default 'auto' check (daily_mode in ('auto', 'always', 'never')),
		auto_daily       boolean not null default true,
		reviewed         boolean not null default false,
		reviewed_by      text,
		reviewed_at      timestamptz,
		tmdb_id          integer,
		tmdb_checked_at  timestamptz,
		tmdb_title       text,
		poster_path      text,
		overview         text,
		popularity       real,
		vote_count       integer,
		vote_average     real,
		genres           text[] not null default '{}',
		created_at       timestamptz not null default now(),
		updated_at       timestamptz not null default now(),
		unique (kind, folder)
	);
	create index titles_status on titles (status);
	create index titles_imdb on titles (imdb_id);

	-- Candidate frames for a title. position 1..6 marks the six that are played, in order.
	create table frames (
		id          bigserial primary key,
		title_id    integer not null references titles (id) on delete cascade,
		-- Random and unguessable: the only name a frame has in a public URL.
		token       text not null unique,
		-- Relative to the frames directory.
		file        text not null,
		ts          double precision not null,
		width       integer not null,
		height      integer not null,
		brightness  real,
		contrast    real,
		entropy     real,
		sharpness   real,
		score       real,
		-- Failed the automatic checks (black, washed out, blurry). Still shown to admins.
		rejected    boolean not null default false,
		position    smallint check (position between 1 and 6),
		source      text not null default 'auto' check (source in ('auto', 'manual')),
		created_at  timestamptz not null default now(),
		constraint frames_position unique (title_id, position) deferrable initially deferred
	);
	create index frames_title on frames (title_id);

	create table users (
		id                 serial primary key,
		email              text not null unique,
		display_name       text,
		is_admin           boolean not null default false,
		email_daily        boolean not null default true,
		unsubscribe_token  text not null unique,
		created_at         timestamptz not null default now(),
		last_login_at      timestamptz
	);

	-- Sign-in links. Only the SHA-256 of the token is stored.
	create table login_tokens (
		token_hash   text primary key,
		email        text not null,
		wants_daily  boolean not null default true,
		redirect     text,
		ip           text,
		created_at   timestamptz not null default now(),
		expires_at   timestamptz not null,
		used_at      timestamptz
	);
	create index login_tokens_email on login_tokens (email, created_at);
	create index login_tokens_ip on login_tokens (ip, created_at);

	create table sessions (
		id_hash       text primary key,
		user_id       integer not null references users (id) on delete cascade,
		created_at    timestamptz not null default now(),
		expires_at    timestamptz not null,
		last_seen_at  timestamptz not null default now()
	);
	create index sessions_user on sessions (user_id);

	create table daily_puzzles (
		puzzle_date  date primary key,
		number       integer not null unique,
		title_id     integer not null references titles (id),
		set_by       text,
		created_at   timestamptz not null default now()
	);
	create index daily_puzzles_title on daily_puzzles (title_id);

	create table plays (
		id           uuid primary key default gen_random_uuid(),
		mode         text not null check (mode in ('daily', 'endless')),
		puzzle_date  date,
		title_id     integer not null references titles (id),
		user_id      integer references users (id) on delete cascade,
		anon_id      uuid,
		-- Title ids in order; null is a skip.
		guesses      jsonb not null default '[]',
		status       text not null default 'playing' check (status in ('playing', 'won', 'lost')),
		started_at   timestamptz not null default now(),
		finished_at  timestamptz,
		check (user_id is not null or anon_id is not null),
		check ((mode = 'daily') = (puzzle_date is not null))
	);
	create unique index plays_daily_user on plays (puzzle_date, user_id)
		where mode = 'daily' and user_id is not null;
	create unique index plays_daily_anon on plays (puzzle_date, anon_id)
		where mode = 'daily' and user_id is null;
	create index plays_user on plays (user_id, mode, started_at);
	create index plays_anon on plays (anon_id, mode, started_at);
	create index plays_date on plays (puzzle_date) where mode = 'daily';

	-- One row per day the morning email went out; the insert is the lock that sends it once.
	create table email_runs (
		run_date     date primary key,
		started_at   timestamptz not null default now(),
		finished_at  timestamptz,
		sent         integer not null default 0,
		failed       integer not null default 0
	);
	`
];

let pool: pg.Pool | null = null;
let schema: Promise<void> | null = null;

// Postgres "date" comes back as a JS Date at local midnight by default. Keep it as YYYY-MM-DD.
pg.types.setTypeParser(1082, (v) => v);

function getPool(): pg.Pool {
	if (!pool) {
		pool = new pg.Pool({ ...config.postgres, max: 10, idleTimeoutMillis: 30_000 });
		pool.on('error', (err) => log('db_pool_error', { error: err.message }));
	}
	return pool;
}

async function migrate(p: pg.Pool) {
	const client = await p.connect();
	try {
		await client.query('begin');
		// Serialise concurrent boots; the lock is released at commit.
		await client.query("select pg_advisory_xact_lock(hashtext('framed:migrate'))");
		await client.query('create table if not exists schema_version (version integer not null)');
		const { rows } = await client.query<{ v: number | null }>(
			'select max(version) as v from schema_version'
		);
		const current = rows[0]?.v ?? 0;
		for (let i = current; i < MIGRATIONS.length; i++) {
			await client.query(MIGRATIONS[i]);
			await client.query('insert into schema_version (version) values ($1)', [i + 1]);
			log('db_migrated', { version: i + 1 });
		}
		await client.query('commit');
	} catch (err) {
		await client.query('rollback').catch(() => {});
		throw err;
	} finally {
		client.release();
	}
}

async function ready(): Promise<pg.Pool> {
	const p = getPool();
	if (!schema) {
		schema = migrate(p).catch((err) => {
			schema = null;
			throw err;
		});
	}
	await schema;
	return p;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
	sql: string,
	params: unknown[] = []
): Promise<T[]> {
	const p = await ready();
	const { rows } = await p.query<T>(sql, params);
	return rows;
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
	sql: string,
	params: unknown[] = []
): Promise<T | null> {
	const rows = await query<T>(sql, params);
	return rows[0] ?? null;
}

/** Runs fn in a transaction, committing if it resolves and rolling back if it throws. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
	const p = await ready();
	const client = await p.connect();
	try {
		await client.query('begin');
		const result = await fn(client);
		await client.query('commit');
		return result;
	} catch (err) {
		await client.query('rollback').catch(() => {});
		throw err;
	} finally {
		client.release();
	}
}
