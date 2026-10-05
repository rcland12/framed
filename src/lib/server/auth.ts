import { createHash, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import type { SessionUser } from '$lib/types';
import { config, log } from './config';
import { one, query, tx } from './db';
import { sendLoginEmail } from './mail';

/**
 * Accounts are email-only: no passwords. Signing in sends a one-time link; following it creates
 * the account on first use and a session cookie. Anonymous games played in the same browser are
 * moved onto the account at that point.
 */

export const SESSION_COOKIE = 'framed_session';
export const ANON_COOKIE = 'framed_anon';

const SESSION_DAYS = 180;
const LINK_MINUTES = 30;

export function sha256(s: string): string {
	return createHash('sha256').update(s).digest('hex');
}

export function newToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,252}\.[A-Za-z]{2,}$/;

export function normaliseEmail(raw: string): string | null {
	const email = raw.trim().toLowerCase();
	return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/** Only same-site paths survive as a post-login redirect. */
export function safeRedirect(raw: string | null | undefined): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
	return raw.slice(0, 200);
}

export type LinkResult = 'sent' | 'rate_limited' | 'failed';

export async function requestLoginLink(
	email: string,
	wantsDaily: boolean,
	redirect: string,
	ip: string
): Promise<LinkResult> {
	// The links go out through our own mail relay, so a public form must not become a way to
	// mail strangers in bulk: a few per address, a few more per IP, and a ceiling for the site.
	const limits = await one<{ by_email: number; by_ip: number; total: number }>(
		`select
			count(*) filter (where email = $1 and created_at > now() - interval '15 minutes')::int as by_email,
			count(*) filter (where ip = $2 and created_at > now() - interval '1 hour')::int as by_ip,
			count(*) filter (where created_at > now() - interval '1 hour')::int as total
		 from login_tokens where created_at > now() - interval '1 hour'`,
		[email, ip]
	);
	if (!limits || limits.by_email >= 3 || limits.by_ip >= 10 || limits.total >= 300) {
		log('login_rate_limited', { ip });
		return 'rate_limited';
	}

	const token = newToken();
	await query(
		`insert into login_tokens (token_hash, email, wants_daily, redirect, ip, expires_at)
		 values ($1, $2, $3, $4, $5, now() + make_interval(mins => $6))`,
		[sha256(token), email, wantsDaily, redirect, ip, LINK_MINUTES]
	);
	try {
		await sendLoginEmail(email, `${config.origin}/auth/verify?token=${token}`);
		return 'sent';
	} catch (err) {
		log('login_email_failed', { error: (err as Error).message });
		return 'failed';
	}
}

/** Checks a sign-in link without using it up (for the confirmation page). */
export async function peekLoginToken(token: string): Promise<string | null> {
	const row = await one<{ email: string }>(
		`select email from login_tokens
		 where token_hash = $1 and used_at is null and expires_at > now()`,
		[sha256(token)]
	);
	return row?.email ?? null;
}

/**
 * Uses up a sign-in link: creates the account if needed, opens a session, and moves this
 * browser's anonymous games onto the account. Returns the session cookie value and redirect.
 */
export async function consumeLoginToken(
	token: string,
	anonId: string
): Promise<{ session: string; redirect: string } | null> {
	const session = newToken();
	const result = await tx(async (c) => {
		const { rows } = await c.query<{
			email: string;
			wants_daily: boolean;
			redirect: string | null;
		}>(
			`update login_tokens set used_at = now()
			 where token_hash = $1 and used_at is null and expires_at > now()
			 returning email, wants_daily, redirect`,
			[sha256(token)]
		);
		const link = rows[0];
		if (!link) return null;

		const isAdmin = config.adminEmails.includes(link.email);
		const user = await c.query<{ id: number }>(
			`insert into users (email, email_daily, is_admin, unsubscribe_token, last_login_at)
			 values ($1, $2, $3, $4, now())
			 on conflict (email) do update set
				last_login_at = now(),
				is_admin = users.is_admin or excluded.is_admin
			 returning id`,
			[link.email, link.wants_daily, isAdmin, newToken(24)]
		);
		const userId = user.rows[0].id;

		await c.query(
			`insert into sessions (id_hash, user_id, expires_at)
			 values ($1, $2, now() + make_interval(days => $3))`,
			[sha256(session), userId, SESSION_DAYS]
		);

		// Claim this browser's anonymous games. A daily the account already played elsewhere wins
		// over the anonymous one for the same day.
		await c.query(
			`update plays p set user_id = $1
			 where p.anon_id = $2 and p.user_id is null
			   and not (p.mode = 'daily' and exists (
				 select 1 from plays q
				 where q.user_id = $1 and q.mode = 'daily' and q.puzzle_date = p.puzzle_date))`,
			[userId, anonId]
		);
		log('login', { user: userId });
		return { session, redirect: safeRedirect(link.redirect) };
	});
	return result;
}

export async function userForSession(cookie: string | undefined): Promise<SessionUser | null> {
	if (!cookie || cookie.length > 100) return null;
	const row = await one<{
		id: number;
		email: string;
		display_name: string | null;
		is_admin: boolean;
		email_daily: boolean;
		stale: boolean;
	}>(
		`select u.id, u.email, u.display_name, u.is_admin, u.email_daily,
			s.last_seen_at < now() - interval '1 hour' as stale
		 from sessions s join users u on u.id = s.user_id
		 where s.id_hash = $1 and s.expires_at > now()`,
		[sha256(cookie)]
	);
	if (!row) return null;
	if (row.stale) {
		// Sliding expiry, written at most hourly.
		await query(
			`update sessions set last_seen_at = now(),
				expires_at = now() + make_interval(days => $2) where id_hash = $1`,
			[sha256(cookie), SESSION_DAYS]
		);
	}
	return {
		id: row.id,
		email: row.email,
		displayName: row.display_name,
		isAdmin: row.is_admin,
		emailDaily: row.email_daily
	};
}

export async function endSession(cookie: string | undefined) {
	if (cookie) await query('delete from sessions where id_hash = $1', [sha256(cookie)]);
}

export function setSessionCookie(cookies: Cookies, value: string) {
	cookies.set(SESSION_COOKIE, value, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: config.secureCookies,
		maxAge: SESSION_DAYS * 86400
	});
}

/** Housekeeping, run by the scheduler. */
export async function purgeExpired() {
	await query(`delete from sessions where expires_at < now()`);
	await query(`delete from login_tokens where created_at < now() - interval '2 days'`);
}
