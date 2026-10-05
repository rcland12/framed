<script lang="ts">
	import { page } from '$app/state';

	let { data } = $props();

	function href(changes: Record<string, string | number>) {
		const u = new URL(page.url);
		for (const [k, v] of Object.entries(changes)) {
			if (v === '' || v === 'all' || (k === 'page' && v === 1) || (k === 'sort' && v === 'title'))
				u.searchParams.delete(k);
			else u.searchParams.set(k, String(v));
		}
		if (!('page' in changes)) u.searchParams.delete('page');
		return u.pathname + u.search;
	}
</script>

<div class="head">
	<h1>Movies <span class="muted">({data.total})</span></h1>
	<form method="GET" class="search">
		<input class="input" name="q" value={data.q} placeholder="Search title or tt-id…" />
		{#if data.filter !== 'all'}<input type="hidden" name="filter" value={data.filter} />{/if}
		{#if data.sort !== 'title'}<input type="hidden" name="sort" value={data.sort} />{/if}
	</form>
</div>

<div class="filters">
	{#each data.filters as f (f)}
		<a class="chip" class:on={data.filter === f} href={href({ filter: f })}>{f}</a>
	{/each}
	<span class="spacer"></span>
	<span class="muted small">Sort:</span>
	{#each data.sorts as s (s)}
		<a class="chip" class:on={data.sort === s} href={href({ sort: s })}>{s}</a>
	{/each}
</div>

<div class="grid">
	{#each data.rows as t (t.id)}
		<a class="item card" href="/admin/titles/{t.id}">
			<div class="thumb">
				{#if t.frame}
					<img src={t.frame} alt="" loading="lazy" />
				{:else if t.poster}
					<img src={t.poster} alt="" loading="lazy" class="poster" />
				{/if}
			</div>
			<div class="meta">
				<div class="name">
					{t.title}
					{#if t.year}<span class="muted">{t.year}</span>{/if}
				</div>
				<div class="tags">
					<span class="pill {t.status}">{t.status}</span>
					{#if t.missing}<span class="pill off">missing</span>{/if}
					{#if !t.enabled}<span class="pill off">off</span>{/if}
					{#if t.reviewed}<span class="pill on">reviewed</span>{/if}
					{#if !t.dailyOk}<span class="pill">no daily</span>{/if}
					{#if t.usedOn}<span class="pill">daily {t.usedOn}</span>{/if}
					{#if t.votes != null}<span class="pill">{t.votes.toLocaleString()} votes</span>{/if}
				</div>
				{#if t.error}<div class="err small">{t.error}</div>{/if}
			</div>
		</a>
	{:else}
		<p class="muted">Nothing matches.</p>
	{/each}
</div>

{#if data.pages > 1}
	<div class="pager">
		{#if data.page > 1}<a class="btn small" href={href({ page: data.page - 1 })}>← Prev</a>{/if}
		<span class="muted">Page {data.page} of {data.pages}</span>
		{#if data.page < data.pages}<a class="btn small" href={href({ page: data.page + 1 })}>Next →</a
			>{/if}
	</div>
{/if}

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}
	.head h1 {
		margin: 0;
	}
	.search {
		width: min(360px, 100%);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
		margin-bottom: 1rem;
	}
	.spacer {
		flex: 1;
	}
	.chip {
		padding: 0.2rem 0.7rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		color: var(--muted);
		font-size: 0.85rem;
	}
	.chip.on {
		background: var(--accent);
		color: var(--accent-ink);
		border-color: var(--accent);
	}
	.chip:hover {
		text-decoration: none;
		color: var(--text);
	}
	.chip.on:hover {
		color: var(--accent-ink);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.75rem;
	}
	.item {
		padding: 0;
		overflow: hidden;
		color: var(--text);
		display: flex;
		flex-direction: column;
	}
	.item:hover {
		text-decoration: none;
		border-color: #45454f;
	}
	.thumb {
		aspect-ratio: 16 / 9;
		background: #000;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.thumb img.poster {
		object-fit: contain;
	}
	.meta {
		padding: 0.6rem 0.7rem 0.7rem;
		display: grid;
		gap: 0.35rem;
	}
	.name {
		font-weight: 600;
		line-height: 1.3;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.small {
		font-size: 0.8rem;
	}
	.err {
		color: var(--red);
	}
	.pager {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		margin-top: 1.25rem;
	}
</style>
