<script lang="ts">
	import type { ErrorProps } from './$types';

	/*
	 * Where a page that failed ends up — a refused load, a query that threw while
	 * the page rendered, a route that does not exist.
	 *
	 * `error` is an `App.Error`: a plain `{ status, message }` object that has
	 * already been through `handleError`, not an `Error` instance. So the message
	 * is `error.message`, read directly. The layout used to catch these with its
	 * own `<svelte:boundary>` and guarded the read with `error instanceof Error`
	 * — which is never true of an `App.Error`, so the fallback text won every
	 * time and nobody was ever told the server's actual reason.
	 *
	 * It also never ran. SvelteKit 3 wraps every page in a boundary of its own
	 * that renders the nearest `+error.svelte` (its built-in one, if the app has
	 * none), so a page's failure is caught before it reaches anything in the
	 * layout. This file is how you put your own face on that.
	 *
	 * For an unexpected error the message is the one `handleError` chose to
	 * expose, with the id that finds it in the server log — never the raw
	 * exception.
	 */
	let { error }: ErrorProps = $props();
</script>

<div class="container card stack failure" role="alert">
	<!-- A 4xx is the venue answering, not failing: a refusal, or a page that is
	     not there. Only a 5xx is "something went wrong". -->
	<h1>{error.status >= 500 ? 'Something went wrong' : 'We cannot show you this'}</h1>
	<p class="muted">{error.message}</p>
	{#if error.id}
		<p class="small faint mono">Reference {error.id}</p>
	{/if}
	<!--
		A full reload rather than a client-side navigation. A failed boundary stays
		failed until something resets it, and a link to the page you are already on
		only re-runs its data in SvelteKit 3; a fresh document is the retry that is
		certain to start clean.
	-->
	<button type="button" onclick={() => location.reload()}>Try again</button>
</div>

<style>
	.failure {
		margin-block-start: var(--space-6);
	}
	.failure button {
		align-self: flex-start;
	}
</style>
