<script lang="ts">
	import { enhance } from '$app/forms';
	import type { AdminFrame } from '$lib/server/admin';

	let { data, form } = $props();

	const t = $derived(data.title);
	const placed = (frames: AdminFrame[]) => {
		const slots: (number | null)[] = [null, null, null, null, null, null];
		for (const f of frames) if (f.position) slots[f.position - 1] = f.id;
		return slots;
	};

	// Slot edits are local until saved. Reset whenever the server data changes.
	let slots = $derived(placed(data.frames));
	let target = $state<number | null>(null);
	let busy = $state('');
	let preview = $state<AdminFrame | null>(null);

	const byId = $derived(new Map(data.frames.map((f) => [f.id, f])));
	const dirty = $derived(placed(data.frames).join() !== slots.join());

	function choose(frameId: number) {
		const next = [...slots];
		const from = next.indexOf(frameId);
		let to = target ?? next.indexOf(null);
		if (to === -1) {
			alert('All six slots are full. Click a slot first to replace it.');
			return;
		}
		if (from !== -1) next[from] = next[to]; // swap when it's already placed
		next[to] = frameId;
		slots = next;
		target = null;
	}

	function move(i: number, d: number) {
		const j = i + d;
		if (j < 0 || j > 5) return;
		const next = [...slots];
		[next[i], next[j]] = [next[j], next[i]];
		slots = next;
	}

	function clear(i: number) {
		const next = [...slots];
		next[i] = null;
		slots = next;
	}

	const fmt = (s: number) => {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = Math.floor(s % 60);
		return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
	};
	const gb = (n: number | null) => (n ? `${(n / 1e9).toFixed(1)} GB` : '');

	const busyEnhance = (name: string) => () => {
		busy = name;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = '';
		};
	};

	const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
</script>

<svelte:head><title>{t.tmdb_title ?? t.title} · Admin</title></svelte:head>

<p><a href="/admin/titles">← Movies</a></p>

