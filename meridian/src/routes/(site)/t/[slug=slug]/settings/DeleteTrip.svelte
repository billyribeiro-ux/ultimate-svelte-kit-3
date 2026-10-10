<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { deleteTrip } from '#lib/remote/trips.remote.ts';

	/**
	 * The danger zone, last on the page: the one thing here that cannot be
	 * undone comes after everything that can, where nobody reaches it on the
	 * way to something else.
	 */
	interface Props {
		tripId: string;
	}

	let { tripId }: Props = $props();
</script>

<!-- A remote form: deleting works with JavaScript off, and asks first when it is on. -->
<form
	class="card card--pad danger stack"
	{...deleteTrip}
	onsubmit={(event) => {
		if (!confirm(m.trip_delete_confirm())) event.preventDefault();
	}}
>
	<input {...deleteTrip.fields.id.as('hidden', tripId)} />
	<!-- An h2: a section of the page of its own, not a part of the embed section before it. -->
	<h2 class="danger__title">{m.trip_delete()}</h2>
	<p class="danger__text">{m.settings_danger()}</p>
	<div class="actions">
		<button class="btn btn--danger" type="submit">{m.trip_delete()}</button>
	</div>
</form>

<style>
	/* A card whose border is a whisper of coral, and the one solid destructive button in the product. */
	.danger {
		border-color: var(--coral-soft);
	}

	/* An h2 in the outline, at an h3's size: the danger zone is a section, not a headline. */
	.danger__title {
		color: var(--coral);
		font-size: var(--text-lg);
		letter-spacing: 0;
	}

	.danger__text {
		color: var(--ink-2);
		font-size: var(--text-sm);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
	}
</style>
