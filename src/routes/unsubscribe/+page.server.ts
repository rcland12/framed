import { fail } from '@sveltejs/kit';
import { one } from '$lib/server/db';

/** From the link in the morning email. A button press, not the page view, unsubscribes. */
export async function load({ url }) {
	const token = url.searchParams.get('token') ?? '';
	const user =
		token && token.length <= 64
			? await one<{ email: string; email_daily: boolean }>(
					'select email, email_daily from users where unsubscribe_token = $1',
					[token]
				)
			: null;
	return { token, email: user?.email ?? null, subscribed: user?.email_daily ?? false };
}

export const actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const token = String(form.get('token') ?? '');
		const row = await one<{ id: number }>(
			'update users set email_daily = false where unsubscribe_token = $1 returning id',
			[token]
		);
		if (!row) return fail(400, { error: 'This link is not valid.' });
		return { done: true };
	}
};
