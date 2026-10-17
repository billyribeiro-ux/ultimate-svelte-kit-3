<script lang="ts">
	import { Combobox } from 'bits-ui';
	import { MagnifyingGlassIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { Place } from '#lib/remote/geo.remote.ts';

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
	 * The places come in as a prop, already loaded. The first version awaited
	 * the `prerender` function in here, and an `await` in a component that
	 * is not inside a boundary of its own holds back the update that mounts
	 * it — so the stop dialog opened with no search field and the wrong day,
	 * then rebuilt itself mid-animation when the gazetteer arrived. The
	 * dialog starts the fetch when the trip page loads (`StopDialog.svelte`)
	 * and hands over whatever it has; filtering a hundred names on every
	 * keystroke does not need a server.
	 */
	interface Props {
		/** The gazetteer; empty until it has loaded. */
		places: readonly Place[];
		onpick: (place: Place) => void;
		/** The input's id, so a visible `<label for>` outside can name it. */
		id?: string;
	}

	let { places, onpick, id }: Props = $props();

	// What has been typed, read from the input itself: the root's `inputValue`
	// is a prop to set, not one to bind.
	let query = $state('');
	let value = $state('');

	const matches = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return places.slice(0, 8);
		return places.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 8);
	});

	function pick(id: string) {
		const place = places.find((p) => p.id === id);
		if (place) onpick(place);
	}

	/* `PT` → "Portugal" in the person's language, from the browser's own data; the explore page does the same. */
	const regions = new Intl.DisplayNames(getLocale(), { type: 'region' });
	const countryName = (code: string) => regions.of(code) ?? code;
</script>

<Combobox.Root type="single" bind:value onValueChange={pick}>
	<div class="search">
		<MagnifyingGlassIcon size={16} aria-hidden="true" class="search__icon" />
		<Combobox.Input
			{id}
			class="input search__input"
			placeholder={m.stop_search()}
			aria-label={m.stop_search()}
			oninput={(event) => (query = event.currentTarget.value)}
		/>
	</div>
	<Combobox.Portal>
		<Combobox.Content class="search__list pop-in" sideOffset={4}>
			<Combobox.Viewport>
				{#each matches as place (place.id)}
					<Combobox.Item value={place.id} label={place.name} class="search__item">
						{#snippet children({ selected })}
							<span>{place.name}</span>
							<span class="search__country">{countryName(place.country)}</span>
							{#if selected}<span class="visually-hidden">✓</span>{/if}
						{/snippet}
					</Combobox.Item>
				{:else}
					<p class="search__empty">
						{places.length === 0 ? m.places_loading() : m.stop_search_empty()}
					</p>
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

	/*
	 * The list is a tier-3 surface over the dialog, one layer up, and it
	 * drops in with the shared `.pop-in` (4px, 240ms). Highlight is paper,
	 * not the sea: hovering is not choosing.
	 */
	:global(.search__list) {
		z-index: var(--z-popover);
		width: var(--bits-combobox-anchor-width);
		max-height: 16rem;
		overflow: auto;
		padding: var(--space-1);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--paper-4);
		box-shadow: var(--shadow-3), var(--ring-hairline);
	}

	:global(.search__item) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-height: 2.5rem;
		padding: 0.45rem 0.6rem;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	:global(.search__item[data-highlighted]) {
		background: var(--paper-3);
		color: var(--ink);
	}

	:global(.search__country) {
		color: var(--ink-3);
		font-size: var(--text-xs);
	}

	.search__empty {
		padding: 0.45rem 0.6rem;
		color: var(--ink-3);
		font-size: var(--text-sm);
	}
</style>
