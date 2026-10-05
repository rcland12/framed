<script lang="ts">
	import type { CommunityView, PlayerStats } from '$lib/types';
	import Distribution from './Distribution.svelte';

	let {
		stats,
		community,
		highlight = -1
	}: { stats: PlayerStats; community: CommunityView | null; highlight?: number } = $props();

	const pct = (n: number) => `${Math.round(n * 100)}%`;
</script>

<div class="grid">
	<section class="card">
		<h3>Your stats</h3>
		<div class="nums">
			<div><b>{stats.played}</b><span>Played</span></div>
			<div><b>{stats.played ? pct(stats.won / stats.played) : '–'}</b><span>Win rate</span></div>
			<div><b>{stats.currentStreak}</b><span>Streak</span></div>
			<div><b>{stats.maxStreak}</b><span>Best</span></div>
		</div>
		<p class="sub muted">Solved on frame</p>
		<Distribution counts={stats.distribution} {highlight} />
	</section>

	{#if community}
		<section class="card">
			<h3>Everyone today</h3>
			<div class="nums two">
				<div>
					<b>{community.players}</b><span>{community.players === 1 ? 'Player' : 'Players'}</span>
				</div>
				<div><b>{pct(community.winRate)}</b><span>Solved it</span></div>
			</div>
			{#if community.players > 1}
				<p class="sub muted">Solved on frame</p>
				<Distribution counts={community.distribution} {highlight} />
			{/if}
			{#if community.topGuesses.length}
				<p class="sub muted">Most guessed</p>
				<ol class="top">
					{#each community.topGuesses as g (g.label)}
						<li class:correct={g.correct}>
							<span class="t">{g.label}</span>
							<span class="n">{g.count}</span>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
	}
	h3 {
		margin: 0 0 0.75rem;
		font-family: var(--display);
		font-weight: 400;
		letter-spacing: 0.06em;
		font-size: 1.4rem;
	}
	.nums {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		text-align: center;
		gap: 0.25rem;
	}
	.nums.two {
		grid-template-columns: repeat(2, 1fr);
	}
	.nums b {
		display: block;
		font-size: 1.6rem;
		font-variant-numeric: tabular-nums;
	}
	.nums span {
		font-size: 0.75rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.sub {
		margin: 1rem 0 0.4rem;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.top {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.25rem;
		font-size: 0.9rem;
	}
	.top li {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.3rem 0.5rem;
		border-radius: 6px;
		background: var(--surface-2);
	}
	.top li.correct {
		background: rgba(63, 185, 80, 0.2);
	}
	.t {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.n {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
</style>
