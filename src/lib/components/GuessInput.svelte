<script lang="ts">
	import { onMount } from 'svelte';
	import type { TitleOption } from '$lib/types';
	import { index, loadTitles, search, type Indexed } from './titles';

	let {
		onpick,
		exclude = [],
		disabled = false,
		placeholder = 'Search for a movie…',
		autofocus = false
	}: {
		onpick: (t: TitleOption) => void;
		exclude?: (number | null)[];
		disabled?: boolean;
		placeholder?: string;
		autofocus?: boolean;
	} = $props();

	let all: Indexed[] = $state([]);
	let failed = $state(false);
	let q = $state('');
	let open = $state(false);
	let active = $state(0);
	let input: HTMLInputElement | undefined = $state();
	const listId = `guess-list-${Math.random().toString(36).slice(2, 8)}`;

	onMount(() => {
		loadTitles()
			.then((list) => (all = index(list)))
			.catch(() => (failed = true));
		if (autofocus && matchMedia('(pointer: fine)').matches) input?.focus();
	});

	const results = $derived(search(all, q).filter((t) => !exclude.includes(t.id)));

	$effect(() => {
		// Keep the highlight inside the list as it changes.
		if (active >= results.length) active = 0;
	});

	function pick(t: TitleOption) {
		onpick(t);
		q = '';
		open = false;
		active = 0;
	}

	function onkeydown(e: KeyboardEvent) {
		if (!results.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			open = true;
			active = (active + 1) % results.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active - 1 + results.length) % results.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (open && results[active]) pick(results[active]);
		} else if (e.key === 'Escape') {
			open = false;
		}
	}
</script>

<div class="combo">
	<input
		bind:this={input}
		bind:value={q}
		class="input"
		type="text"
		role="combobox"
		aria-expanded={open && results.length > 0}
		aria-controls={listId}
		aria-autocomplete="list"
		aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
		autocomplete="off"
		autocapitalize="off"
		spellcheck="false"
		placeholder={failed ? 'Couldn’t load the movie list – refresh to try again' : placeholder}
		{disabled}
		oninput={() => {
			open = true;
			active = 0;
		}}
		onfocus={() => (open = true)}
		onblur={() => setTimeout(() => (open = false), 150)}
		{onkeydown}
	/>
	{#if open && results.length}
		<ul id={listId} role="listbox">
			{#each results as t, i (t.id)}
				<li
					id="{listId}-{i}"
					role="option"
					aria-selected={i === active}
					class:active={i === active}
					onmousedown={(e) => {
						e.preventDefault();
						pick(t);
					}}
					onmouseenter={() => (active = i)}
				>
					{t.title}
					{#if t.year}<span class="year">{t.year}</span>{/if}
				</li>
			{/each}
		</ul>
	{:else if open && q.trim().length > 1 && all.length}
		<ul id={listId} role="listbox"><li class="none">No match in the library</li></ul>
	{/if}
</div>

<style>
	.combo {
		position: relative;
		flex: 1;
		min-width: 0;
	}
	ul {
		position: absolute;
		left: 0;
		right: 0;
		bottom: calc(100% + 6px);
		margin: 0;
		padding: 0.3rem;
		list-style: none;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: 0 -12px 30px rgba(0, 0, 0, 0.5);
		z-index: 10;
		max-height: 320px;
		overflow-y: auto;
	}
	li {
		padding: 0.5rem 0.7rem;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}
	li.active {
		background: #34343e;
	}
	.year {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.none {
		color: var(--muted);
		cursor: default;
	}
</style>
