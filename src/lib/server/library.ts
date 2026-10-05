import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FRAMES_PER_PUZZLE } from '$lib/types';
import { config, log } from './config';
import { newToken } from './auth';
import { one, query, tx } from './db';
import { analyse, detectCrop, extractFrame, probe, toWebp, type Probe } from './media';
import { refreshTmdb, tmdbEnabled } from './tmdb';

/**
 * The movie library on the NAS → titles and candidate frames.
 *
 * scanLibrary() finds new, changed and removed folders. A background worker then takes each
 * pending title, pulls candidate frames across the runtime, and fills the six played positions
 * from the best of them. Admins can reorder, swap, add frames at a timestamp, or reprocess.
 */

const VIDEO_EXT = new Set(['.mkv', '.mp4', '.avi', '.m4v', '.mov']);
/** Plex/Radarr naming: "Title (Year) {imdb-tt0114746}". */
const FOLDER_RE = /^(.*?)\s*\((\d{4})\)\s*(?:\{imdb-(tt\d+)\})?\s*$/;

/** Opening logos/credits and end credits are never sampled. */
const START_FRAC = 0.08;
const END_FRAC = 0.9;

export function parseFolder(name: string): {
	title: string;
	year: number | null;
	imdbId: string | null;
} {
	const m = FOLDER_RE.exec(name);
	if (!m) return { title: name.trim(), year: null, imdbId: null };
	return { title: m[1].trim(), year: Number(m[2]), imdbId: m[3] ?? null };
}

async function findVideo(
	dir: string
): Promise<{ file: string; size: number; mtime: number } | null> {
	let best: { file: string; size: number; mtime: number } | null = null;
	for (const e of await readdir(dir, { withFileTypes: true })) {
		if (!e.isFile() || !VIDEO_EXT.has(path.extname(e.name).toLowerCase())) continue;
		if (/\bsample\b/i.test(e.name)) continue;
		const s = await stat(path.join(dir, e.name));
		// More than one video (a split release, a stray extra): the largest is the film.
		if (!best || s.size > best.size) best = { file: e.name, size: s.size, mtime: s.mtimeMs / 1000 };
	}
	return best;
}

// --- Status, for the admin dashboard --------------------------------------------------------

export interface ScanResult {
	at: string;
	folders: number;
	added: number;
	changed: number;
	missing: number;
	error?: string;
}

const state = {
	lastScan: null as ScanResult | null,
	scanning: false,
	active: new Map<number, { title: string; step: string; since: number }>(),
	workers: 0
};

export function ingestStatus() {
	return {
		lastScan: state.lastScan,
		scanning: state.scanning,
		workers: state.workers,
		active: [...state.active.entries()].map(([id, a]) => ({ id, ...a }))
	};
}

// --- Scanning ---------------------------------------------------------------------------------

export async function scanLibrary(): Promise<ScanResult> {
	if (state.scanning)
		return (
			state.lastScan ?? {
				at: new Date().toISOString(),
				folders: 0,
				added: 0,
				changed: 0,
				missing: 0
			}
		);
	state.scanning = true;
	const result: ScanResult = {
		at: new Date().toISOString(),
		folders: 0,
		added: 0,
		changed: 0,
		missing: 0
	};
	try {
		const root = config.moviesDir;
		const entries = await readdir(root, { withFileTypes: true });
		const folders: string[] = [];
		for (const e of entries) {
			if (!e.isDirectory() || e.name.startsWith('.')) continue;
			const video = await findVideo(path.join(root, e.name)).catch(() => null);
			if (!video) continue;
			folders.push(e.name);
			const { title, year, imdbId } = parseFolder(e.name);
			const row = await one<{ inserted: boolean; changed: boolean }>(
				`insert into titles (kind, folder, title, year, imdb_id, video_file, file_size, file_mtime)
				 values ('movie', $1, $2, $3, $4, $5, $6, $7)
				 on conflict (kind, folder) do update set
					video_file = excluded.video_file,
					file_size = excluded.file_size,
					file_mtime = excluded.file_mtime,
					missing = false,
					-- A replaced file (an upgrade, a repair) gets another try if it had failed.
					status = case when titles.status = 'error' then 'pending' else titles.status end,
					updated_at = now()
				 -- Unchanged folders are left alone (and return no row).
				 where titles.file_size is distinct from excluded.file_size
					or titles.video_file is distinct from excluded.video_file
					or titles.missing
				 returning (xmax = 0) as inserted, (xmax <> 0) as changed`,
				[e.name, title, year, imdbId, video.file, video.size, video.mtime]
			);
			if (row?.inserted) result.added++;
			else if (row?.changed) result.changed++;
		}
		result.folders = folders.length;

		// An unmounted or half-mounted NAS looks like a library that lost its films. Only mark
		// titles missing when the scan saw most of what the database already knows about.
		const known = await one<{ n: number }>(
			`select count(*)::int as n from titles where kind = 'movie' and not missing`
		);
		if (folders.length === 0 || folders.length < (known?.n ?? 0) * 0.8) {
			result.error = `saw ${folders.length} folders but ${known?.n} are known; not marking any missing`;
			log('scan_suspicious', { ...result });
		} else {
			const gone = await query(
				`update titles set missing = true, updated_at = now()
				 where kind = 'movie' and not missing and not (folder = any($1)) returning id`,
				[folders]
			);
			result.missing = gone.length;
		}
		log('scan', { ...result });
	} catch (err) {
		result.error = (err as Error).message;
		log('scan_error', { error: result.error });
	} finally {
		state.scanning = false;
		state.lastScan = result;
	}
	if (result.added || result.changed) kickWorkers();
	return result;
}

