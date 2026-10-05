<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		children
	}: { open: boolean; title: string; children: Snippet } = $props();
	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	onclick={(e) => {
		if (e.target === dialog) open = false;
	}}
>
	<div class="box">
		<header>
			<h2>{title}</h2>
			<button class="x" onclick={() => (open = false)} aria-label="Close">✕</button>
		</header>
		{@render children()}
	</div>
</dialog>

<style>
	dialog {
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: 14px;
		padding: 0;
		width: min(480px, calc(100vw - 2rem));
	}
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.7);
	}
	.box {
		padding: 1.25rem 1.5rem 1.5rem;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}
	h2 {
		margin: 0;
		font-family: var(--display);
		letter-spacing: 0.06em;
		font-size: 1.7rem;
		font-weight: 400;
	}
	.x {
		background: none;
		border: none;
		color: var(--muted);
		font-size: 1.1rem;
		cursor: pointer;
	}
</style>
