<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Modal from '$lib/components/Modal.svelte';

	let { data, children } = $props();
	let help = $state(false);

	const isAdmin = $derived(page.url.pathname.startsWith('/admin'));
</script>

<header class="top">
	<div class="inner" class:wide={isAdmin}>
		<a class="logo" href="/" aria-label="Framed 2.0 home">
			<span class="word">FRAMED</span><span class="ver">2.0</span>
		</a>
		<nav>
			<a href="/" class:active={page.url.pathname === '/'}>Daily</a>
			<a href="/endless" class:active={page.url.pathname === '/endless'}>Endless</a>
			{#if data.user?.isAdmin}
				<a href="/admin" class:active={isAdmin}>Admin</a>
			{/if}
			<button class="icon" onclick={() => (help = true)} aria-label="How to play">?</button>
			{#if data.user}
				<a class="account" href="/account" title={data.user.email}>Account</a>
			{:else}
				<a class="account" href="/login">Sign in</a>
			{/if}
		</nav>
	</div>
</header>

<main>
	{@render children()}
</main>

<footer>
	<p>
		A homemade take on <a href="https://framed.wtf" rel="noopener">Framed</a>. Movie data from
		<a href="https://www.themoviedb.org" rel="noopener">TMDB</a> (this site isn't endorsed by them).
	</p>
	<p class="oss">
		<a class="gh" href="https://github.com/rcland12/framed" rel="noopener">
			<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor"
				><path
					d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
				/></svg
			>
			Open source on GitHub
		</a>
		<span class="sep">·</span> MIT licensed <span class="sep">·</span> © {new Date().getFullYear()}
		<a href="https://russellland.dev" rel="noopener">russellland.dev</a>
	</p>
</footer>

<Modal bind:open={help} title="How to play">
	<ol class="rules">
		<li>Every day there's a new movie, shown one frame at a time.</li>
		<li>
			Type a title and pick it from the list to guess, or press <b>Skip</b> to see the next frame.
		</li>
		<li>A wrong guess or a skip reveals another frame. You get six.</li>
		<li>Earlier frames stay available: tap the numbers under the picture.</li>
		<li>Finish the daily to unlock <b>Endless</b>, with as many random movies as you like.</li>
	</ol>
	<p class="muted">
		Sign in with your email to keep your streak across devices and get the puzzle in your inbox each
		morning.
	</p>
</Modal>

<style>
	.top {
		border-bottom: 1px solid var(--border);
		background: rgba(13, 13, 16, 0.9);
		backdrop-filter: blur(8px);
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.inner {
		max-width: 860px;
		margin: 0 auto;
		padding: 0.6rem 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.inner.wide {
		max-width: 1280px;
	}
	.logo {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		color: var(--text);
		text-decoration: none;
	}
	.word {
		font-family: var(--display);
		font-size: 2rem;
		letter-spacing: 0.12em;
		color: var(--accent);
		line-height: 1;
	}
	.ver {
		font-weight: 800;
		font-size: 0.85rem;
		color: var(--muted);
	}
	nav {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	nav a,
	.icon {
		color: var(--muted);
		padding: 0.35rem 0.6rem;
		border-radius: 6px;
		font-weight: 600;
		font-size: 0.95rem;
	}
	nav a:hover {
		color: var(--text);
		text-decoration: none;
		background: var(--surface);
	}
	nav a.active {
		color: var(--text);
	}
	.icon {
		background: none;
		border: 1px solid var(--border);
		width: 2rem;
		height: 2rem;
		padding: 0;
		border-radius: 50%;
		cursor: pointer;
	}
	.icon:hover {
		color: var(--text);
	}
	.account {
		border: 1px solid var(--border);
	}
	main {
		min-height: calc(100vh - 140px);
	}
	footer {
		text-align: center;
		color: var(--faint);
		font-size: 0.8rem;
		padding: 2rem 1rem;
	}
	footer a {
		color: var(--muted);
	}
	footer p {
		margin: 0.35rem 0;
	}
	.gh {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-weight: 600;
	}
	.gh:hover {
		color: var(--text);
	}
	.sep {
		margin: 0 0.25rem;
	}
	.rules {
		padding-left: 1.2rem;
		margin: 0 0 1rem;
	}
	.rules li {
		margin-bottom: 0.5rem;
	}
	@media (max-width: 520px) {
		.word {
			font-size: 1.6rem;
		}
		nav a,
		.icon {
			padding: 0.3rem 0.45rem;
			font-size: 0.88rem;
		}
	}
</style>
