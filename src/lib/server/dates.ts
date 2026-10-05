import { config } from './config';

/** YYYY-MM-DD for the instant d, in the puzzle time zone. */
export function today(d: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: config.timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(d);
}

/** The hour (0-23) of the instant d, in the puzzle time zone. */
export function localHour(d: Date = new Date()): number {
	const h = new Intl.DateTimeFormat('en-US', {
		timeZone: config.timeZone,
		hour: 'numeric',
		hourCycle: 'h23'
	}).format(d);
	return Number(h);
}

/** Calendar arithmetic on YYYY-MM-DD strings; no time zone involved. */
export function addDays(date: string, days: number): string {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function isDate(s: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

/** "Saturday, October 4" for emails and headings. */
export function longDate(date: string): string {
	return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC'
	});
}
