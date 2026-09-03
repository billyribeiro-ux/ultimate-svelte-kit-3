<script lang="ts">
	import { PRESETS, describeRange, pin, resolve, shift, zoom } from '#lib/time/range.ts';
	import { clock } from '#lib/reactivity/clock.svelte.ts';

	/**
	 * THE TIME RANGE
	 * ==============
	 *
	 * Six presets, a pan, a zoom, and a pin. Not a calendar.
	 *
	 * WHY NO DATE PICKER
	 * ------------------
	 * Because of when this control is used. Somebody looking at an incident does
	 * not know the timestamp they want — they know "a bit before this" and "a bit
	 * wider than that", and they find the moment by moving. A calendar asks for an
	 * answer they do not have yet, in a modal that covers the chart they would use
	 * to work it out.
	 *
	 * The absolute case is still reachable and is reached the way people actually
	 * get there: pan and zoom until the window is right, then **pin** it, which
	 * freezes the moving window into the two timestamps it currently covers. That
	 * is also what makes a link shareable — a link to "the last hour" means
	 * something different tomorrow.
	 */
	interface Props {
		/** A range expression: `-1h`, or `from..to`. Bindable, because it lives in the URL. */
		value: string;
		disabled?: boolean;
	}

	let { value = $bindable(), disabled = false }: Props = $props();

	/**
	 * Resolved against the ticking clock, not `Date.now()`.
	 *
	 * A relative range is a *moving window*, and resolving it once at render time
	 * gives a label that says "Last 5 minutes" while quietly meaning the five
	 * minutes that ended when the page loaded. Reading `clock.now` here is what
	 * makes the window actually move — and, because the clock only runs while
	 * something is reading it, this component is what starts the timer and stops
	 * it when it unmounts.
	 */
	const range = $derived(resolve(value, clock.now));
	let open = $state(false);
</script>

<div class="picker">
	<div class="picker__nudge">
		<button
			type="button"
			class="btn btn--sm btn--icon"
			{disabled}
			aria-label="Earlier"
			onclick={() => (value = shift(range, -0.5))}>‹</button
		>
		<button
			type="button"
			class="btn btn--sm btn--icon"
			{disabled}
			aria-label="Zoom out"
			onclick={() => (value = zoom(range, 2))}>−</button
		>
		<button
			type="button"
			class="btn btn--sm btn--icon"
			{disabled}
			aria-label="Zoom in"
			onclick={() => (value = zoom(range, 0.5))}>+</button
		>
		<button
			type="button"
			class="btn btn--sm btn--icon"
			{disabled}
			aria-label="Later"
			onclick={() => (value = shift(range, 0.5))}>›</button
		>
	</div>

	<div class="picker__menu">
		<button
			type="button"
			class="btn btn--sm"
			{disabled}
			aria-expanded={open}
			aria-haspopup="true"
			onclick={() => (open = !open)}
		>
			{describeRange(range)}
			{#if range.live}
				<!--
					A live range says so, and does not blink.

					An animated indicator on a control somebody looks at every few minutes
					is a light flashing in the corner of their eye all day. The word is
					enough.
				-->
				<span class="live" title="This range moves with the clock">live</span>
			{/if}
		</button>

		{#if open}
			<ul class="menu" role="menu">
				{#each PRESETS as preset (preset.expression)}
					<li role="none">
						<button
							type="button"
							role="menuitem"
							class="menu__item"
							aria-current={value === preset.expression ? 'true' : undefined}
							onclick={() => {
								value = preset.expression;
								open = false;
							}}
						>
							{preset.label}
						</button>
					</li>
				{/each}

				<li role="none"><hr /></li>

				<li role="none">
					<button
						type="button"
						role="menuitem"
						class="menu__item"
						disabled={!range.live}
						onclick={() => {
							value = pin(range);
							open = false;
						}}
					>
						Pin to these times
						<span class="menu__hint">Freezes the window so a link keeps meaning this</span>
					</button>
				</li>
			</ul>
		{/if}
	</div>
</div>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') open = false;
	}}
/>

<style>
	.picker {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.picker__nudge {
		display: flex;
		gap: 2px;
	}

	.picker__menu {
		position: relative;
	}

	.live {
		font-size: var(--fs-xs);
		color: var(--ok);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.menu {
		position: absolute;
		z-index: var(--z-sticky);
		inset-inline-end: 0;
		margin: var(--space-1) 0 0;
		padding: var(--space-1);
		list-style: none;
		min-width: 14rem;
		background: var(--surface-raised);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
	}

	.menu__item {
		display: flex;
		flex-direction: column;
		width: 100%;
		gap: 2px;
		padding: var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--fs-sm);
		text-align: left;
		cursor: pointer;
	}

	.menu__item:hover:not(:disabled) {
		background: var(--surface-hover);
	}

	.menu__item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.menu__item[aria-current] {
		color: var(--accent);
	}

	.menu__hint {
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}

	hr {
		border: 0;
		border-top: 1px solid var(--border);
		margin: var(--space-1) 0;
	}
</style>
