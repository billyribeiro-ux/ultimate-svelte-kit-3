<script lang="ts">
	import MonitorIcon from 'phosphor-svelte/lib/Monitor';
	import SunIcon from 'phosphor-svelte/lib/Sun';
	import MoonIcon from 'phosphor-svelte/lib/Moon';
	import { theme } from '#lib/theme.svelte.ts';

	const labels = {
		system: 'Theme: follow the system',
		light: 'Theme: light',
		dark: 'Theme: dark'
	} as const;
</script>

<button
	type="button"
	class="theme"
	onclick={() => theme.next()}
	aria-label={labels[theme.choice]}
	title={labels[theme.choice]}
>
	{#if theme.choice === 'system'}
		<MonitorIcon size={18} weight="regular" />
	{:else if theme.choice === 'light'}
		<SunIcon size={18} weight="regular" />
	{:else}
		<MoonIcon size={18} weight="regular" />
	{/if}
</button>

<style>
	.theme {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-md);
		color: var(--text-muted);
	}

	.theme:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
</style>
