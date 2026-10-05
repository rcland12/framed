<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const day = (s: string | null) => (s ? new Date(s).toLocaleDateString() : '–');
</script>

<h1>Users <span class="muted">({data.users.length})</span></h1>
<p class="muted">
	Anyone can sign up with their email. Admins can curate frames and the schedule; emails in
	FRAMED_ADMIN_EMAILS become admins automatically when they sign in.
</p>
{#if form?.message}<p class="flash">{form.message}</p>{/if}

<section class="card">
	<table>
		<thead>
			<tr
				><th>Email</th><th>Joined</th><th>Last sign-in</th><th>Daily</th><th>Endless</th><th
					>Email</th
				><th>Role</th></tr
			>
		</thead>
		<tbody>
			{#each data.users as u (u.id)}
				<tr>
					<td>{u.email}</td>
					<td>{day(u.created_at)}</td>
					<td>{day(u.last_login_at)}</td>
					<td>{u.daily_played}</td>
					<td>{u.endless_played}</td>
					<td
						><span class="pill {u.email_daily ? 'on' : ''}"
							>{u.email_daily ? 'subscribed' : 'off'}</span
						></td
					>
					<td>
						<form method="POST" action="?/admin" use:enhance class="role">
							<input type="hidden" name="user" value={u.id} />
							<input type="hidden" name="on" value={String(!u.is_admin)} />
							{#if u.is_admin}<span class="pill on">admin</span>{/if}
							<button class="btn small">{u.is_admin ? 'Remove admin' : 'Make admin'}</button>
						</form>
					</td>
				</tr>
			{:else}
				<tr><td colspan="7" class="muted">No accounts yet.</td></tr>
			{/each}
		</tbody>
	</table>
</section>

<style>
	section {
		overflow-x: auto;
	}
	.flash {
		background: rgba(245, 197, 24, 0.12);
		border: 1px solid rgba(245, 197, 24, 0.35);
		padding: 0.6rem 0.9rem;
		border-radius: 8px;
	}
	.role {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
</style>
