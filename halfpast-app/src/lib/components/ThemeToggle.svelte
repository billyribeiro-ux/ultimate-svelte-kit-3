<script lang="ts">
	import { SunIcon, MoonIcon, DesktopIcon } from 'phosphor-svelte';
	import { theme, THEMES, type Theme } from '#lib/theme.svelte.ts';

	/**
	 * Light, dark, or follow the system.
	 *
	 * Three options, not two. A two-state toggle forces a visitor to pick a side
	 * permanently, and the commonest actual preference is "whatever my laptop is
	 * doing" — which changes at sunset.
	 *
	 * Rendered as a radio group rather than a button that cycles. Cycling is
	 * fewer pixels and worse: there is no way to see what the current state is
	 * without changing it, and a screen reader gets "button" where it should get
	 * "three options, the second selected".
	 */

	const LABELS: Record<Theme, string> = {
		light: 'Light',
		dark: 'Dark',
		system: 'System'
	};
</script>

<fieldset class="toggle">
	<legend class="visually-hidden">Colour theme</legend>

	{#each THEMES as option (option)}
		<label class="option" class:selected={theme.preference === option}>
			<input
				type="radio"
				name="theme"
				value={option}
				checked={theme.preference === option}
				onchange={() => theme.set(option)}
			/>
			<span aria-hidden="true">
				{#if option === 'light'}
					<SunIcon weight="bold" />
				{:else if option === 'dark'}
					<MoonIcon weight="bold" />
				{:else}
					<DesktopIcon weight="bold" />
				{/if}
			</span>
			<span class="visually-hidden">{LABELS[option]}</span>
		</label>
	{/each}
</fieldset>

<style>
	.toggle {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		background: var(--surface-sunken);
		border: var(--border) solid var(--line);
		border-radius: var(--radius-pill);
	}

	.option {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		margin: 0;
		border-radius: var(--radius-pill);
		color: var(--ink-faint);
		cursor: pointer;
		transition:
			background-color var(--dur-fast) var(--ease-standard),
			color var(--dur-fast) var(--ease-standard);
	}

	.option:hover {
		color: var(--ink);
	}

	.selected {
		background: var(--surface);
		color: var(--accent);
		box-shadow: var(--shadow-sm);
	}

	/*
	 * The radio itself is hidden from sight but not from the accessibility tree
	 * or from focus — it is still the thing that receives keyboard input and
	 * announces the group. `appearance: none` plus zero size would take it out of
	 * the tab order in some browsers; clipping keeps it real.
	 */
	.option input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		margin: 0;
		pointer-events: none;
	}

	/* Focus lands on the invisible input, so the ring has to be drawn on its
	 * label instead. Without this the whole control is invisible to a keyboard. */
	.option:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
