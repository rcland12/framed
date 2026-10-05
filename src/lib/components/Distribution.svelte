<script lang="ts">
	/** Solved-on-frame counts (index 0..5) plus failures (index 6), as horizontal bars. */
	let { counts, highlight = -1 }: { counts: number[]; highlight?: number } = $props();
	const max = $derived(Math.max(1, ...counts));
</script>

<div class="dist">
	{#each counts as n, i (i)}
		<div class="row">
			<span class="label">{i < counts.length - 1 ? i + 1 : '✕'}</span>
			<div class="track">
				<div
					class="bar"
					class:hl={i === highlight}
					class:fail={i === counts.length - 1}
					style:width="{Math.max(n / max, 0.04) * 100}%"
				>
					{n}
				</div>
			</div>
		</div>
	{/each}
</div>

<style>
	.dist {
		display: grid;
		gap: 4px;
	}
	.row {
		display: grid;
		grid-template-columns: 1.2rem 1fr;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
	}
	.label {
		color: var(--muted);
		text-align: center;
		font-weight: 600;
	}
	.bar {
		background: var(--surface-2);
		border: 1px solid var(--border);
		color: var(--text);
		padding: 0 0.4rem;
		border-radius: 4px;
		text-align: right;
		font-weight: 700;
		min-width: 1.6rem;
		font-variant-numeric: tabular-nums;
	}
	.bar.hl {
		background: var(--green);
		border-color: var(--green);
		color: #06120a;
	}
	.bar.fail.hl {
		background: var(--red);
		border-color: var(--red);
		color: #fff;
	}
</style>