// --- Frames on disk ---------------------------------------------------------------------------

export function framePath(file: string): string {
	return path.join(config.framesDir, file);
}

async function deleteFrameFiles(files: string[]) {
	for (const f of files) await rm(framePath(f), { force: true }).catch(() => {});
}

interface TitleRow {
	id: number;
	title: string;
	folder: string;
	video_file: string | null;
	duration_s: number | null;
	width: number | null;
	height: number | null;
	hdr: boolean | null;
	crop: string | null;
}

function videoPath(t: TitleRow): string {
	if (!t.video_file) throw new Error('no video file');
	return path.join(config.moviesDir, t.folder, t.video_file);
}

async function probeTitle(t: TitleRow): Promise<{ probe: Probe; crop: string | null }> {
	const file = videoPath(t);
	const p = await probe(file);
	const crop = await detectCrop(file, p);
	await query(
		`update titles set duration_s = $2, width = $3, height = $4, hdr = $5, crop = $6 where id = $1`,
		[t.id, p.duration, p.width, p.height, p.hdr, crop]
	);
	return { probe: p, crop };
}

/** Pulls one frame at ts seconds and stores it as a candidate. */
async function addCandidate(
	t: TitleRow,
	p: Probe,
	crop: string | null,
	ts: number,
	source: 'auto' | 'manual'
) {
	const png = await extractFrame(videoPath(t), ts, p, crop);
	const stats = await analyse(png);
	const webp = await toWebp(png);
	const token = newToken(16);
	const file = `${t.id}/${token}.webp`;
	await mkdir(path.dirname(framePath(file)), { recursive: true });
	await writeFile(framePath(file), webp.data);
	return one<{ id: number }>(
		`insert into frames (title_id, token, file, ts, width, height, brightness, contrast, entropy,
			sharpness, score, rejected, source)
		 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
		[
			t.id,
			token,
			file,
			ts,
			webp.width,
			webp.height,
			stats.brightness,
			stats.contrast,
			stats.entropy,
			stats.sharpness,
			stats.score,
			// A frame an admin asked for by hand is never auto-rejected.
			source === 'manual' ? false : stats.rejected,
			source
		]
	);
}

/** Evenly spread sample times, jittered so a reprocess finds new frames. */
function sampleTimes(duration: number, n: number, avoid: number[]): number[] {
	const start = duration * START_FRAC;
	const span = duration * (END_FRAC - START_FRAC);
	const step = span / n;
	const out: number[] = [];
	for (let i = 0; i < n; i++) {
		let ts = start + step * (i + 0.15 + Math.random() * 0.7);
		// Don't land within 15s of a frame we already have.
		for (let tries = 0; tries < 5 && avoid.some((a) => Math.abs(a - ts) < 15); tries++) {
			ts = start + step * (i + Math.random());
		}
		out.push(ts);
	}
	return out;
}

/**
 * Fills empty positions 1..6 from unused candidates: the best frame from each sixth of the film,
 * so the six are spread across it, then in film order. Never moves a frame already placed.
 */
async function autoSelect(titleId: number): Promise<number> {
	return tx(async (c) => {
		const { rows } = await c.query<{
			id: number;
			ts: number;
			score: number;
			rejected: boolean;
			position: number | null;
		}>('select id, ts, score, rejected, position from frames where title_id = $1 order by ts', [
			titleId
		]);
		const taken = new Set(rows.filter((r) => r.position).map((r) => r.position!));
		const free = [1, 2, 3, 4, 5, 6].filter((p) => !taken.has(p));
		if (!free.length) return FRAMES_PER_PUZZLE;

		const pool = rows.filter((r) => !r.position);
		const usable = pool.filter((r) => !r.rejected);
		const picks: typeof rows = [];
		if (usable.length) {
			const lo = usable[0].ts;
			const hi = usable[usable.length - 1].ts + 1;
			const buckets = free.length;
			for (let b = 0; b < buckets; b++) {
				const a = lo + ((hi - lo) * b) / buckets;
				const z = lo + ((hi - lo) * (b + 1)) / buckets;
				const best = usable
					.filter((r) => r.ts >= a && r.ts < z && !picks.includes(r))
					.sort((x, y) => y.score - x.score)[0];
				if (best) picks.push(best);
			}
		}
		// Short of six: the best of whatever's left, rejected frames last.
		const rest = pool
			.filter((r) => !picks.includes(r))
			.sort((x, y) => Number(x.rejected) - Number(y.rejected) || y.score - x.score);
		while (picks.length < free.length && rest.length) picks.push(rest.shift()!);

		picks.sort((x, y) => x.ts - y.ts);
		for (let i = 0; i < picks.length; i++) {
			await c.query('update frames set position = $2 where id = $1', [picks[i].id, free[i]]);
		}
		return taken.size + picks.length;
	});
}

async function loadTitle(id: number): Promise<TitleRow> {
	const t = await one<TitleRow>(
		`select id, title, folder, video_file, duration_s, width, height, hdr, crop from titles where id = $1`,
		[id]
	);
	if (!t) throw new Error(`title ${id} not found`);
	return t;
}

/** The whole pipeline for one title. Keeps whatever frames it already has. */
async function processTitle(id: number) {
	const t = await loadTitle(id);
	const mark = (step: string) => state.active.set(id, { title: t.title, step, since: Date.now() });
	mark('probing');
	// Always re-probe: the file may have been replaced, and SAR isn't stored.
	const { probe: p, crop } = await probeTitle(t);
	if (p.duration < 600) throw new Error(`too short (${Math.round(p.duration)}s) to be a feature`);

	const existing = await query<{ ts: number }>('select ts from frames where title_id = $1', [id]);
	const want = config.candidatesPerTitle - existing.length;
	const times =
		want > 0
			? sampleTimes(
					p.duration,
					want,
					existing.map((e) => e.ts)
				)
			: [];
	let failures = 0;
	for (const [i, ts] of times.entries()) {
		mark(`frame ${i + 1}/${times.length}`);
		try {
			await addCandidate(t, p, crop, ts, 'auto');
		} catch (err) {
			failures++;
			log('frame_error', { title: id, ts, error: (err as Error).message });
			if (failures > 4) throw err;
		}
	}
	mark('selecting');
	const placed = await autoSelect(id);
	if (placed < FRAMES_PER_PUZZLE) throw new Error(`only ${placed} usable frames`);

	if (tmdbEnabled()) {
		mark('tmdb');
		const checked = await one<{ c: boolean }>(
			'select tmdb_checked_at is not null as c from titles where id = $1',
			[id]
		);
		if (!checked?.c)
			await refreshTmdb(id).catch((err) => log('tmdb_error', { title: id, error: err.message }));
	}
}

// --- Worker -----------------------------------------------------------------------------------

async function claimNext(): Promise<number | null> {
	const row = await one<{ id: number }>(
		`update titles set status = 'processing', error = null, updated_at = now()
		 where id = (
			select id from titles where status = 'pending' and not missing
			-- Best-known films first once TMDB has vote counts, otherwise random: either way the
			-- daily pool fills with a spread of the library, not the start of the alphabet.
			order by vote_count desc nulls last, random()
			for update skip locked limit 1)
		 returning id`
	);
	return row?.id ?? null;
}

async function workerLoop() {
	state.workers++;
	try {
		for (;;) {
			const id = await claimNext();
			if (id == null) return;
			const started = Date.now();
			try {
				await processTitle(id);
				await query(
					`update titles set status = 'ready', error = null, processed_at = now(), updated_at = now() where id = $1`,
					[id]
				);
				log('title_ready', { title: id, ms: Date.now() - started });
			} catch (err) {
				const message = (err as Error).message.slice(0, 500);
				await query(
					`update titles set status = 'error', error = $2, processed_at = now(), updated_at = now() where id = $1`,
					[id, message]
				);
				log('title_error', { title: id, error: message });
			} finally {
				state.active.delete(id);
			}
		}
	} catch (err) {
		log('worker_error', { error: (err as Error).message });
	} finally {
		state.workers--;
	}
}

/** Starts workers up to the configured concurrency, if there's anything pending. */
export function kickWorkers() {
	if (!config.ingestEnabled) return;
	while (state.workers < config.ingestConcurrency) void workerLoop();
}

/** On boot: anything left "processing" by a previous container never finished. */
export async function recoverInterrupted() {
	await query(`update titles set status = 'pending' where status = 'processing'`);
}

// --- Admin actions ----------------------------------------------------------------------------

/**
 * Queues a title to be processed again. keep: placed frames stay, unplaced candidates are
 * replaced. reset: every frame goes and the six are chosen afresh.
 */
export async function reprocess(titleId: number, mode: 'keep' | 'reset') {
	const doomed = await query<{ file: string }>(
		mode === 'reset'
			? 'delete from frames where title_id = $1 returning file'
			: 'delete from frames where title_id = $1 and position is null returning file',
		[titleId]
	);
	await deleteFrameFiles(doomed.map((d) => d.file));
	await query(
		`update titles set status = 'pending', error = null, updated_at = now() where id = $1`,
		[titleId]
	);
	kickWorkers();
}

/** Pulls extra candidates right away (an admin is waiting on the page). */
export async function addCandidates(titleId: number, count: number) {
	const t = await loadTitle(titleId);
	const { probe: p, crop } = await probeTitle(t);
	const existing = await query<{ ts: number }>('select ts from frames where title_id = $1', [
		titleId
	]);
	for (const ts of sampleTimes(
		p.duration,
		count,
		existing.map((e) => e.ts)
	)) {
		await addCandidate(t, p, crop, ts, 'auto');
	}
}

/** Grabs the frame at an exact time an admin picked. */
export async function addFrameAt(titleId: number, ts: number) {
	const t = await loadTitle(titleId);
	const { probe: p, crop } = await probeTitle(t);
	if (ts < 0 || ts >= p.duration) throw new Error('time is outside the film');
	return addCandidate(t, p, crop, ts, 'manual');
}

export async function deleteFrame(frameId: number) {
	const row = await one<{ file: string }>('delete from frames where id = $1 returning file', [
		frameId
	]);
	if (row) await deleteFrameFiles([row.file]);
}

/** Sets the played six, in order. frameIds must belong to the title; up to six. */
export async function setPositions(titleId: number, frameIds: number[]) {
	if (frameIds.length > FRAMES_PER_PUZZLE) throw new Error('at most six frames');
	await tx(async (c) => {
		await c.query('update frames set position = null where title_id = $1', [titleId]);
		for (const [i, id] of frameIds.entries()) {
			const r = await c.query('update frames set position = $3 where id = $1 and title_id = $2', [
				id,
				titleId,
				i + 1
			]);
			if (r.rowCount !== 1) throw new Error(`frame ${id} is not a frame of this title`);
		}
		const status = frameIds.length === FRAMES_PER_PUZZLE ? 'ready' : 'error';
		await c.query(
			`update titles set status = case when status = 'processing' then status else $2 end,
				error = case when $2 = 'error' then 'fewer than six frames chosen' else null end,
				updated_at = now() where id = $1`,
			[titleId, status]
		);
	});
}

export async function autoFill(titleId: number) {
	const placed = await autoSelect(titleId);
	if (placed === FRAMES_PER_PUZZLE) {
		await query(
			`update titles set status = 'ready', error = null, updated_at = now() where id = $1 and status = 'error'`,
			[titleId]
		);
	}
}
