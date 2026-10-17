<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ErrorProps } from './$types.js';

	/**
	 * The error page for anything a route throws — a `404` from `error(404)`,
	 * or a genuine failure that `handleError` turned into a message and an id.
	 *
	 * With SvelteKit 3 this is a real `<svelte:boundary>` around the page below
	 * it, on the server as well as the client: a component that throws while
	 * rendering lands here rather than taking the whole response down.
	 *
	 * The error is a prop, typed by the generated `ErrorProps` as `App.Error` —
	 * which always carries `status` and `message`, plus the `id` this app adds
	 * in `app.d.ts`. Nothing here needs `page` from `$app/state`.
	 */
	let { error }: ErrorProps = $props();

	const title = $derived(
		error.status === 404
			? 'Nothing here'
			: error.status >= 500
				? 'Something broke'
				: 'That did not work'
	);
</script>

<svelte:head>
	<title>{error.status} — Ostinato</title>
</svelte:head>

<section class="error page">
	<p class="error__status mono">{error.status}</p>
	<h1>{title}</h1>
	<p class="error__message">{error.message}</p>
	{#if error.id}
		<p class="hint">Reference <code>{error.id}</code> if you report this.</p>
	{/if}
	<p><a class="btn" href={resolve('/(app)/studio')}>Back to the studio</a></p>
</section>

<style>
	.error {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
		padding-block: var(--space-8);
	}

	.error__status {
		font-size: var(--fs-2xl);
		font-weight: var(--weight-bold);
		color: var(--accent);
		line-height: 1;
	}

	.error__message {
		color: var(--text-muted);
		max-width: var(--measure);
	}
</style>
