export function load({ locals }) {
	const u = locals.user;
	return {
		user: u ? { email: u.email, isAdmin: u.isAdmin, emailDaily: u.emailDaily } : null
	};
}
