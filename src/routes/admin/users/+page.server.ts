import { fail } from '@sveltejs/kit';
import { listUsers } from '$lib/server/admin';
import { log } from '$lib/server/config';
import { query } from '$lib/server/db';

export async function load() {
	return { users: await listUsers() };
}

export const actions = {
	admin: async ({ request, locals }) => {
		const form = await request.formData();
		const id = Number(form.get('user'));
		const on = form.get('on') === 'true';
		if (id === locals.user!.id && !on)
			return fail(400, { message: 'You can’t remove your own admin rights.' });
		await query('update users set is_admin = $2 where id = $1', [id, on]);
		log('admin_role', { user: id, on, by: locals.user!.email });
		return { message: on ? 'Made admin.' : 'Admin removed.' };
	}
};
