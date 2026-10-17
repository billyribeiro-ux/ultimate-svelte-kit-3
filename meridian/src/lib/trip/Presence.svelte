<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { TripState } from './state.svelte.ts';

	/**
	 * Who else is looking at this trip right now: an overlapping stack of
	 * initials, with the person's name beside each from 48em and visually
	 * hidden below it — still read out, still found by a test. The stop
	 * under their pointer is in the tooltip. Fed by the live query; the
	 * server drops anybody who has not been heard from in thirty seconds.
	 *
	 * Nobody arrives with a bounce. A chip appearing is information; a chip
	 * bouncing is a slot machine.
	 */
	interface Props {
		view: TripState;
		viewerId: string | null;
	}

	let { view, viewerId }: Props = $props();

	const others = $derived(view.presence.filter((p) => p.userId !== viewerId));
	/* Four faces, then "+N": a crowd is a number, not a row of circles. */
	const shown = $derived(others.slice(0, 4));
	const more = $derived(others.length - shown.length);
	/*
	 * The people behind "+N" are still in the list, in words: "and 2 more:
	 * Ana and Cal". A list named "here now" has to contain everybody who is.
	 */
	const list = new Intl.ListFormat(getLocale(), { type: 'conjunction' });
	const rest = $derived(
		m.presence_more({ count: more, names: list.format(others.slice(4).map((p) => p.name)) })
	);

	const initials = (name: string) =>
		name
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
</script>

{#if others.length > 0}
	<ul class="presence" role="list" aria-label={m.companions_here()}>
		{#each shown as person (person.userId)}
			{const stop = $derived(
				person.stopId ? view.document.stops.find((s) => s.id === person.stopId) : null
			)}
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
		{#if more > 0}
			<li class="presence__chip presence__more" title={rest}>
				<span class="presence__avatar presence__avatar--more tabular" aria-hidden="true"
					>+{more}</span
				>
				<span class="visually-hidden">{rest}</span>
			</li>
		{/if}
	</ul>
{/if}

<style>
	.presence {
		display: flex;
		align-items: center;
	}

	.presence__chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--sea);
		font-size: var(--text-xs);
		font-weight: 500;
	}

	/* From the second chip on, the avatars overlap by 0.4rem; the paper ring keeps each one legible on the next. */
	.presence__chip + .presence__chip {
		margin-inline-start: -0.4rem;
	}

	.presence__avatar {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		background: var(--sea);
		color: var(--on-sea);
		font-size: 0.65rem;
		font-weight: 700;
		box-shadow: 0 0 0 2px var(--paper);
	}

	.presence__avatar--more {
		background: var(--paper-3);
		color: var(--ink-2);
	}

	/* The name is spoken, and found by `toContainText`, before it is seen. */
	.presence__name {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	@media (min-width: 48em) {
		.presence {
			gap: var(--space-2);
		}

		.presence__chip {
			padding: 0.1rem 0.6rem 0.1rem 0.15rem;
			border-radius: var(--radius-pill);
			background: var(--sea-soft);
		}

		.presence__chip + .presence__chip {
			margin-inline-start: 0;
		}

		.presence__avatar {
			width: 1.4rem;
			height: 1.4rem;
			box-shadow: none;
		}

		.presence__name {
			position: static;
			width: auto;
			height: auto;
			overflow: visible;
			clip: auto;
		}
	}
</style>
