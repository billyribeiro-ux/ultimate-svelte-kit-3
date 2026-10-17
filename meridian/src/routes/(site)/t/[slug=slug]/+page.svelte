<script lang="ts">
	import { tripBySlug } from '#lib/remote/trips.remote.ts';
	import TripView from '#lib/trip/TripView.svelte';
	import type { PageProps } from './$types';

	/*
	 * `params` is this route's, typed from `./$types`: `params.slug` is a
	 * string the matcher in `src/params.ts` has already accepted, so there is
	 * nothing to default and nothing to check again. `page.params` from
	 * `$app/state` holds the same value as global state typed for every
	 * route at once — `slug` may be absent there — which is how a `?? ''`
	 * creeps in and sends an empty string to a query that will only refuse it.
	 */
	let { params }: PageProps = $props();
	const slug = $derived(params.slug);
</script>

<!--
	One `await`, in the markup, with no boundary around it.

	No `pending` snippet, because on the server a boundary with `pending`
	renders that snippet and skips the rest — the trip would arrive as a
	placeholder and a second request. No `failed` snippet either, because the
	failure that matters here is a 404 (a private trip, a slug that is not
	one of ours), and that belongs to `+error.svelte`, in the right language,
	with the right status — which is where an uncaught error from a remote
	function goes.

	In the browser, SvelteKit holds a navigation until the await settles, so
	nothing flashes; keyed on the slug, a different trip is a fresh view.
-->
{const initial = $derived(await tripBySlug(slug))}

{#key slug}
	<TripView {initial} {slug} />
{/key}
