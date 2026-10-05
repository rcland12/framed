import { error, redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { ANON_COOKIE, SESSION_COOKIE, userForSession } from '$lib/server/auth';
import { config } from '$lib/server/config';
import { startScheduler } from '$lib/server/scheduler';

export const init: ServerInit = () => {
	startScheduler();
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	if (path === '/api/health') return resolve(event);

	// Refuse any other Host: a page that points its own domain here (DNS rebinding) sends its own.
	const host = (event.request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
	if (config.allowedHosts.length && !LOCAL_HOSTS.has(host) && !config.allowedHosts.includes(host)) {
		error(403, `host ${host || '(none)'} is not allowed`);
	}

	// Frames are public, immutable files; no need for a session lookup.
	if (path.startsWith('/f/')) {
		event.locals.user = null;
		event.locals.anonId = '';
		return resolve(event);
	}

	let anonId = event.cookies.get(ANON_COOKIE) ?? '';
	if (!UUID_RE.test(anonId)) {
		anonId = randomUUID();
		event.cookies.set(ANON_COOKIE, anonId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: config.secureCookies,
			maxAge: 2 * 365 * 86400
		});
	}
	event.locals.anonId = anonId;
	event.locals.user = await userForSession(event.cookies.get(SESSION_COOKIE));

	if (path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/')) {
		if (!event.locals.user) {
			if (path.startsWith('/api/')) error(401, 'sign in first');
			redirect(303, `/login?next=${encodeURIComponent(path)}`);
		}
		if (!event.locals.user.isAdmin) error(403, 'admins only');
	}

	return resolve(event);
};
