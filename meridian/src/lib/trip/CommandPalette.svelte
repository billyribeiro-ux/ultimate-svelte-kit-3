<script lang="ts">
	import { Command, Dialog } from 'bits-ui';
	import { goto } from '$app/navigation';
	import { CommandIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
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
		void goto(`?tab=${tab}`, { replace: true });
	}

	function jump(stopId: string) {
		view.select(stopId);
		go('itinerary');
	}
</script>

<svelte:window {onkeydown} />

<button
	class="btn btn--sm btn--ghost palette__button no-print"
	type="button"
	onclick={() => (open = true)}
	title={m.palette_hint()}
>
	<CommandIcon size={16} aria-hidden="true" />
	{m.palette_open()}
	<kbd class="palette__kbd" aria-hidden="true">K</kbd>
</button>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="overlay" />
		<Dialog.Content class="palette">
			<Dialog.Title class="visually-hidden">{m.palette_open()}</Dialog.Title>
			<Dialog.Description class="visually-hidden">{m.palette_hint()}</Dialog.Description>

			<Command.Root class="cmd" label={m.palette_open()} loop>
				<Command.Input class="cmd__input" placeholder={m.palette_placeholder()} />
				<Command.List class="cmd__list">
					<Command.Viewport>
						<Command.Empty class="cmd__empty">{m.palette_empty()}</Command.Empty>

						<Command.Group>
							<Command.GroupHeading class="cmd__heading">{m.palette_stops()}</Command.GroupHeading>
							<Command.GroupItems>
								{#each view.document.stops as stop (stop.id)}
									{@const Icon = KIND_ICONS[stop.kind]}
									<Command.Item
										class="cmd__item"
										value={`${stop.name} ${stop.id}`}
										keywords={[stop.kind, stop.date ?? '']}
										onSelect={() => jump(stop.id)}
									>
										<Icon size={16} aria-hidden="true" />
										<span>{stop.name}</span>
										{#if stop.date}<span class="muted">{stop.date}</span>{/if}
									</Command.Item>
								{/each}
							</Command.GroupItems>
						</Command.Group>

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
			</Command.Root>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.palette__kbd {
		margin-inline-start: var(--space-1);
	}

	:global(.palette) {
		position: fixed;
		z-index: 51;
		top: 12vh;
		left: 50%;
		transform: translateX(-50%);
		width: min(36rem, calc(100vw - 2 * var(--space-4)));
		border-radius: var(--radius-lg);
		background: var(--paper-2);
		border: 1px solid var(--line);
		box-shadow: var(--shadow-3);
		overflow: hidden;
	}

	:global(.cmd__input) {
		width: 100%;
		padding: var(--space-4);
		border: 0;
		border-bottom: 1px solid var(--line);
		background: transparent;
		font-size: var(--text-md);
		outline: none;
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
		letter-spacing: 0.04em;
		color: var(--ink-3);
	}

	:global(.cmd__item) {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0.5rem 0.6rem;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	:global(.cmd__item[data-selected]) {
		background: var(--sea-soft);
		color: var(--sea);
	}

	:global(.cmd__empty) {
		padding: var(--space-4);
		color: var(--ink-3);
		font-size: var(--text-sm);
		text-align: center;
	}
</style>
