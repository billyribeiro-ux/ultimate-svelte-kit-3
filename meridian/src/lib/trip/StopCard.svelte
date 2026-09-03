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
		onselect: () => void;
		onedit?: () => void;
		onremove?: () => void;
	}

	let { stop, number, selected, editable, lookers, onselect, onedit, onremove }: Props = $props();

	const Icon = $derived(KIND_ICONS[stop.kind]);
</script>

<article class="stop" class:stop--selected={selected} data-kind={stop.kind} data-stop={stop.id}>
	{#if editable}
		<span class="stop__grip" aria-hidden="true"><DotsSixVerticalIcon size={16} /></span>
	{/if}

	<span class="stop__number" aria-hidden="true">
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
				<span class="chip chip--sea">{name}</span>
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
	.stop {
		display: grid;
		grid-template-columns: auto auto 1fr auto;
		align-items: start;
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--line);
		border-left: 3px solid var(--kind, var(--line-2));
		border-radius: var(--radius);
		background: var(--paper-2);
		transition: box-shadow var(--dur-fast) var(--ease-out);
	}

	.stop--selected {
		box-shadow: 0 0 0 2px var(--kind, var(--sea));
	}

	.stop__grip {
		color: var(--ink-3);
		cursor: grab;
		padding-top: 0.2rem;
	}

	.stop__number {
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		background: var(--kind, var(--ink-3));
		color: #fff;
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.stop__body {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.stop__name {
		text-align: start;
		font-weight: 600;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.stop__name:hover {
		color: var(--sea);
	}

	.stop__meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.stop__notes {
		color: var(--ink-2);
		font-size: var(--text-sm);
	}

	.stop__actions {
		display: flex;
		gap: 2px;
	}
</style>
