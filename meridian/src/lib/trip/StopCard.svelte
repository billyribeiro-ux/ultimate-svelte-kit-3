<script lang="ts">
	import { DotsSixVerticalIcon, PencilSimpleIcon, TrashIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { Stop } from '#lib/server/db/schema.ts';
	import { KIND_ICONS, KIND_LABELS } from './kinds.ts';

	interface Props {
		stop: Stop;
		/** Position along the whole route, or `null` for an idea. */
		number: number | null;
		selected: boolean;
		editable: boolean;
		/** Names of companions whose pointer is on this stop. */
		lookers: readonly string[];
		/** Just added: the card lights up once and fades back. */
		fresh?: boolean;
		onselect: () => void;
		onedit?: () => void;
		onremove?: () => void;
	}

	let {
		stop,
		number,
		selected,
		editable,
		lookers,
		fresh = false,
		onselect,
		onedit,
		onremove
	}: Props = $props();

	const Icon = $derived(KIND_ICONS[stop.kind]);

	const initials = (name: string) =>
		name
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
</script>

<article
	class="stop"
	class:stop--selected={selected}
	data-kind={stop.kind}
	data-stop={stop.id}
	data-fresh={fresh ? '' : undefined}
>
	<!-- The grip is always there and always honest: dimmed until the card is hovered, full on a touch screen. -->
	{#if editable}
		<span class="stop__grip" aria-hidden="true"><DotsSixVerticalIcon size={16} /></span>
	{/if}

	<span class="stop__number tabular" class:stop__number--idea={number === null} aria-hidden="true">
		{#if number !== null}{number}{:else}<Icon size={14} />{/if}
	</span>

	<div class="stop__body">
		<!-- The name is a button: selecting a stop highlights it on the map. -->
		<button class="stop__name" type="button" aria-pressed={selected} onclick={onselect}>
			{stop.name}
		</button>
		<p class="stop__meta">
			<span class="chip"><Icon size={12} aria-hidden="true" /> {KIND_LABELS[stop.kind]()}</span>
			{#each lookers as name (name)}
				<span class="chip chip--sea stop__looker">
					<span class="stop__avatar" aria-hidden="true">{initials(name)}</span>
					<span>{name}</span>
				</span>
			{/each}
		</p>
		{#if stop.notes}
			<p class="stop__notes">{stop.notes}</p>
		{/if}
	</div>

	{#if editable}
		<div class="stop__actions">
			<button
				class="btn btn--icon btn--ghost btn--sm"
				type="button"
				title={m.stop_edit()}
				aria-label={m.stop_edit()}
				onclick={onedit}
			>
				<PencilSimpleIcon size={16} aria-hidden="true" />
			</button>
			<button
				class="btn btn--icon btn--ghost btn--sm"
				type="button"
				title={m.stop_remove()}
				aria-label={m.stop_remove()}
				onclick={onremove}
			>
				<TrashIcon size={16} aria-hidden="true" />
			</button>
		</div>
	{/if}
</article>

<style>
	/*
	 * The 3px bar on the left is the kind legend; `overflow: hidden` lets
	 * the card's radius clip its corners. The only thing that transitions is
	 * the ring: selection grows it from nothing to 2px of the kind colour.
	 * Nothing lifts — a card in a sortable list that rose on hover would
	 * look like it was already being dragged.
	 */
	/*
	 * Named areas, so the name shares its row with the actions and the meta
	 * and notes run underneath both: on a touch screen the two buttons are
	 * always there, and a notes column that stopped at them would clip a
	 * sentence beside empty space.
	 */
	.stop {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr) auto;
		grid-template-areas:
			'grip number name actions'
			'. . meta meta'
			'. . notes notes';
		align-items: start;
		gap: var(--space-1) var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--line);
		border-left: 3px solid var(--kind, var(--line-2));
		border-radius: var(--radius);
		background: var(--paper-2);
		overflow: hidden;
		transition:
			box-shadow var(--dur-2) var(--ease-out),
			border-color var(--dur-2) var(--ease-out);
	}

	/* Grip and actions come and go together (both are an editor's), so a viewer's card has neither column. */
	.stop:not(:has(.stop__grip)) {
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-areas:
			'number name'
			'. meta'
			'. notes';
	}

	@media (hover: hover) {
		.stop:hover {
			border-color: var(--line-2);
			border-left-color: var(--kind, var(--line-2));
		}
	}

	.stop--selected {
		box-shadow:
			0 0 0 2px var(--kind, var(--sea)),
			var(--shadow-1);
	}

	/* Just added: a wash of the soft sea that fades back to paper. A highlight, not a bounce. */
	.stop[data-fresh] {
		animation: fresh var(--dur-5) var(--ease-out) both;
	}

	@keyframes fresh {
		from {
			background-color: var(--sea-soft);
		}
	}

	.stop__grip {
		grid-area: grip;
		align-self: center;
		width: 1rem;
		color: var(--ink-4);
		opacity: 0.6;
		cursor: grab;
		transition: opacity var(--dur-2) var(--ease-out);
	}

	.stop:hover .stop__grip,
	.stop:focus-within .stop__grip {
		opacity: 1;
	}

	@media (pointer: coarse) {
		.stop__grip {
			opacity: 1;
		}
	}

	/* The route number: the kind colour with ink that reads on it in both themes (`--on-fill`). */
	.stop__number {
		grid-area: number;
		align-self: center;
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		background: var(--kind, var(--ink-3));
		color: var(--on-fill);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	/* An idea has no number: its icon sits on a quiet disc instead. */
	.stop__number--idea {
		background: var(--paper-3);
		color: var(--ink-3);
	}

	/* The body is a wrapper in the markup and nothing in the layout: its children sit on the card's grid. */
	.stop__body {
		display: contents;
	}

	/*
	 * The name is the card's main button, so it is a button's size: 36px
	 * drawn (the number and the grip centre on it), 44px to hit — the
	 * pseudo-element reaches 4px into the card's padding above and the
	 * row gap below, where there is nothing else to press.
	 */
	.stop__name {
		grid-area: name;
		position: relative;
		display: flex;
		align-items: center;
		min-height: var(--control-sm);
		border-radius: var(--radius-sm);
		text-align: start;
		font-weight: 600;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.stop__name::after {
		content: '';
		position: absolute;
		inset: -4px 0;
	}

	/* Pressed means "shown on the map", and the sea says so. Hover changes nothing: the colour is a state, not an invitation. */
	.stop__name[aria-pressed='true'] {
		color: var(--sea);
	}

	.stop__meta {
		grid-area: meta;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.stop__looker {
		padding-inline-start: 0.15rem;
	}

	.stop__avatar {
		display: grid;
		place-items: center;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: var(--sea);
		color: var(--on-sea);
		font-size: 0.55rem;
		font-weight: 700;
	}

	/* Two lines of notes; the whole text is in the edit dialog. */
	.stop__notes {
		grid-area: notes;
		color: var(--ink-2);
		font-size: var(--text-sm);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}

	/*
	 * Edit and remove appear when the card is hovered or holds focus, on a
	 * pointer that can hover. A touch screen cannot, so there they are
	 * always shown. Hidden by opacity, not display, so the buttons keep
	 * their place and a keyboard reaches them.
	 */
	.stop__actions {
		grid-area: actions;
		display: flex;
		gap: var(--space-1);
		margin-inline-end: calc(-1 * var(--space-1));
	}

	@media (hover: hover) {
		.stop__actions {
			opacity: 0;
			transition: opacity var(--dur-2) var(--ease-out);
		}
		.stop:hover .stop__actions,
		.stop:focus-within .stop__actions {
			opacity: 1;
		}
	}
</style>
