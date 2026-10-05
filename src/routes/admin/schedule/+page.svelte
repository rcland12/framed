<script lang="ts">
	import { enhance } from '$app/forms';
	import GuessInput from '$lib/components/GuessInput.svelte';
	import type { TitleOption } from '$lib/types';

	let { data, form } = $props();
	let editing = $state<string | null>(null);
	let chosen = $state<TitleOption | null>(null);

	const upcoming = $derived(data.rows.filter((r) => r.date > data.today).reverse());
	const past = $derived(data.rows.filter((r) => r.date <= data.today));
	const pct = (w: number, n: number) => (n ? `${Math.round((w / n) * 100)}%` : '–');
</script>

<h1>Schedule</h1>
<p class="muted">
	The next two weeks are filled automatically from daily-eligible movies; past and today's puzzles
	can't change. Endless mode never serves a movie that's scheduled here.
</p>
{#if form?.message}<p class="flash">{form.message}</p>{/if}

<section class="card">
	<h2>Coming up</h2>
	<table>
		<thead><tr><th>#</th><th>Date</th><th>Movie</th><th>Chosen by</th><th></th></tr></thead>
		<tbody>
			{#each upcoming as r (r.date)}
				<tr>
					<td>{r.number}</td>
					<td>{r.date}</td>
					<td>
						{#if editing === r.date}
							<form
								method="POST"
								action="?/set"
								use:enhance={() =>
									async ({ update }) => {
										await update();
										editing = null;
										chosen = null;
									}}
								class="edit"
							>
								<GuessInput onpick={(t) => (chosen = t)} placeholder="Find a movie…" />
								<input type="hidden" name="date" value={r.date} />
								<input type="hidden" name="title" value={chosen?.id ?? ''} />
								<button class="btn small primary" disabled={!chosen}>
									{chosen ? `Use ${chosen.title}` : 'Pick one'}
								</button>
								<button type="button" class="btn small" onclick={() => (editing = null)}
									>Cancel</button
								>
							</form>
						{:else}
							<a href="/admin/titles/{r.titleId}">{r.title} {r.year ? `(${r.year})` : ''}</a>
						{/if}
					</td>
					<td class="muted">{r.setBy}</td>
					<td class="acts">
						{#if editing !== r.date}
							<button
								class="btn small"
								onclick={() => {
									editing = r.date;
									chosen = null;
								}}>Change</button
							>
							<form method="POST" action="?/reroll" use:enhance>
								<input type="hidden" name="date" value={r.date} />
								<button class="btn small">Re-roll</button>
							</form>
						{/if}
					</td>
				</tr>
			{:else}
				<tr><td colspan="5" class="muted">Nothing scheduled – no movies are ready yet.</td></tr>
			{/each}
		</tbody>
	</table>
</section>

<section class="card">
	<h2>Today and earlier</h2>
	<table>
		<thead><tr><th>#</th><th>Date</th><th>Movie</th><th>Players</th><th>Solved</th></tr></thead>
		<tbody>
			{#each past as r (r.date)}
				<tr class:today={r.date === data.today}>
					<td>{r.number}</td>
					<td>{r.date}{r.date === data.today ? ' (today)' : ''}</td>
					<td><a href="/admin/titles/{r.titleId}">{r.title} {r.year ? `(${r.year})` : ''}</a></td>
					<td>{r.players}</td>
					<td>{pct(r.wins, r.players)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<style>
	section {
		margin-bottom: 1rem;
		overflow-x: auto;
	}
	.flash {
		background: rgba(245, 197, 24, 0.12);
		border: 1px solid rgba(245, 197, 24, 0.35);
		padding: 0.6rem 0.9rem;
		border-radius: 8px;
	}
	.edit {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		min-width: 420px;
	}
	.edit :global(ul) {
		bottom: auto;
		top: calc(100% + 6px);
	}
	.acts {
		display: flex;
		gap: 0.35rem;
		justify-content: flex-end;
	}
	tr.today td {
		background: rgba(245, 197, 24, 0.06);
	}
</style>
