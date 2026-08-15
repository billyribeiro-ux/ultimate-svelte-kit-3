<script lang="ts">
	import { tick } from 'svelte';
	// `RemoteFormField` is exported from `$app/server`, not `@sveltejs/kit` — it
	// describes a field created by `form(...)`, which is a `$app/server` concept.
	// Importing it as a *type* is safe in a component: types are erased, so no
	// server-only code follows it into the browser bundle.
	import type { RemoteFormField } from '$app/server';
	import { createFlip } from '#lib/motion/index.ts';
	import { formatTime, zoneAbbreviation, type TimeZone } from '#lib/time/index.ts';

	/**
	 * The grid of bookable times.
	 *
	 * Three decisions carry the value here.
	 *
	 * **Radio inputs, not buttons.** The grid lives inside the booking form, so
	 * choosing a time *is* choosing a form value. Arrow keys move between times
	 * the way they do in every native radio group, the choice posts itself, and
	 * the page works with JavaScript switched off.
	 *
	 * **The inputs come from the form's own field.** SvelteKit 3 requires every
	 * control inside a remote `<form>` to be created with `field.as(...)` — a
	 * hand-written `<input name="slot">` throws "Form contained a field that
	 * wasn't created with form.fields.as(...)". That is a good rule: `as()` is
	 * what wires the name, the value, the `aria-invalid` state and the two-way
	 * binding together, and doing any of those by hand is how they drift apart.
	 * The field is passed in as a prop, so this component stays presentational
	 * and the page owns the form.
	 *
	 * **FLIP on change.** Availability is live. When somebody else takes the
	 * 11:15 it disappears and everything after it shifts up — a customer mid-tap
	 * would otherwise land on a different time than the one they aimed at.
	 * Animating the reflow makes the change visible instead of instantaneous and
	 * invisible.
	 */

	export interface SlotOption {
		/** The instant this appointment starts. Unique within the grid. */
		start: number;
		/** Which staff can take it. More than one when the customer said "anyone". */
		staffIds: string[];
	}

	let {
		slots,
		zone,
		field,
		/** Show the zone abbreviation on every slot. Forced on for ambiguous times. */
		showZone = false
	}: {
		slots: SlotOption[];
		zone: TimeZone;
		field: RemoteFormField<string>;
		showZone?: boolean;
	} = $props();

	/**
	 * One radio value carries both the time and the person: `1786780800000.<uuid>`.
	 *
	 * Fusing them is what lets the form submit a complete choice with no
	 * JavaScript. The alternative — a hidden `staffId` field kept in step by an
	 * event handler — is a form that silently posts an incomplete selection the
	 * moment scripting is unavailable.
	 */
	const valueOf = (slot: SlotOption) => `${slot.start}.${slot.staffIds[0]}`;

	/** The field is the single source of truth for what is selected. */
	const selectedValue = $derived(field.value());

	let grid = $state<HTMLElement | null>(null);

	const flip = createFlip(() => (grid ? Array.from(grid.querySelectorAll('.slot')) : []));

	/**
	 * Capture positions before the list changes, animate after.
	 *
	 * `$effect.pre` runs *before* the DOM is updated for this change — the last
	 * moment the old layout still exists, which is FLIP's "First" step. Reading
	 * `slots` inside it is what subscribes the effect to changes in the list.
	 * `tick()` then waits for Svelte to apply the update so the new layout is real
	 * before we measure against it.
	 */
	$effect.pre(() => {
		void slots.length;
		void slots;

		if (!grid) return;

		flip.capture();
		void tick().then(() => flip.play());
	});

	/**
	 * Two slots showing the same clock reading, one hour apart, on the morning the
	 * clocks go back. Detecting it lets the labels say "01:30 BST" and "01:30 GMT"
	 * rather than showing the same time twice and looking broken.
	 */
	const duplicateLabels = $derived.by(() => {
		// Plain `Set`, not `SvelteSet`: both are built here and discarded on the
		// next recompute. The reactivity is the derived re-running, not mutation.
		/* eslint-disable svelte/prefer-svelte-reactivity */
		const seen = new Set<string>();
		const duplicates = new Set<string>();
		/* eslint-enable svelte/prefer-svelte-reactivity */

		for (const slot of slots) {
			const label = formatTime(slot.start, zone);
			if (seen.has(label)) duplicates.add(label);
			else seen.add(label);
		}
		return duplicates;
	});

	function labelFor(slot: SlotOption): string {
		const base = formatTime(slot.start, zone);
		const needsZone = showZone || duplicateLabels.has(base);
		return needsZone ? `${base} ${zoneAbbreviation(slot.start, zone)}` : base;
	}
</script>

{#if slots.length === 0}
	<p class="empty">No times left on this day. Try another one.</p>
{:else}
	<div class="grid" bind:this={grid}>
		{#each slots as slot (slot.start)}
			{@const value = valueOf(slot)}
			<label class="slot" class:selected={selectedValue === value}>
				<input {...field.as('radio', value)} />
				<span>{labelFor(slot)}</span>
			</label>
		{/each}
	</div>
{/if}

<style>
	.grid {
		display: grid;
		/*
		 * `auto-fill`, not `auto-fit`. With `auto-fit` a row containing three slots
		 * stretches them across the full width, so the same 11:00 button is a
		 * different size depending on how many neighbours it has — which looks like
		 * a bug. `auto-fill` keeps the empty tracks, so every slot is the same size
		 * whether the day is full or nearly empty.
		 */
		grid-template-columns: repeat(auto-fill, minmax(min(5.5rem, 100%), 1fr));
		gap: var(--space-2);
	}

	.slot {
		display: grid;
		place-items: center;
		margin: 0;
		min-height: 2.75rem;
		padding: var(--space-2);

		background: var(--surface);
		border: var(--border) solid var(--line-strong);
		border-radius: var(--radius-md);

		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		cursor: pointer;

		transition:
			background-color var(--dur-fast) var(--ease-standard),
			border-color var(--dur-fast) var(--ease-standard),
			color var(--dur-fast) var(--ease-standard);
	}

	.slot:hover:not(.selected) {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.selected {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}

	/* The input stays real — focusable, announced, and the thing that posts — but
	 * out of sight. Its focus ring is drawn on the label instead. */
	.slot input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		margin: 0;
		pointer-events: none;
	}

	.slot:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.empty {
		padding: var(--space-5);
		text-align: center;
		color: var(--ink-muted);
		background: var(--surface-sunken);
		border: var(--border) dashed var(--line-strong);
		border-radius: var(--radius-md);
		max-width: none;
	}
</style>
