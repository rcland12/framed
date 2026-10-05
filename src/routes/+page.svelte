<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { post } from '$lib/api';
	import Game from '$lib/components/Game.svelte';
	import StatsPanel from '$lib/components/StatsPanel.svelte';
	import { FRAMES_PER_PUZZLE, type PlayView } from '$lib/types';

	let { data } = $props();

	// The latest state of today's game; replaced by each guess, and by a reload of the page data.
	let latest = $derived(data.play);

	async function onguess(guess: number | null) {
		const next = await post<PlayView>('/api/daily/guess', { date: data.date, guess });
		latest = next;
		if (next.status !== 'playing') void invalidateAll();
		return next;
	}

	const highlight = $derived(
		latest && latest.status !== 'playing'
			? latest.status === 'won'
				? latest.guesses.length - 1
				: FRAMES_PER_PUZZLE
			: -1
	);
</script>

<svelte:head>
	<title>{data.play ? `Framed 2.0 #${data.play.puzzleNumber}` : 'Framed 2.0'}</title>
</svelte:head>

<div class="page">
	{#if data.play && latest}
		<div class="heading">
			<h1>Daily #{data.play.puzzleNumber}</h1>
			<span class="muted">{data.dateLabel}</span>
		</div>
		{#key data.play.puzzleDate}
			<Game play={data.play} {onguess}>
				{#snippet after()}
					<div class="next card">
						<div>
							<b>Want more?</b>
							<span class="muted"
								>Endless mode is unlocked: random movies, as many as you like.</span
							>
						</div>
						<a class="btn primary" href="/endless">Play Endless</a>
					</div>
					{#if !data.user}
						<div class="next card">
							<div>
								<b>Get tomorrow's puzzle by email</b>
								<span class="muted">Sign in with your email to keep your streak on any device.</span
								>
							</div>
							<a class="btn" href="/login">Sign in</a>
						</div>
					{/if}
					<StatsPanel stats={data.stats} community={latest?.community ?? null} {highlight} />
				{/snippet}
			</Game>
		{/key}
	{:else}
		<div class="empty card">
			<h1>No puzzle yet</h1>
			<p class="muted">
				The projector's warming up: frames are still being pulled from the library. Check back soon.
			</p>
		</div>
	{/if}
</div>

<style>
	.heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin: 0.5rem 0 0.9rem;
	}
	h1 {
		margin: 0;
		font-family: var(--display);
		font-weight: 400;
		letter-spacing: 0.05em;
		font-size: 2.2rem;
	}
	.next {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.next b {
		display: block;
	}
	.empty {
		text-align: center;
		margin-top: 3rem;
		padding: 3rem 1.5rem;
	}
</style>
