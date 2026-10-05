<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();
	const links = [
		['/admin', 'Dashboard'],
		['/admin/titles', 'Movies'],
		['/admin/schedule', 'Schedule'],
		['/admin/users', 'Users']
	] as const;
	const here = (href: string) =>
		href === '/admin' ? page.url.pathname === '/admin' : page.url.pathname.startsWith(href);
</script>

<svelte:head><title>Admin · Framed 2.0</title></svelte:head>

<div class="admin">
	<nav>
		{#each links as [href, label] (href)}
			<a {href} class:active={here(href)}>{label}</a>
		{/each}
	</nav>
	{@render children()}
</div>

<style>
	.admin {
		max-width: 1280px;
		margin: 0 auto;
		padding: 1rem 1rem 4rem;
	}
	nav {
		display: flex;
		gap: 0.3rem;
		margin-bottom: 1.25rem;
		border-bottom: 1px solid var(--border);
		overflow-x: auto;
	}
	nav a {
		padding: 0.5rem 0.9rem;
		color: var(--muted);
		font-weight: 600;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		white-space: nowrap;
	}
	nav a:hover {
		color: var(--text);
		text-decoration: none;
	}
	nav a.active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}
	:global(.admin h1) {
		margin: 0 0 1rem;
		font-size: 1.5rem;
	}
	:global(.admin h2) {
		margin: 0 0 0.75rem;
		font-size: 1.1rem;
	}
	:global(.admin table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	:global(.admin th),
	:global(.admin td) {
		text-align: left;
		padding: 0.45rem 0.6rem;
		border-bottom: 1px solid var(--border);
		vertical-align: middle;
	}
	:global(.admin th) {
		color: var(--muted);
		font-weight: 600;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	:global(.pill) {
		display: inline-block;
		padding: 0.05rem 0.5rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 700;
		background: var(--surface-2);
		border: 1px solid var(--border);
		color: var(--muted);
	}
	:global(.pill.ready),
	:global(.pill.on) {
		color: var(--green);
		border-color: rgba(63, 185, 80, 0.4);
	}
	:global(.pill.error),
	:global(.pill.off) {
		color: var(--red);
		border-color: rgba(229, 72, 77, 0.4);
	}
	:global(.pill.pending),
	:global(.pill.processing) {
		color: var(--accent);
		border-color: rgba(245, 197, 24, 0.4);
	}
</style>
