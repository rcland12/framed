<script lang="ts">
	import type { Snippet } from 'svelte';
	import { FRAMES_PER_PUZZLE, type PlayView, type TitleOption } from '$lib/types';
	import GuessInput from './GuessInput.svelte';

	let {
		play,
		onguess,
		after
	}: {
		play: PlayView;
		/** Sends a guess (a title id, or null to skip) and resolves with the new state. */
		onguess: (guess: number | null) => Promise<PlayView>;
		/** Shown under the result once the game is over. */
		after?: Snippet;
	} = $props();

	// Parents key this component by game, so the prop is only the starting state.
	// svelte-ignore state_referenced_locally
	let current = $state<PlayView>(play);
	// svelte-ignore state_referenced_locally
	let selected = $state(Math.max(0, play.frames.length - 1));
	let busy = $state(false);
	let message = $state('');
	let shake = $state(false);
	let copied = $state(false);
	let loaded = $state<Record<string, boolean>>({});

	const over = $derived(current.status !== 'playing');
	const frameUrl = $derived(current.frames[Math.min(selected, current.frames.length - 1)]);

	async function submit(guess: number | null) {
		if (busy || over) return;
		busy = true;
		message = '';
		try {
			const next = await onguess(guess);
			const last = next.guesses.at(-1);
			if (guess != null && last && !last.correct) {
				shake = true;
				setTimeout(() => (shake = false), 450);
			}
			current = next;
			// Show the new frame; on a win, stay on the frame that was solved.
			selected = next.status === 'won' ? next.guesses.length - 1 : next.frames.length - 1;
		} catch (err) {
			message = (err as Error).message || 'Something went wrong. Try again.';
		} finally {
			busy = false;
		}
	}

	function pick(t: TitleOption) {
		void submit(t.id);
	}

	function tabState(i: number): string {
		const g = current.guesses[i];
		if (g) return g.correct ? 'correct' : g.titleId == null ? 'skipped' : 'wrong';
		if (i < current.frames.length) return 'open';
		return 'locked';
	}

	const squares = $derived(
		Array.from({ length: FRAMES_PER_PUZZLE }, (_, i) => {
			const g = current.guesses[i];
			if (!g) return '⬛';
			return g.correct ? '🟩' : g.titleId == null ? '⬜' : '🟥';
		}).join(' ')
	);

	async function share() {
		const head =
			current.mode === 'daily' ? `Framed 2.0 #${current.puzzleNumber}` : 'Framed 2.0 · Endless';
		const text = `${head}\n🎥 ${squares}\n${location.origin}`;
		try {
			if (navigator.share && matchMedia('(pointer: coarse)').matches) {
				await navigator.share({ text });
				return;
			}
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* cancelled */
		}
	}

	function onkey(e: KeyboardEvent) {
		const el = e.target as HTMLElement;
		if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
		if (e.key === 'ArrowLeft' && selected > 0) selected--;
		if (e.key === 'ArrowRight' && selected < current.frames.length - 1) selected++;
	}
</script>

<svelte:window onkeydown={onkey} />

