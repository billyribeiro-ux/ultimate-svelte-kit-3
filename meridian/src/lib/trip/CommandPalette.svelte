<script lang="ts">
	import { onMount } from 'svelte';
	import { Command, Dialog } from 'bits-ui';
	import { goto } from '$app/navigation';
	import { MagnifyingGlassIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/domain/dates.ts';
	import { KIND_ICONS } from './kinds.ts';
	import { TABS, type Tab, type TripState } from './state.svelte.ts';

	/**
	 * CTRL+K
	 * ======
	 *
	 * A command palette: type a few letters, arrow down, Enter. Bits UI's
	 * `Command` does the filtering, the scoring and the roving focus; a
	 * `Dialog` around it does the overlay and the focus trap. What is *in* the
	 * palette is this trip's stops and a handful of actions — each `Item` is
	 * a value to match and an `onSelect` to run.
	 */
	interface Props {
		view: TripState;
		editable: boolean;
		onadd: () => void;
	}

	let { view, editable, onadd }: Props = $props();

	const locale = getLocale();

	let open = $state(false);

	const tabLabels: Record<Tab, () => string> = {
		itinerary: m.tab_itinerary,
		map: m.tab_map,
		globe: m.tab_globe,
		expenses: m.tab_expenses,
		notes: m.tab_notes,
		companions: m.tab_companions
	};

	function onkeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			open = !open;
		}
	}

	function go(tab: Tab) {
		open = false;
		void goto(href(`/(site)/t/[slug=slug]?tab=${tab}`, { slug: view.trip.slug }), {
			replace: true
		});
	}

	function jump(stopId: string) {
		view.select(stopId);
		go('itinerary');
	}

	/*
	 * Dated stops first, in day order; ideas — no date yet — after them,
	 * under their own heading, so "Évora" does not come before day one.
	 */
	const dated = $derived(
		view.document.stops
			.filter((stop) => stop.date !== null)
			.toSorted((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0))
	);
	const ideas = $derived(view.document.stops.filter((stop) => stop.date === null));

	/*
	 * The shortcut as this keyboard writes it: ⌘K on a Mac or an iPad,
	 * Ctrl K everywhere else. Only the browser knows which, so the hint is
	 * blank on the server and filled in on mount (it shows from 48em, where
	 * a keyboard is likely, and a phone never sees it).
	 */
	let shortcut = $state<string | null>(null);

	onMount(() => {
		const platform =
			(navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
				?.platform ?? navigator.platform;
		shortcut = /mac|iphone|ipad/i.test(platform) ? '⌘K' : 'Ctrl K';
	});
</script>

<svelte:window {onkeydown} />

<!-- One stop as a palette item; the dated stops and the ideas both render it. -->
{#snippet stopItem(stop: (typeof view.document.stops)[number])}
	{@const Icon = KIND_ICONS[stop.kind]}
	<Command.Item
		class="cmd__item"
		value={`${stop.name} ${stop.id}`}
		keywords={[stop.kind, stop.date ?? '', stop.date ? formatDate(stop.date, locale) : '']}
		onSelect={() => jump(stop.id)}
	>
		<Icon size={16} aria-hidden="true" class="cmd__kind" data-kind={stop.kind} />
		<span>{stop.name}</span>
		<!-- "May 10" in the page's language; the ISO date stays a keyword, so typing "2026-05" still finds it. -->
		{#if stop.date}<span class="cmd__date tabular">{formatDate(stop.date, locale)}</span>{/if}
	</Command.Item>
{/snippet}

<!--
	A magnifier, which means "search" to everybody, not the ⌘ glyph, which
	means something only on a Mac. Icon-only on a phone, where the label is
	visually hidden and still the button's name; the shortcut shows where a
	keyboard is likely.

	The name comes from the label, not an `aria-label`: with one, the name
	was "Search and commands" while the button read "Search and commands
	Ctrl K", and a name that does not match what is on the button is a
	button speech input cannot find. The shortcut itself goes to assistive
	technology as `aria-keyshortcuts`, in its own vocabulary.
-->
<button
	class="btn btn--sm btn--ghost btn--icon palette__button no-print"
	type="button"
	onclick={() => (open = true)}
	title={m.palette_hint()}
	aria-keyshortcuts="Control+K Meta+K"
>
	<MagnifyingGlassIcon size={16} aria-hidden="true" />
	<span class="palette__label">{m.palette_open()}</span>
	{#if shortcut}<kbd class="palette__kbd" aria-hidden="true">{shortcut}</kbd>{/if}
</button>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="overlay" />
		<Dialog.Content class="palette">
			<Dialog.Title class="visually-hidden">{m.palette_open()}</Dialog.Title>
			<Dialog.Description class="visually-hidden">{m.palette_hint()}</Dialog.Description>

			<Command.Root class="cmd" label={m.palette_open()} loop>
				<div class="cmd__field">
					<MagnifyingGlassIcon size={18} aria-hidden="true" class="cmd__glass" />
					<Command.Input class="cmd__input" placeholder={m.palette_placeholder()} />
				</div>
				<Command.List class="cmd__list">
					<Command.Viewport>
						<Command.Empty class="cmd__empty">{m.palette_empty()}</Command.Empty>

						<Command.Group>
							<Command.GroupHeading class="cmd__heading">{m.palette_stops()}</Command.GroupHeading>
							<Command.GroupItems>
								{#each dated as stop (stop.id)}
									{@render stopItem(stop)}
								{/each}
							</Command.GroupItems>
						</Command.Group>

						{#if ideas.length > 0}
							<Command.Group>
								<Command.GroupHeading class="cmd__heading">{m.day_ideas()}</Command.GroupHeading>
								<Command.GroupItems>
									{#each ideas as stop (stop.id)}
										{@render stopItem(stop)}
									{/each}
								</Command.GroupItems>
							</Command.Group>
						{/if}

						<Command.Group>
							<Command.GroupHeading class="cmd__heading">{m.palette_actions()}</Command.GroupHeading
							>
							<Command.GroupItems>
								{#if editable}
									<Command.Item
										class="cmd__item"
										value={m.day_add_stop()}
										onSelect={() => {
											open = false;
											onadd();
										}}
									>
										{m.day_add_stop()}
									</Command.Item>
								{/if}
								{#each TABS as tab (tab)}
									<Command.Item class="cmd__item" value={tabLabels[tab]()} onSelect={() => go(tab)}>
										{tabLabels[tab]()}
									</Command.Item>
								{/each}
							</Command.GroupItems>
						</Command.Group>
					</Command.Viewport>
				</Command.List>
				<!-- Where a keyboard is likely, say what each key does, in words beside the key. -->
				<p class="cmd__footer" aria-hidden="true">
					<span><kbd>↑↓</kbd> {m.palette_keys_move()}</span>
					<span><kbd>Enter</kbd> {m.palette_keys_open()}</span>
					<span><kbd>Esc</kbd> {m.palette_keys_close()}</span>
				</p>
			</Command.Root>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.palette__kbd {
		display: none;
		margin-inline-start: var(--space-1);
		font-family: var(--font-body);
		font-variant-numeric: tabular-nums;
	}

	/* Phone first: a square icon button (`.btn--icon`, with its 44px hit area), the label visually hidden. */
	.palette__label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	@media (min-width: 48em) {
		.palette__button {
			width: auto;
			padding: 0.25rem 0.7rem;
		}

		.palette__label {
			position: static;
			width: auto;
			height: auto;
			overflow: visible;
			clip: auto;
		}

		.palette__kbd {
			display: inline-block;
		}
	}

	/*
	 * A tier-3 panel near the top of the screen, dropping in 8px. It wears
	 * the shared `.overlay` scrim (base.css) but not the `.dialog` shell: a
	 * palette is not a sheet on a phone, it is a search box you type into.
	 *
	 * On a phone it hangs just under the header, so its top edge covers
	 * whole lines of the page: at 12vh it cut through the trip's name and
	 * left half a line of display type sticking out above it. From 40em it
	 * drops to an eighth of the way down the screen.
	 */
	:global(.palette) {
		position: fixed;
		z-index: var(--z-dialog);
		top: calc(var(--header-h) + var(--space-2));
		left: 50%;
		translate: -50% 0;
		width: min(36rem, calc(100vw - 2 * var(--gutter)));
		border-radius: var(--radius-xl);
		background: var(--paper-4);
		color: var(--ink);
		border: 1px solid var(--line);
		box-shadow: var(--shadow-3), var(--ring-hairline);
		overflow: hidden;
	}

	:global(.palette[data-state='open']) {
		animation: palette-in var(--dur-3) var(--ease-out) both;
	}

	:global(.palette[data-state='closed']) {
		animation: fade-out var(--dur-2) var(--ease-in) both;
	}

	@keyframes palette-in {
		from {
			opacity: 0;
			translate: -50% -8px;
			scale: 0.98;
		}
	}

	@keyframes fade-out {
		to {
			opacity: 0;
		}
	}

	.cmd__field {
		position: relative;
		border-bottom: 1px solid var(--line);
	}

	.cmd__field :global(.cmd__glass) {
		position: absolute;
		left: var(--space-4);
		top: 50%;
		translate: 0 -50%;
		color: var(--ink-3);
		pointer-events: none;
	}

	/* The field is the whole top of the panel; the panel's own edge is its focus ring, so the global one is off. */
	:global(.cmd__input) {
		width: 100%;
		min-height: 3.5rem;
		padding: var(--space-4) var(--space-4) var(--space-4) 3rem;
		border: 0;
		background: transparent;
		font-size: var(--text-md);
		outline: none;
		box-shadow: none;
	}

	:global(.cmd__list) {
		max-height: 50vh;
		overflow: auto;
		padding: var(--space-2);
	}

	:global(.cmd__heading) {
		padding: var(--space-2) var(--space-2) var(--space-1);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: var(--tracking-caps);
		color: var(--ink-2);
	}

	:global(.cmd__item) {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--control);
		padding: 0.5rem 0.6rem;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	/* Highlight is paper, not the sea: the sea is for what is selected, hover is for where you are. */
	:global(.cmd__item[data-selected]) {
		background: var(--paper-3);
		color: var(--ink);
	}

	:global(.cmd__kind) {
		color: var(--kind, var(--ink-3));
	}

	:global(.cmd__date) {
		margin-inline-start: auto;
		color: var(--ink-3);
		font-size: var(--text-xs);
	}

	:global(.cmd__empty) {
		padding: var(--space-4);
		color: var(--ink-3);
		font-size: var(--text-sm);
		text-align: center;
	}

	.cmd__footer {
		display: none;
		gap: var(--space-4);
		padding: var(--space-2) var(--space-4);
		border-top: 1px solid var(--line);
		color: var(--ink-3);
		font-family: var(--font-body);
		font-size: var(--text-xs);
	}

	.cmd__footer kbd {
		margin-inline-end: var(--space-1);
		font-family: var(--font-body);
		font-variant-numeric: tabular-nums;
	}

	@media (min-width: 40em) {
		:global(.palette) {
			top: max(12vh, var(--space-6));
		}
	}

	@media (min-width: 48em) {
		.cmd__footer {
			display: flex;
		}
	}
</style>
