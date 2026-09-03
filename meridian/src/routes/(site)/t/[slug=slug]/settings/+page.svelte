<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { page } from '$app/state';
	import { tripBySlug } from '#lib/remote/trips.remote.ts';
	import EmbedSection from './EmbedSection.svelte';
	import SettingsForm from './SettingsForm.svelte';

	const slug = $derived(page.params.slug ?? '');

	/*
	 * One query, read two ways. `await query` below gives the first render
	 * its value and blocks the page until it is there. `query.current` is the
	 * same value as a reactive read: when the form saves with
	 * `.updates(tripBySlug(slug))`, the server sends the refreshed trip back
	 * in the same response, the cache is set, and everything reading
	 * `.current` — the embed section — re-renders with it. `undefined` only
	 * before the first load, which the `await` has already waited out.
	 */
	const query = $derived(tripBySlug(slug));
	const visibility = $derived(query.current?.document.trip.visibility ?? 'private');
</script>

<!--
	Owner only. The remote function already refuses to *change* anything for
	anybody else; this refuses to *show* the page, with a 403 rather than a
	404 because a member who is not the owner already knows the trip exists.
-->
{const initial = await query}
{#if initial.role !== 'owner'}
	{error(403, 'Only the owner can change a trip.')}
{/if}

{#key slug}
	<SettingsForm trip={initial.document.trip} />
{/key}

<section class="container embed">
	<EmbedSection {slug} {visibility} />
</section>

<style>
	.embed {
		max-width: 40rem;
		padding-block-end: var(--space-8);
	}
</style>
