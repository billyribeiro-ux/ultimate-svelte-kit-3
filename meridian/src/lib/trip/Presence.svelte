<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { TripState } from './state.svelte.ts';

	/**
	 * Who else is looking at this trip right now: one chip per person, with
	 * the stop under their pointer in the tooltip. Fed by the live query; the
	 * server drops anybody who has not been heard from in thirty seconds.
	 */
	interface Props {
		view: TripState;
		viewerId: string | null;
	}

	let { view, viewerId }: Props = $props();

	const others = $derived(view.presence.filter((p) => p.userId !== viewerId));

	const initials = (name: string) =>
		name
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
</script>

{#if others.length > 0}
	<ul class="presence" role="list" aria-label={m.companions_here()}>
		{#each others as person (person.userId)}
			{@const stop = person.stopId ? view.document.stops.find((s) => s.id === person.stopId) : null}
			<li
				class="presence__chip"
				title={stop
					? m.presence_looking({ name: person.name, stop: stop.name })
					: m.presence_here({ name: person.name })}
			>
				<span class="presence__avatar" aria-hidden="true">{initials(person.name)}</span>
				<span class="presence__name">{person.name}</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.presence {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.presence__chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0.1rem 0.5rem 0.1rem 0.15rem;
		border-radius: var(--radius-pill);
		background: var(--sea-soft);
		color: var(--sea);
		font-size: var(--text-xs);
		font-weight: 500;
	}

	.presence__avatar {
		display: grid;
		place-items: center;
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 50%;
		background: var(--sea);
		color: light-dark(#fff, #052926);
		font-size: 0.65rem;
		font-weight: 700;
	}
</style>
