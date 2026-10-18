<script lang="ts">
	import { error } from '@sveltejs/kit';
	import { m } from '#lib/paraglide/messages.js';
	import { tripBySlug } from '#lib/remote/trips.remote.ts';
	import type { PageProps } from './$types';
	import DeleteTrip from './DeleteTrip.svelte';
	import EmbedSection from './EmbedSection.svelte';
	import SettingsForm from './SettingsForm.svelte';

	// The route's own parameters, typed by the matcher in `src/params.ts` (the course chapter `environment-and-hooks` says how).
	let { params }: PageProps = $props();
</script>

<!--
	ONE QUERY, FOLLOWED
	-------------------
	Both declarations are `$derived`. When the form saves with
	`.updates(tripBySlug(slug))`, the server sends the refreshed trip back in
	the same response, the query's value changes, and everything below that
	reads `trip` — the form, and the embed section that only shows its code
	for a trip visible by link — is drawn again from the new one. A bare
	`{const}` would await the first answer and keep it for as long as the
	page is open: the embed section would still say "private" after a save
	that made the trip public.

	Owner only. The remote function already refuses to *change* anything for
	anybody else; this refuses to *show* the page, with a 403 rather than a
	404 because a member who is not the owner already knows the trip exists.
-->
{const { role, document } = $derived(await tripBySlug(params.slug))}
{#if role !== 'owner'}
	{error(403, m.error_owner_only())}
{/if}
{const trip = $derived(document.trip)}

{#key params.slug}
	<SettingsForm {trip} />
{/key}

<section class="container embed">
	<EmbedSection slug={params.slug} visibility={trip.visibility} />
</section>

<!-- Last, after everything that can be undone. -->
<section class="container danger-zone">
	<DeleteTrip tripId={trip.id} />
</section>

<style>
	.embed,
	.danger-zone {
		max-width: 40rem;
	}

	.danger-zone {
		padding-block: var(--space-6) var(--section);
	}
</style>
