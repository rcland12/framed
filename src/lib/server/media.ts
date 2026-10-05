import { spawn } from 'node:child_process';
import sharp from 'sharp';

/**
 * ffmpeg/ffprobe wrappers and frame scoring. Everything runs under `nice` so a library ingest
 * never starves the web server or the rest of the box.
 */

interface RunResult {
	stdout: Buffer;
	stderr: string;
	code: number | null;
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<RunResult> {
	return new Promise((resolve, reject) => {
		const child = spawn('nice', ['-n', '10', cmd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
		const out: Buffer[] = [];
		let err = '';
		const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
		child.stdout.on('data', (d: Buffer) => out.push(d));
		child.stderr.on('data', (d: Buffer) => {
			// Keep the tail only: cropdetect logs a line per frame.
			err = (err + d.toString()).slice(-20_000);
		});
		child.on('error', (e) => {
			clearTimeout(timer);
			reject(e);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ stdout: Buffer.concat(out), stderr: err, code });
		});
	});
}

export interface Probe {
	duration: number;
	width: number;
	height: number;
	hdr: boolean;
	/** Sample aspect ratio as a number, when the pixels aren't square (anamorphic DVDs). */
	sar: number | null;
}

export async function probe(file: string): Promise<Probe> {
	const { stdout, stderr, code } = await run(
		'ffprobe',
		[
			'-v',
			'error',
			'-select_streams',
			'v:0',
			'-show_entries',
			'stream=width,height,color_transfer,sample_aspect_ratio:format=duration',
			'-of',
			'json',
			file
		],
		60_000
	);
	if (code !== 0) throw new Error(`ffprobe failed: ${stderr.trim().slice(-300)}`);
	const j = JSON.parse(stdout.toString()) as {
		streams?: {
			width?: number;
			height?: number;
			color_transfer?: string;
			sample_aspect_ratio?: string;
		}[];
		format?: { duration?: string };
	};
	const s = j.streams?.[0];
	if (!s?.width || !s.height) throw new Error('no video stream');
	const duration = Number(j.format?.duration);
	if (!Number.isFinite(duration) || duration <= 0) throw new Error('unknown duration');
	let sar: number | null = null;
	const m = /^(\d+):(\d+)$/.exec(s.sample_aspect_ratio ?? '');
	if (m && Number(m[1]) > 0 && Number(m[2]) > 0 && m[1] !== m[2]) sar = Number(m[1]) / Number(m[2]);
	return {
		duration,
		width: s.width,
		height: s.height,
		hdr: s.color_transfer === 'smpte2084' || s.color_transfer === 'arib-std-b67',
		sar
	};
}

/**
 * Finds the letterbox/pillarbox bars. Samples a few points in the film and keeps the union of
 * what cropdetect reports, so a dark scene can't make the crop eat into the picture.
 * Returns an ffmpeg crop=w:h:x:y argument, or null when there's nothing worth cropping.
 */
export async function detectCrop(file: string, p: Probe): Promise<string | null> {
	let x1 = Infinity,
		y1 = Infinity,
		x2 = -Infinity,
		y2 = -Infinity;
	let samples = 0;
	for (const frac of [0.2, 0.4, 0.6, 0.8]) {
		const { stderr } = await run(
			'ffmpeg',
			[
				'-nostdin',
				'-hide_banner',
				'-ss',
				(p.duration * frac).toFixed(2),
				'-i',
				file,
				'-map',
				'0:v:0',
				'-vf',
				'cropdetect=limit=0.094:round=2:reset=0',
				'-frames:v',
				'12',
				'-an',
				'-sn',
				'-f',
				'null',
				'-'
			],
			120_000
		);
		const all = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
		const last = all.at(-1);
		if (!last) continue;
		const [w, h, x, y] = last.slice(1).map(Number);
		if (w <= 0 || h <= 0) continue;
		samples++;
		x1 = Math.min(x1, x);
		y1 = Math.min(y1, y);
		x2 = Math.max(x2, x + w);
		y2 = Math.max(y2, y + h);
	}
	if (!samples) return null;
	const w = x2 - x1;
	const h = y2 - y1;
	// Nothing to gain, or a result too strange to trust (an all-black sample, say).
	if (w >= p.width * 0.98 && h >= p.height * 0.98) return null;
	if (w < p.width * 0.5 || h < p.height * 0.4) return null;
	return `${w}:${h}:${x1}:${y1}`;
}

const TONEMAP =
	'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

export const FRAME_WIDTH = 1280;

/** Decodes the frame at ts seconds: bars cropped, square pixels, SDR, at most 1280 wide. PNG. */
export async function extractFrame(
	file: string,
	ts: number,
	p: Probe,
	crop: string | null
): Promise<Buffer> {
	const filters: string[] = [];
	if (crop) filters.push(`crop=${crop}`);
	if (p.sar) filters.push(`scale=trunc(iw*${p.sar.toFixed(6)}/2)*2:ih`, 'setsar=1');
	filters.push(`scale='min(${FRAME_WIDTH},iw)':-2:flags=lanczos`);
	if (p.hdr) filters.push(TONEMAP);
	// 8-bit RGB out: a 10-bit source would otherwise give a 16-bit PNG.
	filters.push('format=rgb24');
	const { stdout, stderr, code } = await run(
		'ffmpeg',
		[
			'-nostdin',
			'-hide_banner',
			'-v',
			'error',
			'-ss',
			ts.toFixed(3),
			'-i',
			file,
			'-map',
			'0:v:0',
			'-frames:v',
			'1',
			'-vf',
			filters.join(','),
			'-an',
			'-sn',
			'-f',
			'image2pipe',
			'-c:v',
			'png',
			'-'
		],
		120_000
	);
	if (code !== 0 || !stdout.length) {
		throw new Error(`ffmpeg frame at ${ts.toFixed(1)}s failed: ${stderr.trim().slice(-300)}`);
	}
	return stdout;
}

export interface FrameStats {
	brightness: number;
	contrast: number;
	entropy: number;
	sharpness: number;
	score: number;
	rejected: boolean;
}

/**
 * Cheap quality checks on a frame: rejects black/near-black fades, washed-out flashes, flat
 * single-colour frames and heavy blur. The score ranks what's left; it says nothing yet about
 * how hard a frame is to recognise.
 */
export async function analyse(png: Buffer): Promise<FrameStats> {
	const stats = await sharp(png).resize({ width: 320 }).greyscale().stats();
	const g = stats.channels[0];
	const brightness = g.mean;
	const contrast = g.stdev;
	const entropy = stats.entropy;
	const sharpness = stats.sharpness;
	// Calibrated on a few hundred frames from the library. Sharpness from a 320px thumbnail barely
	// separates good frames from soft ones, so it only nudges the score.
	const rejected = brightness < 30 || brightness > 225 || contrast < 18 || entropy < 5.2;
	// Prefer detail and spread of tones; penalise very dark frames gently.
	const score =
		entropy * 10 +
		Math.min(contrast, 70) * 0.4 +
		Math.min(sharpness, 3) * 4 -
		Math.max(0, 60 - brightness) * 0.3;
	return { brightness, contrast, entropy, sharpness, score, rejected };
}

export async function toWebp(
	png: Buffer
): Promise<{ data: Buffer; width: number; height: number }> {
	const { data, info } = await sharp(png)
		.webp({ quality: 82 })
		.toBuffer({ resolveWithObject: true });
	return { data, width: info.width, height: info.height };
}
