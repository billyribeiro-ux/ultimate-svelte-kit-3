<script lang="ts">
	import { page } from '$app/state';
	import { tripBySlug } from '#lib/remote/trips.remote.ts';
	import TripView from '#lib/trip/TripView.svelte';

	const slug = $derived(page.params.slug ?? '');
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
{const initial = await tripBySlug(slug)}

{#key slug}
	<TripView {initial} {slug} />
{/key}
