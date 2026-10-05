<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data, form } = $props();
	let busy = $state('');

	const busyEnhance = (name: string) => () => {
		busy = name;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = '';
		};
	};

	onMount(() => {
		// Live progress while the worker is running.
		const t = setInterval(() => {
			if (data.ingest.workers > 0 || data.ingest.scanning) void invalidateAll();
		}, 5000);
		return () => clearInterval(t);
	});

	const s = $derived(data.status);
	const done = $derived((s.ready ?? 0) + (s.error ?? 0));
	const total = $derived(done + (s.pending ?? 0) + (s.processing ?? 0));
</script>

<h1>Dashboard</h1>

{#if form?.message}<p class="flash">{form.message}</p>{/if}

<div class="tiles">
	<div class="card tile"><b>{data.totals.titles}</b><span>Movies in library</span></div>
	<div class="card tile"><b>{s.ready ?? 0}</b><span>Ready to play</span></div>
	<div class="card tile"><b>{data.totals.daily_ok}</b><span>Daily-eligible</span></div>
	<div class="card tile"><b>{data.totals.reviewed}</b><span>Reviewed</span></div>
	<div class="card tile"><b>{data.totals.users}</b><span>Accounts</span></div>
	<div class="card tile"><b>{data.totals.subscribers}</b><span>Email subscribers</span></div>
	<div class="card tile"><b>{data.totals.plays_today}</b><span>Games, last 24h</span></div>
	<div class="card tile"><b>{data.totals.frames}</b><span>Frames stored</span></div>
</div>

<div class="cols">
	<section class="card">
		<h2>Ingest</h2>
		<div class="bar"><div style:width="{total ? (done / total) * 100 : 0}%"></div></div>
		<p class="muted small">
			{done} of {total} processed · {s.pending ?? 0} pending · {s.processing ?? 0} processing ·
			<a href="/admin/titles?filter=error">{s.error ?? 0} failed</a> · {data.totals.missing} missing from
			the NAS
		</p>
		{#if data.ingest.active.length}
			<ul class="active">
				{#each data.ingest.active as a (a.id)}
					<li>
						<a href="/admin/titles/{a.id}">{a.title}</a> <span class="muted">– {a.step}</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.ingest.lastScan}
			<p class="muted small">
				Last scan {new Date(data.ingest.lastScan.at).toLocaleString()}: {data.ingest.lastScan
					.folders}
				folders, {data.ingest.lastScan.added} new, {data.ingest.lastScan.missing} gone.
				{#if data.ingest.lastScan.error}<span class="err">{data.ingest.lastScan.error}</span>{/if}
			</p>
		{/if}
		<div class="actions">
			<form method="POST" action="?/scan" use:enhance={busyEnhance('scan')}>
				<button class="btn" disabled={!!busy}
					>{busy === 'scan' ? 'Scanning…' : 'Scan library now'}</button
				>
			</form>
			<form method="POST" action="?/retry" use:enhance={busyEnhance('retry')}>
				<button class="btn" disabled={!!busy || !s.error}>Retry failed</button>
			</form>
			<form method="POST" action="?/tmdb" use:enhance={busyEnhance('tmdb')}>
				<button
					class="btn"
					disabled={!!busy || !data.tmdb}
					title={data.tmdb ? '' : 'Set TMDB_API_KEY'}
				>
					Re-run TMDB lookups
				</button>
			</form>
		</div>
		{#if !data.tmdb}
			<p class="warn small">
				TMDB is off (no TMDB_API_KEY): no posters, and every movie is daily-eligible.
			</p>
		{:else if data.totals.tmdb_pending}
			<p class="muted small">{data.totals.tmdb_pending} movies waiting for a TMDB lookup.</p>
		{/if}
	</section>

	<section class="card">
		<h2>Morning email</h2>
		{#if data.emails.length}
			<table>
				<thead><tr><th>Date</th><th>Sent</th><th>Failed</th></tr></thead>
				<tbody>
					{#each data.emails as e (e.run_date)}
						<tr><td>{e.run_date}</td><td>{e.sent}</td><td>{e.failed}</td></tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="muted">No emails sent yet.</p>
		{/if}
		<div class="actions">
			<form method="POST" action="?/testEmail" use:enhance={busyEnhance('test')}>
				<button class="btn" disabled={!!busy}
					>{busy === 'test' ? 'Sending…' : 'Send today’s email to me'}</button
				>
			</form>
			<form
				method="POST"
				action="?/sendNow"
				use:enhance={({ cancel }) => {
					if (
						!confirm(
							'Send today’s email to every subscriber now? It only ever goes out once a day.'
						)
					)
						cancel();
					return busyEnhance('send')();
				}}
			>
				<button class="btn" disabled={!!busy}>Send to everyone now</button>
			</form>
		</div>
	</section>
</div>

<div class="cols">
	<section class="card">
		<h2>Recently processed</h2>
		<ul class="plain">
			{#each data.recent as r (r.id)}
				<li><a href="/admin/titles/{r.id}">{r.title} {r.year ? `(${r.year})` : ''}</a></li>
			{:else}
				<li class="muted">Nothing yet.</li>
			{/each}
		</ul>
	</section>
	<section class="card">
		<h2>Failures</h2>
		<ul class="plain">
			{#each data.errors as r (r.id)}
				<li>
					<a href="/admin/titles/{r.id}">{r.title} {r.year ? `(${r.year})` : ''}</a>
					<div class="muted small">{r.error}</div>
				</li>
			{:else}
				<li class="muted">None.</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.flash {
		background: rgba(245, 197, 24, 0.12);
		border: 1px solid rgba(245, 197, 24, 0.35);
		padding: 0.6rem 0.9rem;
		border-radius: 8px;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.tile {
		padding: 0.9rem 1rem;
	}
	.tile b {
		display: block;
		font-size: 1.6rem;
		font-variant-numeric: tabular-nums;
	}
	.tile span {
		color: var(--muted);
		font-size: 0.8rem;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.bar {
		height: 10px;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar div {
		height: 100%;
		background: var(--accent);
		transition: width 0.5s;
	}
	.small {
		font-size: 0.85rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.active {
		margin: 0.5rem 0;
		padding-left: 1.1rem;
		font-size: 0.9rem;
	}
	.plain {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	.warn {
		color: var(--accent);
	}
	.err {
		color: var(--red);
	}
</style>
