import { config, log } from './config';
import { query } from './db';

/**
 * TMDB supplies posters, a synopsis for the reveal, and popularity (vote count), which decides
 * whether a movie is well known enough to be a daily answer. Everything works without a key;
 * titles just have no poster and are all daily-eligible.
 */

const GENRES: Record<number, string> = {
	28: 'Action',
	12: 'Adventure',
	16: 'Animation',
	35: 'Comedy',
	80: 'Crime',
	99: 'Documentary',
	18: 'Drama',
	10751: 'Family',
	14: 'Fantasy',
	36: 'History',
	27: 'Horror',
	10402: 'Music',
	9648: 'Mystery',
	10749: 'Romance',
	878: 'Science Fiction',
	10770: 'TV Movie',
	53: 'Thriller',
	10752: 'War',
	37: 'Western'
};

export function posterUrl(path: string | null, size: 'w185' | 'w342' | 'w500' = 'w342') {
	return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function tmdbEnabled(): boolean {
	return Boolean(config.tmdb.key);
}

interface TmdbMovie {
	id: number;
	title: string;
	poster_path: string | null;
	overview: string;
	popularity: number;
	vote_count: number;
	vote_average: number;
	genre_ids: number[];
	release_date?: string;
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
	const key = config.tmdb.key;
	const url = new URL(`https://api.themoviedb.org/3${path}`);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	const headers: Record<string, string> = { accept: 'application/json' };
	// A v4 read access token is a JWT; a v3 key is 32 hex characters and goes in the query string.
	if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`;
	else url.searchParams.set('api_key', key);
	const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
	if (!res.ok) throw new Error(`TMDB ${path}: HTTP ${res.status}`);
	return (await res.json()) as T;
}

async function lookup(
	imdbId: string | null,
	title: string,
	year: number | null
): Promise<TmdbMovie | null> {
	if (imdbId) {
		const found = await get<{ movie_results: TmdbMovie[] }>(`/find/${imdbId}`, {
			external_source: 'imdb_id'
		});
		if (found.movie_results[0]) return found.movie_results[0];
	}
	const params: Record<string, string> = { query: title, include_adult: 'false' };
	if (year) params.year = String(year);
	const search = await get<{ results: TmdbMovie[] }>('/search/movie', params);
	return search.results[0] ?? null;
}

/** Fetches and stores TMDB details for one title. Returns false if TMDB had no match. */
export async function refreshTmdb(titleId: number): Promise<boolean> {
	if (!tmdbEnabled()) return false;
	const rows = await query<{ imdb_id: string | null; title: string; year: number | null }>(
		'select imdb_id, title, year from titles where id = $1',
		[titleId]
	);
	const t = rows[0];
	if (!t) return false;
	const m = await lookup(t.imdb_id, t.title, t.year);
	if (!m) {
		await query('update titles set tmdb_checked_at = now() where id = $1', [titleId]);
		return false;
	}
	const genres = m.genre_ids.map((g) => GENRES[g]).filter(Boolean);
	const autoDaily = m.vote_count >= config.tmdb.minVotes && !genres.includes('Documentary');
	await query(
		`update titles set tmdb_id = $2, tmdb_title = $3, poster_path = $4, overview = $5,
			popularity = $6, vote_count = $7, vote_average = $8, genres = $9, auto_daily = $10,
			tmdb_checked_at = now(), updated_at = now()
		 where id = $1`,
		[
			titleId,
			m.id,
			m.title,
			m.poster_path,
			m.overview || null,
			m.popularity,
			m.vote_count,
			m.vote_average,
			genres,
			autoDaily
		]
	);
	return true;
}

let backfilling = false;

/** Looks up every title TMDB hasn't been asked about yet. Safe to call repeatedly. */
export async function backfillTmdb() {
	if (!tmdbEnabled() || backfilling) return;
	backfilling = true;
	let done = 0;
	try {
		for (;;) {
			const batch = await query<{ id: number }>(
				'select id from titles where tmdb_checked_at is null order by id limit 50'
			);
			if (!batch.length) break;
			for (const { id } of batch) {
				try {
					await refreshTmdb(id);
				} catch (err) {
					log('tmdb_error', { title: id, error: (err as Error).message });
					// Mark it checked so one bad title can't stall the loop; an admin can retry it.
					await query('update titles set tmdb_checked_at = now() where id = $1', [id]);
				}
				done++;
				await new Promise((r) => setTimeout(r, 120));
			}
		}
	} finally {
		backfilling = false;
		if (done) log('tmdb_backfill', { titles: done });
	}
}