<div class="top">
	{#if t.poster}<img class="poster" src={t.poster} alt="" />{/if}
	<div class="info">
		<h1>
			{t.tmdb_title ?? t.title}
			{#if t.year}<span class="muted">({t.year})</span>{/if}
		</h1>
		<div class="tags">
			<span class="pill {t.status}">{t.status}</span>
			{#if t.missing}<span class="pill off">missing from NAS</span>{/if}
			{#if !t.enabled}<span class="pill off">disabled</span>{/if}
			{#if t.reviewed}<span class="pill on">reviewed by {t.reviewed_by}</span>{/if}
			{#each data.dailies as d (d.puzzle_date)}<span class="pill"
					>daily #{d.number} · {d.puzzle_date}</span
				>{/each}
			{#if data.plays.n}<span class="pill">{data.plays.won}/{data.plays.n} solved</span>{/if}
		</div>
		{#if t.error}<p class="err">{t.error}</p>{/if}
		<dl>
			<dt>Folder</dt>
			<dd>{t.folder}</dd>
			<dt>File</dt>
			<dd>{t.video_file} {gb(t.file_size)}</dd>
			{#if t.duration_s}<dt>Video</dt>
				<dd>
					{fmt(t.duration_s)} · {t.width}×{t.height}{t.hdr ? ' · HDR (tone-mapped)' : ''}{t.crop
						? ` · cropped to ${t.crop}`
						: ''}
				</dd>{/if}
			<dt>Links</dt>
			<dd>
				{#if t.imdb_id}<a
						href="https://www.imdb.com/title/{t.imdb_id}/"
						target="_blank"
						rel="noopener">IMDb</a
					>{/if}
				{#if t.tmdb_id}· <a
						href="https://www.themoviedb.org/movie/{t.tmdb_id}"
						target="_blank"
						rel="noopener">TMDB</a
					>{/if}
			</dd>
			{#if t.vote_count != null}<dt>TMDB</dt>
				<dd>
					{t.vote_count.toLocaleString()} votes · {t.vote_average?.toFixed(1)}★ · {t.genres.join(
						', '
					)} · {t.auto_daily ? 'well known enough for the daily' : 'too obscure for the daily'}
				</dd>{/if}
		</dl>
	</div>
</div>

{#if form?.message}<p class="flash">{form.message}</p>{/if}

<div class="panels">
	<form method="POST" action="?/settings" use:enhance={busyEnhance('settings')} class="card row">
		<label class="check"
			><input type="checkbox" name="enabled" checked={t.enabled} /> Playable</label
		>
		<label>
			Daily answer:
			<select name="daily_mode" class="input inline">
				<option value="auto" selected={t.daily_mode === 'auto'}
					>Auto ({t.auto_daily ? 'yes' : 'no'})</option
				>
				<option value="always" selected={t.daily_mode === 'always'}>Always allowed</option>
				<option value="never" selected={t.daily_mode === 'never'}>Never</option>
			</select>
		</label>
		<button class="btn small" disabled={!!busy}>Save</button>
	</form>
	<form method="POST" action="?/review" use:enhance={busyEnhance('review')} class="card row">
		<input type="hidden" name="reviewed" value={String(!t.reviewed)} />
		<span class="muted small"
			>{t.reviewed ? 'Frames have been checked.' : 'Frames not checked yet.'}</span
		>
		<button class="btn small {t.reviewed ? '' : 'primary'}" disabled={!!busy || dirty}>
			{t.reviewed ? 'Clear review' : 'Mark reviewed ✓'}
		</button>
	</form>
	<form method="POST" action="?/schedule" use:enhance={busyEnhance('schedule')} class="card row">
		<label
			>Make it the daily on <input
				class="input inline"
				type="date"
				name="date"
				min={tomorrow}
				required
			/></label
		>
		<button class="btn small" disabled={!!busy}>Schedule</button>
	</form>
</div>

<section class="card">
	<div class="sechead">
		<h2>The six, in play order</h2>
		<div class="row">
			{#if dirty}<span class="muted small">Unsaved changes</span>{/if}
			<button class="btn small" disabled={!dirty} onclick={() => (slots = placed(data.frames))}
				>Undo</button
			>
			<form method="POST" action="?/positions" use:enhance={busyEnhance('positions')}>
				<input type="hidden" name="frames" value={slots.filter((s) => s != null).join(',')} />
				<button
					class="btn small primary"
					disabled={!dirty || !!busy || slots.includes(null)}
					title={slots.includes(null) ? 'Fill all six slots' : ''}
				>
					Save order
				</button>
			</form>
		</div>
	</div>
	<p class="muted small">
		Frame 1 is shown first and should be the hardest; frame 6 should nearly give it away. Click a
		slot to select it, then click a candidate below to put it there.
	</p>
	<div class="slots">
		{#each slots as id, i (i)}
			{@const f = id != null ? byId.get(id) : null}
			<div class="slot" class:target={target === i}>
				<button
					class="pick"
					onclick={() => (target = target === i ? null : i)}
					aria-label="Select slot {i + 1}"
				>
					{#if f}
						<img src={f.url} alt="Slot {i + 1}" />
					{:else}
						<span class="empty">empty</span>
					{/if}
					<span class="num">{i + 1}</span>
				</button>
				<div class="slotbar">
					<button
						class="mini"
						onclick={() => move(i, -1)}
						disabled={i === 0}
						aria-label="Move earlier">◀</button
					>
					<span class="muted small">{f ? fmt(f.ts) : ''}</span>
					<button class="mini" onclick={() => move(i, 1)} disabled={i === 5} aria-label="Move later"
						>▶</button
					>
					<button class="mini" onclick={() => clear(i)} disabled={!f} aria-label="Remove">✕</button>
				</div>
			</div>
		{/each}
	</div>
</section>

<section class="card">
	<div class="sechead">
		<h2>Candidates <span class="muted">({data.frames.length})</span></h2>
		<div class="row tools">
			<form method="POST" action="?/addAt" use:enhance={busyEnhance('addAt')} class="row">
				<input class="input inline time" name="time" placeholder="1:02:30" aria-label="Time" />
				<button class="btn small" disabled={!!busy}
					>{busy === 'addAt' ? 'Grabbing…' : 'Grab frame at time'}</button
				>
			</form>
			<form method="POST" action="?/more" use:enhance={busyEnhance('more')}>
				<button class="btn small" disabled={!!busy || t.missing}
					>{busy === 'more' ? 'Pulling frames…' : '+8 random'}</button
				>
			</form>
			<form method="POST" action="?/autofill" use:enhance={busyEnhance('autofill')}>
				<button class="btn small" disabled={!!busy || !slots.includes(null) || dirty}
					>Auto-fill empty slots</button
				>
			</form>
		</div>
	</div>
	<div class="cands">
		{#each data.frames as f (f.id)}
			{@const at = slots.indexOf(f.id)}
			<div class="cand" class:inuse={at !== -1} class:rejected={f.rejected}>
				<button class="pick" onclick={() => choose(f.id)} title="Use this frame">
					<img src={f.url} alt="Frame at {fmt(f.ts)}" loading="lazy" />
					{#if at !== -1}<span class="num">{at + 1}</span>{/if}
				</button>
				<div class="cbar">
					<span class="small">{fmt(f.ts)}</span>
					<span class="muted small" title="brightness / contrast / entropy">
						{f.rejected ? 'auto-rejected · ' : ''}{f.source === 'manual' ? 'manual · ' : ''}score {f.score?.toFixed(
							0
						)}
					</span>
					<span class="grow"></span>
					<button class="mini" onclick={() => (preview = f)} aria-label="View large" title="View large">View</button>
					<form method="POST" action="?/deleteFrame" use:enhance={busyEnhance('del')}>
						<input type="hidden" name="frame" value={f.id} />
						<button class="mini" disabled={!!busy || dirty} aria-label="Delete frame" title="Delete frame">Del</button>
					</form>
				</div>
			</div>
		{/each}
	</div>
</section>

<section class="card">
	<h2>Reprocess</h2>
	<p class="muted small">
		Pull a fresh set of candidates from the file. “Keep chosen” leaves the six in place and replaces
		the rest; “Start over” deletes every frame and picks six again.
	</p>
	<div class="row">
		<form method="POST" action="?/reprocess" use:enhance={busyEnhance('re')}>
			<input type="hidden" name="mode" value="keep" />
			<button class="btn small" disabled={!!busy || t.missing}>Reprocess, keep chosen</button>
		</form>
		<form
			method="POST"
			action="?/reprocess"
			use:enhance={({ cancel }) => {
				if (!confirm('Delete every frame of this movie and start over?')) cancel();
				return busyEnhance('re')();
			}}
		>
			<input type="hidden" name="mode" value="reset" />
			<button class="btn small danger" disabled={!!busy || t.missing}>Start over</button>
		</form>
		{#if data.tmdb}
			<form method="POST" action="?/tmdb" use:enhance={busyEnhance('tmdb')}>
				<button class="btn small" disabled={!!busy}>Refresh TMDB</button>
			</form>
		{/if}
	</div>
</section>

{#if preview}
	<button class="lightbox" onclick={() => (preview = null)} aria-label="Close preview">
		<img src={preview.url} alt="" />
		<span>
			{fmt(preview.ts)} · {preview.width}×{preview.height} · brightness {preview.brightness?.toFixed(
				0
			)} · contrast {preview.contrast?.toFixed(0)} · entropy {preview.entropy?.toFixed(1)}
		</span>
	</button>
{/if}

<style>
	.top {
		display: flex;
		gap: 1.25rem;
		align-items: flex-start;
		margin-bottom: 1rem;
	}
	.poster {
		width: 120px;
		border-radius: 8px;
		border: 1px solid var(--border);
	}
	.info h1 {
		margin-bottom: 0.4rem;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.2rem 0.9rem;
		font-size: 0.88rem;
		margin: 0.75rem 0 0;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		word-break: break-word;
	}
	.err {
		color: var(--red);
	}
	.flash {
		background: rgba(245, 197, 24, 0.12);
		border: 1px solid rgba(245, 197, 24, 0.35);
		padding: 0.6rem 0.9rem;
		border-radius: 8px;
	}
	.panels {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.panels .card {
		padding: 0.75rem 1rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.panels .row {
		justify-content: space-between;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.check input {
		accent-color: var(--accent);
	}
	.input.inline {
		width: auto;
		padding: 0.3rem 0.5rem;
	}
	.time {
		width: 7rem !important;
	}
	section.card {
		margin-bottom: 1rem;
	}
	.sechead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}
	.sechead h2 {
		margin: 0;
	}
	.small {
		font-size: 0.8rem;
	}
	.slots {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.6rem;
	}
	.slot {
		border: 2px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		background: var(--surface-2);
	}
	.slot.target {
		border-color: var(--accent);
	}
	.pick {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: #000;
		aspect-ratio: 16 / 9;
		position: relative;
		cursor: pointer;
	}
	.pick img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.empty {
		color: var(--faint);
		font-size: 0.85rem;
	}
	.num {
		position: absolute;
		top: 4px;
		left: 4px;
		background: var(--accent);
		color: var(--accent-ink);
		font-weight: 800;
		font-size: 0.8rem;
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 50%;
		display: grid;
		place-items: center;
	}
	.slotbar,
	.cbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem;
		padding: 0.25rem 0.35rem;
	}
	.mini {
		background: none;
		border: 1px solid var(--border);
		border-radius: 5px;
		color: var(--muted);
		cursor: pointer;
		font-size: 0.75rem;
		padding: 0.1rem 0.35rem;
	}
	.mini:hover:not(:disabled) {
		color: var(--text);
	}
	.mini:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.cands {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 0.6rem;
		margin-top: 0.75rem;
	}
	.cand {
		border: 2px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		background: var(--surface-2);
	}
	.cand.inuse {
		border-color: var(--accent);
	}
	.cand.rejected img {
		opacity: 0.55;
	}
	.grow {
		flex: 1;
	}
	.lightbox {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.9);
		border: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 0.75rem;
		cursor: zoom-out;
		padding: 1rem;
	}
	.lightbox img {
		max-width: 100%;
		max-height: 85vh;
	}
	.lightbox span {
		color: var(--muted);
		font-size: 0.9rem;
	}
	@media (max-width: 800px) {
		.slots {
			grid-template-columns: repeat(3, 1fr);
		}
		.top {
			flex-direction: column;
		}
	}
</style>
