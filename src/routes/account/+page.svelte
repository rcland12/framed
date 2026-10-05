<script lang="ts">
	import { enhance } from '$app/forms';
	import StatsPanel from '$lib/components/StatsPanel.svelte';

	let { data, form } = $props();
	let confirmDelete = $state(false);
</script>

<svelte:head><title>Account · Framed 2.0</title></svelte:head>

<div class="page">
	<h1>Account</h1>
	<div class="stack">
		<section class="card row">
			<div>
				<div class="muted small">Signed in as</div>
				<b>{data.user?.email}</b>
			</div>
			<form method="POST" action="/logout"><button class="btn">Sign out</button></form>
		</section>

		<section class="card">
			<h2>Morning email</h2>
			<form method="POST" action="?/email" use:enhance class="row">
				<label class="check">
					<input
						type="checkbox"
						name="daily"
						checked={data.user?.emailDaily}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					/>
					Email me a link to each day's puzzle
				</label>
				{#if form?.saved}<span class="muted small">Saved</span>{/if}
			</form>
		</section>

		<StatsPanel stats={data.daily} community={null} />

		<section class="card">
			<h2>Endless</h2>
			<p class="muted">
				{data.endless.won} solved of {data.endless.played} played · current streak {data.endless
					.currentStreak} · best {data.endless.maxStreak}
			</p>
		</section>

		<section class="card">
			<h2>Delete account</h2>
			{#if !confirmDelete}
				<p class="muted">Removes your account, stats and history for good.</p>
				<button class="btn danger" onclick={() => (confirmDelete = true)}>Delete my account…</button
				>
			{:else}
				<form method="POST" action="?/delete" class="del">
					<label for="confirm">Type <b>{data.user?.email}</b> to confirm:</label>
					<input id="confirm" class="input" name="confirm" autocomplete="off" />
					{#if form?.deleteError}<p class="error">{form.deleteError}</p>{/if}
					<div class="row">
						<button class="btn danger">Delete forever</button>
						<button type="button" class="btn" onclick={() => (confirmDelete = false)}>Cancel</button
						>
					</div>
				</form>
			{/if}
		</section>
	</div>
</div>

<style>
	h1 {
		font-family: var(--display);
		font-weight: 400;
		letter-spacing: 0.05em;
		font-size: 2.2rem;
		margin: 0.5rem 0 1rem;
	}
	h2 {
		margin: 0 0 0.6rem;
		font-size: 1.1rem;
	}
	.stack {
		display: grid;
		gap: 1rem;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.small {
		font-size: 0.85rem;
	}
	.check {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.check input {
		accent-color: var(--accent);
		width: 1.1rem;
		height: 1.1rem;
	}
	.del {
		display: grid;
		gap: 0.6rem;
	}
	.error {
		color: var(--red);
		margin: 0;
	}
</style>
