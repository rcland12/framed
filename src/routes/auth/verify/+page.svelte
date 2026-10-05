<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Sign in · Framed 2.0</title></svelte:head>

<div class="page narrow">
	<div class="card">
		{#if data.email && !form?.error}
			<h1>Welcome</h1>
			<p>Sign in as <b>{data.email}</b>?</p>
			<form method="POST">
				<input type="hidden" name="token" value={data.token} />
				<button class="btn primary">Sign in</button>
			</form>
		{:else}
			<h1>Link expired</h1>
			<p class="muted">
				{form?.error ?? 'This sign-in link has expired or was already used.'}
			</p>
			<a class="btn primary" href="/login">Send a new link</a>
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
