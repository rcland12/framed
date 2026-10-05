import { config, log } from './config';
import { purgeExpired } from './auth';
import { localHour, longDate, today } from './dates';
import { one, query } from './db';
import { dailyStats } from './game';
import { kickWorkers, recoverInterrupted, scanLibrary } from './library';
import { sendDailyEmail } from './mail';
import { ensureDaily, scheduleAhead } from './puzzles';
import { backfillTmdb } from './tmdb';

/**
 * Background jobs, run in the web container: library scans, the morning email, keeping the
 * schedule filled ahead, and housekeeping. Started once from hooks.server.ts.
 */

/** Hours after FRAMED_EMAIL_HOUR during which a late start still sends today's email. */
const EMAIL_WINDOW_HOURS = 4;

function safely(name: string, fn: () => Promise<unknown>) {
	return () => fn().catch((err) => log('job_error', { job: name, error: (err as Error).message }));
}

export async function sendDailyEmailTo(
	user: { id: number; email: string; unsubscribe_token: string },
	date: string
) {
	const daily = await ensureDaily(date);
	if (!daily) throw new Error('no puzzle today');
	const frame = await one<{ token: string }>(
		'select token from frames where title_id = $1 and position = 1',
		[daily.titleId]
	);
	const stats = await dailyStats({ userId: user.id, anonId: '' });
	await sendDailyEmail({
		to: user.email,
		number: daily.number,
		dateLabel: longDate(date),
		frameUrl: frame ? `${config.origin}/f/${frame.token}` : null,
		playUrl: `${config.origin}/`,
		unsubscribeUrl: `${config.origin}/unsubscribe?token=${user.unsubscribe_token}`,
		streak: stats.currentStreak
	});
}

/** Sends today's email to every subscriber, once per day however often it's called. */
export async function runDailyEmail(force = false) {
	const hour = localHour();
	if (
		!force &&
		(hour < config.dailyEmailHour || hour >= config.dailyEmailHour + EMAIL_WINDOW_HOURS)
	) {
		return;
	}
	const date = today();
	// No puzzle, no email - and no claim on the day, so it goes out once there is one.
	if (!(await ensureDaily(date))) return;
	const claim = await one<{ run_date: string }>(
		'insert into email_runs (run_date) values ($1) on conflict do nothing returning run_date',
		[date]
	);
	if (!claim) return;

	const users = await query<{ id: number; email: string; unsubscribe_token: string }>(
		'select id, email, unsubscribe_token from users where email_daily order by id'
	);
	let sent = 0;
	let failed = 0;
	for (const u of users) {
		try {
			await sendDailyEmailTo(u, date);
			sent++;
		} catch (err) {
			failed++;
			log('daily_email_failed', { user: u.id, error: (err as Error).message });
		}
		// Gentle on the relay (Gmail rate-limits bursts).
		await new Promise((r) => setTimeout(r, 300));
	}
	await query(
		'update email_runs set finished_at = now(), sent = $2, failed = $3 where run_date = $1',
		[date, sent, failed]
	);
	log('daily_email', { date, sent, failed });
}

let started = false;

export function startScheduler() {
	if (started) return;
	started = true;

	const boot = async () => {
		await recoverInterrupted();
		if (config.ingestEnabled) {
			await scanLibrary();
			kickWorkers();
		}
		await scheduleAhead();
		await backfillTmdb();
	};
	void safely('boot', boot)();

	if (config.ingestEnabled && config.scanMinutes > 0) {
		setInterval(safely('scan', scanLibrary), config.scanMinutes * 60_000).unref();
	}
	if (config.emailEnabled) {
		setInterval(
			safely('daily_email', () => runDailyEmail()),
			60_000
		).unref();
	}
	setInterval(
		safely('hourly', async () => {
			await scheduleAhead();
			await purgeExpired();
			await backfillTmdb();
			kickWorkers();
		}),
		60 * 60_000
	).unref();
}
