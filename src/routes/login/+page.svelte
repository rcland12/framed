<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Sign in · Framed 2.0</title></svelte:head>

<div class="page narrow">
	<div class="card">
		{#if form?.sent}
			<h1>Check your inbox</h1>
			<p>
				We sent a sign-in link to <b>{form.sent}</b>. It works once and expires in 30 minutes.
			</p>
			<p class="muted">Nothing there? Check spam, or <a href="/login">try again</a>.</p>
		{:else}
			<h1>Sign in</h1>
			<p class="muted">
				No password: enter your email and we'll send you a link. Your account keeps your streak and
				stats across devices. Games you've played in this browser come with you.
			</p>
			<form
				method="POST"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update();
						busy = false;
					};
				}}
			>
				<input type="hidden" name="next" value={data.next} />
				<label for="email" class="sr-only">Email</label>
				<input
					id="email"
					class="input"
					type="email"
					name="email"
					required
					autocomplete="email"
					placeholder="you@example.com"
					value={form?.email ?? ''}
				/>
				<label class="check">
					<input type="checkbox" name="daily" checked />
					Email me each morning when the new puzzle is up
				</label>
				{#if form?.error}<p class="error">{form.error}</p>{/if}
				<button class="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</button>
			</form>
		{/if}
	</div>
</div>

<style>
	.narrow {
		max-width: 460px;
		margin-top: 2rem;
	}
	h1 {
		margin-top: 0;
		font-family: var(--display);
		font-weight: 400;
		letter-spacing: 0.05em;
		font-size: 2.2rem;
	}
	form {
		display: grid;
		gap: 0.9rem;
	}
	.check {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-size: 0.95rem;
	}
	.check input {
		accent-color: var(--accent);
		width: 1.1rem;
		height: 1.1rem;
	}
	.error {
		color: var(--red);
		margin: 0;
	}
</style>
