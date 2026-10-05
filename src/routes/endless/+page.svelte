<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { post } from '$lib/api';
	import Game from '$lib/components/Game.svelte';
	import type { EndlessStats, PlayView } from '$lib/types';

	let { data } = $props();

	let play = $derived(data.play);
	let starting = $state(false);
	let error = $state('');

	async function next() {
		starting = true;
		error = '';
		try {
			const r = await post<{ play: PlayView; stats: EndlessStats }>('/api/endless/next');
			play = r.play;
		} catch (err) {
			error = (err as Error).message;
		} finally {
			starting = false;
		}
	}

	async function onguess(guess: number | null) {
		const v = await post<PlayView>('/api/endless/guess', { playId: play!.id, guess });
		if (v.status !== 'playing') void invalidateAll();
		return v;
	}
</script>

<svelte:head>
	<title>Endless · Framed 2.0</title>
</svelte:head>

<div class="page">
	<div class="heading">
		<h1>Endless</h1>
		{#if data.stats}
			<span class="muted">
				{data.stats.won}/{data.stats.played} solved · streak {data.stats.currentStreak} · best {data
					.stats.maxStreak}
			</span>
		{/if}
	</div>

	{#if !data.unlocked}
		<div class="card center">
			<h2>Finish today's puzzle first</h2>
			<p class="muted">
				Endless unlocks once you've played the daily, so nobody spoils it for themselves.
			</p>
			<a class="btn primary" href="/">Play the daily</a>
		</div>
	{:else if play}
		{#key play.id}
			<Game {play} {onguess}>
				{#snippet after()}
					<div class="again">
						<button class="btn primary big" onclick={next} disabled={starting}>
							{starting ? 'Loading…' : 'Next movie →'}
						</button>
						{#if error}<p class="error">{error}</p>{/if}
					</div>
				{/snippet}
			</Game>
		{/key}
	{:else}
		<div class="card center">
			<h2>Random movies, as many as you like</h2>
			<p class="muted">
				Same rules as the daily: six frames, six guesses. Never a movie from the daily schedule.
			</p>
			<button class="btn primary big" onclick={next} disabled={starting}>
				{starting ? 'Loading…' : 'Start'}
			</button>
			{#if error}<p class="error">{error}</p>{/if}
		</div>
	{/if}
</div>

<style>
	.heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin: 0.5rem 0 0.9rem;
	}
	h1 {
		margin: 0;
		font-family: var(--display);
		font-weight: 400;
		letter-spacing: 0.05em;
		font-size: 2.2rem;
	}
	.center {
		text-align: center;
		padding: 2.5rem 1.5rem;
	}
	.center h2 {
		margin-top: 0;
	}
	.again {
		display: grid;
		justify-items: center;
		gap: 0.5rem;
	}
	.big {
		font-size: 1.1rem;
		padding: 0.8em 1.8em;
	}
	.error {
		color: var(--red);
	}
</style>
