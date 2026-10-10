<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ErrorProps } from './$types';

	/*
	 * THE FAILURE SCREEN FOR EVERY PAGE
	 * =================================
	 *
	 * SvelteKit 3 wraps every layout and page in a `<svelte:boundary>` of its own,
	 * and that boundary's failed state is the nearest `+error.svelte`. So this one
	 * file catches all of it: a `load` that calls `error(403, …)`, a query a page
	 * awaits that rejects with `error(404, …)`, and a bug that throws while a page
	 * renders, on the server and after a client-side navigation alike.
	 *
	 * `error` is an `App.Error`: `{ status, message }` plus our own `id`. It has
	 * already been through `handleError`, so `message` is either the sentence we
	 * wrote in `error(…)` or the hook's safe replacement for an unknown failure,
	 * and it is fit to show as it is.
	 *
	 * Read `error.message`, not `messageFrom(error, …)`. That helper is for the
	 * `catch` around a remote call, which receives an `HttpError` with the message
	 * one level down, in `body`. This object has no `body`, so the helper would
	 * show its fallback every single time — while a plausible sentence sat on
	 * screen and nothing looked broken.
	 */
	let { error }: ErrorProps = $props();

	const heading = $derived(error.status === 404 ? 'Not found' : 'Something went wrong');
</script>

<svelte:head>
	<title>{heading} — Halfpast</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container-narrow section">
	<div class="failure" role="alert">
		<h1>{heading}</h1>
		<p>{error.message}</p>

		<!--
			The same eight characters `handleError` wrote to the log next to the
			stack trace. Only unknown failures carry one; for those it is the
			difference between "it said error" and a support ticket somebody can
			actually trace.
		-->
		{#if error.id}
			<p class="reference">Reference <code>{error.id}</code></p>
		{/if}

		<a class="home" href={resolve('/')}>Back to the start</a>
	</div>
</div>

<style>
	.failure {
		padding: var(--space-6);
		background: var(--danger-soft);
		border: var(--border) solid var(--danger-line);
		border-radius: var(--radius-lg);
	}

	.failure h1 {
		font-size: var(--text-lg);
		margin-block-end: var(--space-2);
	}

	.reference {
		margin-block-start: var(--space-2);
		font-size: var(--text-sm);
		color: var(--ink-muted);
	}

	.home {
		display: inline-flex;
		align-items: center;
		margin-block-start: var(--space-4);
		padding: var(--space-2) var(--space-4);
		min-height: 2.75rem;
		background: var(--surface);
		border: var(--border) solid var(--line-strong);
		border-radius: var(--radius-md);
		color: var(--ink);
		font-weight: var(--weight-medium);
		text-decoration: none;
	}
</style>
