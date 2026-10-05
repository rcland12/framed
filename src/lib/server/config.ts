import { env } from '$env/dynamic/private';
import path from 'node:path';

/**
 * Every setting comes from the environment (an env file in production, .env in dev).
 * Read lazily, so a missing value fails the code that needs it rather than the whole server.
 */
export const config = {
	/** Public base URL, used in emails. */
	get origin(): string {
		return (env.ORIGIN || 'http://localhost:5175').replace(/\/$/, '');
	},
	/** Host names the app answers to, e.g. framed.example.com. Empty allows any. */
	get allowedHosts(): string[] {
		return (env.FRAMED_ALLOWED_HOSTS || '')
			.split(',')
			.map((h) => h.trim().toLowerCase())
			.filter(Boolean);
	},
	/** The day rolls over at midnight here, and the daily email goes out in this zone. */
	get timeZone(): string {
		return env.FRAMED_TIMEZONE || 'America/New_York';
	},
	/** Movie library root: one folder per movie, "Title (Year) {imdb-tt…}". Mounted read-only. */
	get moviesDir(): string {
		return path.resolve(env.FRAMED_MOVIES_DIR || '/media/Movies');
	},
	/** Where extracted frames are written. Must survive container rebuilds. */
	get framesDir(): string {
		return path.resolve(env.FRAMED_FRAMES_DIR || '/data/frames');
	},
	/** How many movies are processed at once. Each run of ffmpeg decodes one 4K frame at a time. */
	get ingestConcurrency(): number {
		return Math.min(4, Math.max(1, Number(env.FRAMED_INGEST_CONCURRENCY) || 1));
	},
	/** Candidate frames pulled per movie, from which six are chosen. */
	get candidatesPerTitle(): number {
		return Math.min(40, Math.max(8, Number(env.FRAMED_CANDIDATES) || 16));
	},
	/** Library rescan for new or removed movies. 0 turns the automatic scan off. */
	get scanMinutes(): number {
		const raw = env.FRAMED_SCAN_MINUTES;
		if (raw === undefined || raw === '') return 60;
		return Math.max(0, Number(raw) || 0);
	},
	/** Turns the background ingest worker off, e.g. on a dev machine sharing the database. */
	get ingestEnabled(): boolean {
		return env.FRAMED_INGEST !== 'off';
	},
	get emailEnabled(): boolean {
		return env.FRAMED_EMAIL !== 'off';
	},
	/** Local hour (in timeZone) the daily email goes out. */
	get dailyEmailHour(): number {
		return Math.min(23, Math.max(0, Number(env.FRAMED_EMAIL_HOUR ?? 7) || 0));
	},
	/** Emails here become admins when they sign in. */
	get adminEmails(): string[] {
		return (env.FRAMED_ADMIN_EMAILS || '')
			.split(',')
			.map((e) => e.trim().toLowerCase())
			.filter(Boolean);
	},
	get smtp() {
		return {
			host: env.SMTP_HOST || 'localhost',
			port: Number(env.SMTP_PORT) || 25,
			from: env.EMAIL_FROM || 'Framed 2.0 <framed@localhost>'
		};
	},
	get tmdb() {
		return {
			/** v3 API key, or the v4 read access token (a JWT); either works. */
			key: env.TMDB_API_KEY || '',
			/** Movies with fewer TMDB votes than this are guessable but never the daily answer. */
			minVotes: Number(env.FRAMED_DAILY_MIN_VOTES ?? 500) || 0
		};
	},
	get postgres() {
		return {
			host: env.POSTGRES_HOST || 'postgres',
			port: Number(env.POSTGRES_PORT) || 5432,
			database: env.POSTGRES_DB || 'framed',
			user: env.POSTGRES_USER || 'framed',
			password: env.POSTGRES_PASSWORD || ''
		};
	},
	get secureCookies(): boolean {
		return this.origin.startsWith('https://');
	}
};

export function log(event: string, fields: Record<string, unknown> = {}) {
	// One JSON line per event, so container logs are easy to filter.
	console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}
