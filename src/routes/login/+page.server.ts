import { fail, redirect } from '@sveltejs/kit';
import { normaliseEmail, requestLoginLink, safeRedirect } from '$lib/server/auth';

export function load({ locals, url }) {
	if (locals.user) redirect(303, safeRedirect(url.searchParams.get('next')));
	return { next: safeRedirect(url.searchParams.get('next')) };
}

export const actions = {
	default: async ({ request, getClientAddress }) => {
		const form = await request.formData();
		const raw = String(form.get('email') ?? '');
		const email = normaliseEmail(raw);
		if (!email) return fail(400, { email: raw, error: 'That doesn’t look like an email address.' });
		const daily = form.get('daily') === 'on';
		const next = safeRedirect(String(form.get('next') ?? '/'));
		const result = await requestLoginLink(email, daily, next, getClientAddress());
		if (result === 'rate_limited') {
			return fail(429, {
				email,
				error: 'Too many sign-in emails. Wait a few minutes and try again.'
			});
		}
		if (result === 'failed') {
			return fail(502, { email, error: 'Couldn’t send the email just now. Try again shortly.' });
		}
		return { sent: email };
	}
};
