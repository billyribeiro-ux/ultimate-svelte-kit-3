<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<div class="error container">
	<p class="error__status">{page.status}</p>
	<h1>{page.error?.message ?? 'Something went wrong'}</h1>

	{#if page.error?.id}
		<!--
			The correlation id, shown deliberately.

			It is the only thing that connects what this person saw to the stack trace
			in the server log, and asking somebody to describe a 500 is asking them to
			do our debugging for us.
		-->
		<p class="error__id">Reference <code>{page.error.id}</code></p>
	{/if}

	<!-- `resolve()` even for `/`: the one way to build an internal link in SvelteKit 3. -->
	<p><a href={resolve('/')}>Back to the start</a></p>
</div>

<style>
	.error {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		align-items: flex-start;
		padding-block: var(--space-9);
	}

	.error__status {
		font-family: var(--font-mono);
		font-size: var(--fs-lg);
		color: var(--text-faint);
	}

	.error__id {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
</style>
