<script lang="ts">
	import { Combobox } from 'bits-ui';
	import { MagnifyingGlassIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { places, type Place } from '#lib/remote/geo.remote.ts';

	/**
	 * A COMBOBOX OVER THE GAZETTEER
	 * =============================
	 *
	 * Bits UI's `Combobox` is the accessible half: a text input with
	 * `role="combobox"`, a listbox that opens under it, arrow keys, Escape,
	 * type-ahead, `aria-activedescendant` — everything a screen reader needs
	 * and everything that is tedious to get right by hand. The other half is
	 * ours: which places match, and what happens when one is picked.
	 *
	 * The places come from the `prerender` remote function: a static JSON
	 * file, fetched once and cached by SvelteKit for the life of the page.
	 * Filtering a hundred names on every keystroke does not need a server.
	 */
	interface Props {
		onpick: (place: Place) => void;
	}

	let { onpick }: Props = $props();

	// What has been typed, read from the input itself: the root's `inputValue`
	// is a prop to set, not one to bind.
	let query = $state('');
	let value = $state('');

	// The gazetteer, awaited once. `await` in a `$derived` is fine in async mode.
	const all = $derived(await places());

	const matches = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return all.slice(0, 8);
		return all.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 8);
	});

	function pick(id: string) {
		const place = all.find((p) => p.id === id);
		if (place) onpick(place);
	}
</script>

<Combobox.Root type="single" bind:value onValueChange={pick}>
	<div class="search">
		<MagnifyingGlassIcon size={16} aria-hidden="true" class="search__icon" />
		<Combobox.Input
			class="input search__input"
			placeholder={m.stop_search()}
			aria-label={m.stop_search()}
			oninput={(event) => (query = event.currentTarget.value)}
		/>
	</div>
	<Combobox.Portal>
		<Combobox.Content class="search__list" sideOffset={4}>
			<Combobox.Viewport>
				{#each matches as place (place.id)}
					<Combobox.Item value={place.id} label={place.name} class="search__item">
						{#snippet children({ selected })}
							<span>{place.name}</span>
							<span class="muted">{place.country}</span>
							{#if selected}<span class="visually-hidden">✓</span>{/if}
						{/snippet}
					</Combobox.Item>
				{:else}
					<p class="search__empty muted">{m.stop_search_empty()}</p>
				{/each}
			</Combobox.Viewport>
		</Combobox.Content>
	</Combobox.Portal>
</Combobox.Root>

<style>
	.search {
		position: relative;
	}

	.search :global(.search__icon) {
		position: absolute;
		left: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--ink-3);
		pointer-events: none;
	}

	.search :global(.search__input) {
		padding-inline-start: 2.25rem;
	}

	:global(.search__list) {
		z-index: 60;
		width: var(--bits-combobox-anchor-width);
		max-height: 16rem;
		overflow: auto;
		padding: var(--space-1);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--paper-2);
		box-shadow: var(--shadow-3);
	}

	:global(.search__item) {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		padding: 0.45rem 0.6rem;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	:global(.search__item[data-highlighted]) {
		background: var(--sea-soft);
		color: var(--sea);
	}

	.search__empty {
		padding: 0.45rem 0.6rem;
		font-size: var(--text-sm);
	}
</style>
