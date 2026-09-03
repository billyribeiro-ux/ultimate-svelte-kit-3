<script lang="ts">
	import { MonitorIcon, MoonIcon, SunIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { theme, type Theme } from './theme.svelte.ts';

	const options: { value: Theme; label: () => string; icon: typeof SunIcon }[] = [
		{ value: 'system', label: m.theme_system, icon: MonitorIcon },
		{ value: 'light', label: m.theme_light, icon: SunIcon },
		{ value: 'dark', label: m.theme_dark, icon: MoonIcon }
	];
</script>

<!--
	A radio group, because that is what it is: one of three, always exactly
	one. Arrow keys move between them for free, and a screen reader says
	"Theme, Light, 2 of 3" without any ARIA of our own beyond the fieldset.
-->
<fieldset class="theme">
	<legend class="visually-hidden">{m.theme_label()}</legend>
	{#each options as option (option.value)}
		{@const Icon = option.icon}
		<label class="theme__option" title={option.label()}>
			<input
				class="visually-hidden"
				type="radio"
				name="theme"
				value={option.value}
				checked={theme.choice === option.value}
				onchange={() => theme.set(option.value)}
			/>
			<Icon size={16} aria-hidden="true" />
			<span class="visually-hidden">{option.label()}</span>
		</label>
	{/each}
</fieldset>

<style>
	.theme {
		display: inline-flex;
		padding: 2px;
		border: 1px solid var(--line);
		border-radius: var(--radius-pill);
		background: var(--paper-3);
		margin: 0;
	}

	.theme__option {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		color: var(--ink-3);
		cursor: pointer;
		transition:
			background-color var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out);
	}

	.theme__option:has(input:checked) {
		background: var(--paper-2);
		color: var(--ink);
		box-shadow: var(--shadow-1);
	}

	.theme__option:has(input:focus-visible) {
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}
</style>
