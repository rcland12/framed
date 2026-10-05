<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Unsubscribe · Framed 2.0</title></svelte:head>

<div class="page narrow">
	<div class="card">
		{#if form?.done || (data.email && !data.subscribed)}
			<h1>Unsubscribed</h1>
			<p>
				No more morning emails to <b>{data.email}</b>. You can turn them back on from your account.
			</p>
			<a class="btn" href="/">Back to the puzzle</a>
		{:else if data.email}
			<h1>Unsubscribe</h1>
			<p>Stop the daily puzzle email to <b>{data.email}</b>?</p>
			<form method="POST">
				<input type="hidden" name="token" value={data.token} />
				<button class="btn primary">Unsubscribe</button>
			</form>
		{:else}
			<h1>Link not valid</h1>
			<p class="muted">
				{form?.error ?? 'Sign in and change your email setting from your account.'}
			</p>
			<a class="btn" href="/account">Account</a>
		{/if}
	</div>
</div>

<style>
	.narrow {
		max-width: 460px;
		margin-top: 2rem;
	}
	h1 {
		margin-top: 0;
		font-family: var(--display);
		font-weight: 400;
		letter-spacing: 0.05em;
		font-size: 2.2rem;
	}
</style>
