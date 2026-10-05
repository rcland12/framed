import { fail, redirect } from '@sveltejs/kit';
import { consumeLoginToken, peekLoginToken, setSessionCookie } from '$lib/server/auth';

/**
 * Two steps on purpose: opening the link only shows a button, and the button signs in. Mail
 * scanners that open every link in a message would otherwise use the token up.
 */
export async function load({ url }) {
	const token = url.searchParams.get('token') ?? '';
	const email = token.length <= 100 ? await peekLoginToken(token) : null;
	return { token, email };
}

export const actions = {
	default: async ({ request, cookies, locals }) => {
		const form = await request.formData();
		const token = String(form.get('token') ?? '');
		if (!token || token.length > 100) return fail(400, { error: 'This link is not valid.' });
		const result = await consumeLoginToken(token, locals.anonId);
		if (!result) return fail(400, { error: 'This link has expired or was already used.' });
		setSessionCookie(cookies, result.session);
		redirect(303, result.redirect);
	}
};
