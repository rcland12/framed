import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, endSession } from '$lib/server/auth';

export function load() {
	redirect(303, '/account');
}

export const actions = {
	default: async ({ cookies }) => {
		await endSession(cookies.get(SESSION_COOKIE));
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/');
	}
};