<section class="game">
	<div class="screen">
		{#if frameUrl}
			{#key frameUrl}
				<img
					src={frameUrl}
					alt="Frame {selected + 1} of the mystery movie"
					class:ready={loaded[frameUrl]}
					onload={() => (loaded[frameUrl] = true)}
					draggable="false"
				/>
			{/key}
		{/if}
		<span class="badge">{selected + 1} / {FRAMES_PER_PUZZLE}</span>
	</div>

	<div class="tabs" role="tablist" aria-label="Frames">
		{#each Array.from({ length: FRAMES_PER_PUZZLE }, (_, i) => i) as i (i)}
			{@const st = tabState(i)}
			<button
				role="tab"
				aria-selected={selected === i}
				class="tab {st}"
				class:sel={selected === i}
				disabled={st === 'locked'}
				onclick={() => (selected = i)}
				aria-label="Frame {i + 1}{st === 'locked' ? ' (locked)' : ''}"
			>
				{i + 1}
			</button>
		{/each}
	</div>

	{#if !over}
		<div class="controls" class:shake>
			<GuessInput
				onpick={pick}
				exclude={current.guesses.map((g) => g.titleId)}
				disabled={busy}
				autofocus
			/>
			<button class="btn" onclick={() => submit(null)} disabled={busy}>
				{current.frames.length >= FRAMES_PER_PUZZLE ? 'Give up' : 'Skip'}
			</button>
		</div>
		<p class="hint muted">
			{FRAMES_PER_PUZZLE - current.guesses.length}
			{FRAMES_PER_PUZZLE - current.guesses.length === 1 ? 'guess' : 'guesses'} left
		</p>
		{#if message}<p class="error">{message}</p>{/if}
	{/if}

	{#if current.guesses.length}
		<ol class="guesses">
			{#each current.guesses as g, i (i)}
				<li class={g.correct ? 'correct' : g.titleId == null ? 'skipped' : 'wrong'}>
					<span class="mark">{g.correct ? '✓' : g.titleId == null ? '–' : '✕'}</span>
					{g.label ?? 'Skipped'}
				</li>
			{/each}
		</ol>
	{/if}

	{#if over && current.answer}
		{@const a = current.answer}
		<div class="result card">
			<div class="verdict" class:won={current.status === 'won'}>
				{#if current.status === 'won'}
					{#if current.guesses.length === 1}
						First frame. Unreal.
					{:else}
						Got it on frame {current.guesses.length}!
					{/if}
				{:else}
					Not this time.
				{/if}
			</div>
			<div class="answer">
				{#if a.posterUrl}
					<img class="poster" src={a.posterUrl} alt="Poster for {a.title}" />
				{/if}
				<div>
					<p class="label muted">The movie was</p>
					<h2>
						{a.title}
						{#if a.year}<span class="muted">({a.year})</span>{/if}
					</h2>
					{#if a.overview}<p class="overview">{a.overview}</p>{/if}
					<p class="links">
						{#if a.tmdbId}<a
								href="https://www.themoviedb.org/movie/{a.tmdbId}"
								target="_blank"
								rel="noopener">TMDB</a
							>{/if}
						{#if a.imdbId}<a
								href="https://www.imdb.com/title/{a.imdbId}/"
								target="_blank"
								rel="noopener">IMDb</a
							>{/if}
					</p>
				</div>
			</div>
			<div class="share">
				<span class="squares">🎥 {squares}</span>
				<button class="btn primary" onclick={share}>{copied ? 'Copied!' : 'Share'}</button>
			</div>
		</div>
		{@render after?.()}
	{/if}
</section>

<style>
	.game {
		display: grid;
		gap: 0.9rem;
	}
	.screen {
		position: relative;
		aspect-ratio: 16 / 9;
		background: #000;
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--border);
		user-select: none;
	}
	.screen img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
		opacity: 0;
		transition: opacity 0.35s;
		-webkit-user-drag: none;
	}
	.screen img.ready {
		opacity: 1;
	}
	.badge {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
		background: rgba(0, 0, 0, 0.65);
		font-size: 0.8rem;
		font-weight: 700;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		color: var(--muted);
	}
	.tabs {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.4rem;
	}
	.tab {
		height: 2.4rem;
		border-radius: 8px;
		border: 2px solid var(--border);
		background: var(--surface);
		color: var(--text);
		font-weight: 800;
		cursor: pointer;
		transition: border-color 0.15s;
	}
	.tab.locked {
		color: var(--faint);
		cursor: not-allowed;
		background: transparent;
		border-style: dashed;
	}
	.tab.wrong {
		background: rgba(229, 72, 77, 0.18);
		border-color: rgba(229, 72, 77, 0.5);
	}
	.tab.skipped {
		background: rgba(120, 120, 130, 0.18);
	}
	.tab.correct {
		background: rgba(63, 185, 80, 0.22);
		border-color: rgba(63, 185, 80, 0.7);
	}
	.tab.sel {
		border-color: var(--accent);
	}
	.controls {
		display: flex;
		gap: 0.5rem;
	}
	.controls.shake {
		animation: shake 0.4s;
	}
	@keyframes shake {
		20%,
		60% {
			transform: translateX(-6px);
		}
		40%,
		80% {
			transform: translateX(6px);
		}
	}
	.hint {
		margin: -0.4rem 0 0;
		font-size: 0.85rem;
		text-align: right;
	}
	.error {
		color: var(--red);
		margin: 0;
	}
	.guesses {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.35rem;
	}
	.guesses li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.guesses li.skipped {
		color: var(--muted);
		font-style: italic;
	}
	.guesses li.correct {
		border-color: rgba(63, 185, 80, 0.6);
	}
	.mark {
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 50%;
		display: inline-grid;
		place-items: center;
		font-size: 0.8rem;
		font-weight: 800;
		flex: none;
		background: var(--skip);
		font-style: normal;
	}
	.wrong .mark {
		background: var(--red);
	}
	.correct .mark {
		background: var(--green);
		color: #06120a;
	}
	.result {
		display: grid;
		gap: 1rem;
	}
	.verdict {
		font-family: var(--display);
		font-size: 2rem;
		letter-spacing: 0.04em;
		color: var(--red);
		line-height: 1;
	}
	.verdict.won {
		color: var(--green);
	}
	.answer {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}
	.poster {
		width: 110px;
		border-radius: 8px;
		flex: none;
		border: 1px solid var(--border);
	}
	.label {
		margin: 0;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	h2 {
		margin: 0.1rem 0 0.5rem;
		font-size: 1.5rem;
	}
	.overview {
		margin: 0 0 0.5rem;
		color: #c9c8c4;
		font-size: 0.92rem;
		display: -webkit-box;
		-webkit-line-clamp: 5;
		line-clamp: 5;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.links {
		display: flex;
		gap: 0.9rem;
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.share {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		border-top: 1px solid var(--border);
		padding-top: 1rem;
	}
	.squares {
		font-size: 1.15rem;
		letter-spacing: 0.05em;
	}
	@media (max-width: 520px) {
		.poster {
			width: 80px;
		}
		.tab {
			height: 2.2rem;
		}
	}
</style>
