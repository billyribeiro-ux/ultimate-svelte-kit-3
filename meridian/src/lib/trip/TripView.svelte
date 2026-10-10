<script lang="ts">
	import { untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { browser } from '$app/env';
	import { reducedMotion } from '#lib/motion/prefers.svelte.ts';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { errorMessage } from '#lib/ui/errors.ts';
	import {
		GearSixIcon,
		GlobeHemisphereWestIcon,
		ListNumbersIcon,
		MapTrifoldIcon,
		NotePencilIcon,
		ReceiptIcon,
		UsersThreeIcon
	} from 'phosphor-svelte';
	import { formatDistance } from '@meridian/waypoint/geo';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatRange } from '#lib/domain/dates.ts';
	import { canEdit, isOwner, type ViewerRole } from '#lib/domain/roles.ts';
	import { fireAndForget } from '#lib/remote/fire-and-forget.ts';
	import { heartbeat, leave, watchTrip } from '#lib/remote/live.remote.ts';
	import { updateStop } from '#lib/remote/stops.remote.ts';
	import type { TripDocument } from '#lib/server/trips.ts';
	import MapView from '#lib/map/MapView.svelte';
	import Itinerary from './Itinerary.svelte';
	import Presence from './Presence.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import Companions from './Companions.svelte';
	import Expenses from './Expenses.svelte';
	import Notes from './Notes.svelte';
	import StopDialog, { type Mode } from './StopDialog.svelte';
	import { TABS, TripState, type Tab } from './state.svelte.ts';

	interface Props {
		initial: { document: TripDocument; role: ViewerRole; viewerId: string | null };
		slug: string;
	}

	let { initial, slug }: Props = $props();

	/*
	 * THE LIVE QUERY
	 * --------------
	 * `watchTrip(slug)` is a `query.live`: `.current` is the latest snapshot the
	 * server sent, `.connected` says whether the stream is up. `TripState` reads
	 * `live.current` through a getter, so everything derived from the document
	 * follows the stream, and falls back to the first paint's document until
	 * the stream delivers.
	 */
	/*
	 * The props are read once, on purpose: the page keys this component on
	 * the slug, so a different trip is a different instance. `untrack` says
	 * so, and keeps the compiler from asking whether that was meant.
	 */
	const live = untrack(() => watchTrip(slug));
	const view = untrack(() => new TripState(initial.document, () => live.current));

	const editable = untrack(() => canEdit(initial.role));
	const owner = untrack(() => isOwner(initial.role));
	const member = untrack(() => initial.viewerId !== null && initial.role !== 'link');
	const locale = getLocale();

	const tab: Tab = $derived.by(() => {
		const wanted = page.url.searchParams.get('tab');
		return (TABS as readonly string[]).includes(wanted ?? '') ? (wanted as Tab) : 'itinerary';
	});

	const tabLabels: Record<Tab, () => string> = {
		itinerary: m.tab_itinerary,
		map: m.tab_map,
		globe: m.tab_globe,
		expenses: m.tab_expenses,
		notes: m.tab_notes,
		companions: m.tab_companions
	};

	const tabIcons: Record<Tab, typeof MapTrifoldIcon> = {
		itinerary: ListNumbersIcon,
		map: MapTrifoldIcon,
		globe: GlobeHemisphereWestIcon,
		expenses: ReceiptIcon,
		notes: NotePencilIcon,
		companions: UsersThreeIcon
	};

	/*
	 * THE LIVE CHIP
	 * -------------
	 * Three states, not two. For the first three seconds a stream that is
	 * not up yet is still connecting, and the chip says "Connecting…" in the
	 * quiet grey. After that, a stream that is not up has failed or dropped,
	 * and "Reconnect", the coral button, offers to try again. Shown the
	 * moment the page hydrated, as it first was, it told everybody on a slow
	 * network that something had failed when nothing had. All three sit in
	 * one slot as wide as the widest of them (the `.status` rules say how),
	 * so the palette and the settings button beside it never move.
	 */
	let patient = $state(true);

	$effect(() => {
		const timer = setTimeout(() => (patient = false), 3000);
		return () => clearTimeout(timer);
	});

	const status: 'live' | 'connecting' | 'lost' = $derived(
		live.connected ? 'live' : patient ? 'connecting' : 'lost'
	);

	/*
	 * THE TAB INDICATOR
	 * -----------------
	 * One 2px bar under the current tab, positioned from the current link's
	 * `offsetLeft` and `offsetWidth`. Its position is a `Tween` from
	 * `svelte/motion`: a value that, when set, moves to the new one over a
	 * duration — 160ms with `cubicOut`, the nearest built-in curve to the
	 * `--ease-out` token, or 0 under reduced motion — and the markup reads
	 * `.current` every frame. The first position is set with
	 * `{ duration: 0 }`, so the bar starts under the tab instead of sliding
	 * in from the left edge.
	 *
	 * The effect reads `tab`, so it re-runs on every switch, and nothing
	 * else reactive, so it does not run when the document changes. When the
	 * strip or a tab changes size — a rotation, a resize, a font arriving —
	 * the observer below measures again, with no slide: the bar is moved to
	 * where the tab now is, not animated there.
	 *
	 * The strip scrolls sideways on a phone, so the current tab is scrolled
	 * into view too — by hand, to a position that leaves 32px clear on
	 * either side of it. `scrollIntoView({ inline: 'nearest' })` stopped at
	 * the strip's edge, which is where the fade is, and left "Notes" with
	 * its last letter and its bar faded out.
	 */
	let strip = $state<HTMLElement>();
	const indicator = new Tween({ x: 0, w: 0 }, { duration: 160, easing: cubicOut });
	let settled = false;
	let fadeStart = $state(false);
	let fadeEnd = $state(false);

	const INSET = 32;

	function measure(animate: boolean) {
		const current = strip?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!current || !strip) return;
		const target = { x: current.offsetLeft, w: current.offsetWidth };
		const instant = !animate || !settled || untrack(() => reducedMotion.current);
		void indicator.set(target, instant ? { duration: 0 } : undefined);
		settled = true;

		const left = current.offsetLeft - INSET;
		const right = current.offsetLeft + current.offsetWidth + INSET - strip.clientWidth;
		if (strip.scrollLeft > left) strip.scrollLeft = Math.max(0, left);
		else if (strip.scrollLeft < right) strip.scrollLeft = right;
	}

	/* Each edge fades only while there is more strip beyond it. */
	function edges() {
		if (!strip) return;
		fadeStart = strip.scrollLeft > 1;
		fadeEnd = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
	}

	$effect(() => {
		void tab;
		measure(true);
		edges();
	});

	$effect(() => {
		if (!strip) return;
		const element = strip;
		const observer = new ResizeObserver(() => {
			measure(false);
			edges();
		});
		observer.observe(element);
		for (const link of element.querySelectorAll('a')) observer.observe(link);
		return () => observer.disconnect();
	});

	/*
	 * THE FRAME FITS THE SCREEN
	 * -------------------------
	 * The map and the globe are as tall as what is left of the viewport
	 * below the trip's header and the tabs, so their bottom edge — the map's
	 * status pill, the globe's "Fly the route" — is on screen without a
	 * scroll, on a phone and at 1440×900 alike. That height depends on how
	 * tall the header is, which depends on the trip's name, the width and
	 * the language, so it is measured: the panel's top, in page coordinates,
	 * written to `--frame-top` whenever the header changes size. CSS does
	 * the rest, with a floor and a ceiling.
	 */
	let header = $state<HTMLElement>();
	let panel = $state<HTMLElement>();
	let frameTop = $state<number>();

	$effect(() => {
		if (!header || !panel) return;
		const element = panel;
		const measure = () => {
			frameTop = Math.round(element.getBoundingClientRect().top + window.scrollY);
		};
		const observer = new ResizeObserver(measure);
		observer.observe(header);
		window.addEventListener('resize', measure);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', measure);
		};
	});

	/*
	 * PRESENCE
	 * --------
	 * Two effects, on purpose. The first owns the heartbeat and the goodbye
	 * and depends on nothing that changes, so it runs once. The second sends
	 * a beat whenever the selected stop changes, so companions see the chip
	 * move — and does not tear the interval down to do it.
	 *
	 * Neither reads `view.trip`. The first version did, and it was a loop:
	 * a heartbeat wakes the room, the live query yields a new snapshot,
	 * `view.trip` is a new object, the effect re-runs, its cleanup says
	 * goodbye, the goodbye wakes the room… The id is a string that never
	 * changes for the life of this component, so it is read once, here.
	 *
	 * And the command itself is called inside `untrack`. A remote command
	 * keeps a little reactive state of its own — how many calls are in
	 * flight — and reads it as it starts. Read inside an effect, that state
	 * becomes a dependency of the effect, and the write that follows re-runs
	 * it: a synchronous loop that Svelte stops with
	 * `effect_update_depth_exceeded`. `untrack` says: run this, depend on
	 * nothing it touches.
	 */
	const tripId = untrack(() => initial.document.trip.id);

	$effect(() => {
		if (!member) return;
		const beat = () =>
			fireAndForget(
				heartbeat({ tripId, stopId: untrack(() => view.selectedStopId) }),
				'presence heartbeat'
			);
		untrack(beat);
		const timer = setInterval(beat, 15_000);
		return () => {
			clearInterval(timer);
			fireAndForget(leave({ tripId }), 'presence goodbye');
		};
	});

	$effect(() => {
		if (!member) return;
		const stopId = view.selectedStopId;
		untrack(() => fireAndForget(heartbeat({ tripId, stopId }), 'presence heartbeat'));
	});

	/*
	 * The side-by-side map exists from 64em up, and not as `display: none`
	 * below: a hidden MapLibre is still a WebGL context, and a phone would
	 * run two of them for one trip. `MediaQuery` is `false` on the server,
	 * so the map is never server-rendered — it is a canvas, it never was.
	 */
	const wide = new MediaQuery('(min-width: 64em)');

	/** The stop dialog: closed, adding at a day (and maybe a point), or editing a stop. */
	let dialog: Mode | null = $state(null);

	async function moveTo(id: string, point: { lng: number; lat: number }) {
		try {
			await updateStop({ id, lng: point.lng, lat: point.lat });
			toast.success(m.stop_moved());
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}
</script>

<svelte:head>
	<title>{view.trip.name} — {m.app_name()}</title>
</svelte:head>

<article
	class="trip container"
	style:--frame-top={frameTop === undefined ? undefined : `${frameTop}px`}
>
	<header class="trip__header" bind:this={header}>
		<div class="trip__titles">
			<h1 class="trip__name">{view.trip.name}</h1>
			<p class="trip__meta dotted tabular">
				<span>{formatRange(view.trip.startDate, view.trip.endDate, locale)}</span>
				{#if view.total > 0}
					<span>{m.route_total({ distance: formatDistance(view.total, locale) })}</span>
				{/if}
			</p>
			{#if view.trip.description}
				<p class="trip__lede">{view.trip.description}</p>
			{/if}
		</div>

		<div class="trip__status cluster">
			<Presence {view} viewerId={initial.viewerId} />
			<CommandPalette {view} {editable} onadd={() => (dialog = { kind: 'add', date: null })} />
			<!-- The sizer is invisible and holds the three labels as generated text, so the slot is as wide as the widest. -->
			<span class="status">
				<span class="status__sizer" aria-hidden="true">
					<span data-label={m.live_connected()}></span>
					<span data-label={m.live_connecting()}></span>
					<span data-label={m.live_reconnect()}></span>
				</span>
				{#if status === 'live'}
					<span class="chip chip--sea live" title={m.live_connected()}>
						<span class="live__dot" aria-hidden="true"></span>
						{m.live_connected()}
					</span>
				{:else if status === 'connecting'}
					<span class="chip live live--connecting" title={m.live_connecting()}>
						<span class="live__dot" aria-hidden="true"></span>
						{m.live_connecting()}
					</span>
				{:else}
					<button
						class="btn btn--sm btn--ghost btn--danger"
						type="button"
						onclick={() => live.reconnect()}
					>
						{m.live_reconnect()}
					</button>
				{/if}
			</span>
			{#if owner}
				<!-- Icon-only on a phone; the word is still the link's name, visually hidden there. -->
				<a
					class="btn btn--sm btn--ghost btn--icon trip__settings"
					href={href('/(site)/t/[slug=slug]/settings', { slug })}
					title={m.trip_settings()}
				>
					<GearSixIcon size={16} aria-hidden="true" />
					<span class="trip__settings-label">{m.trip_settings()}</span>
				</a>
			{/if}
		</div>
	</header>

	<!--
		`data-sveltekit-reset="false"`: a tab is the same page with a different
		panel, so the scroll position and the focus — on the tab just pressed,
		as a tablist keeps it — survive the navigation. SvelteKit 3 folded the
		old `noscroll` and `keepfocus` attributes into this one `reset`, and
		only warns about the old names in development: it no longer reads them.

		The strip is sticky under the header, so on a long itinerary the tabs
		stay in reach. The frame around it carries the paper and the two edge
		fades, which show only while there is more strip that way.
	-->
	<div
		class="tabs-frame no-print"
		data-fade-start={fadeStart ? '' : undefined}
		data-fade-end={fadeEnd ? '' : undefined}
	>
		<nav class="tabs" aria-label={m.app_name()} bind:this={strip} onscroll={edges}>
			{#each TABS as name (name)}
				{@const Icon = tabIcons[name]}
				<a
					class="tabs__link"
					href={href(`/(site)/t/[slug=slug]?tab=${name}`, { slug })}
					aria-current={tab === name ? 'page' : undefined}
					data-sveltekit-reset="false"
				>
					<Icon size={16} aria-hidden="true" />
					{tabLabels[name]()}
				</a>
			{/each}
			<span
				class="tabs__indicator"
				aria-hidden="true"
				style:--x="{indicator.current.x}px"
				style:--w="{indicator.current.w}px"
			></span>
		</nav>
	</div>

	<!-- The panel has its own transition name: the tabs and the header hold still while it changes. -->
	<div class="trip__panel" style:view-transition-name="trip-panel" bind:this={panel}>
		{#if tab === 'itinerary'}
			<!--
				On a phone the itinerary is the list and the Map tab is the map.
				The side-by-side map only exists from 64em, so a phone never
				runs two WebGL contexts for one trip and never scrolls past every
				day to find a map it has one tab over.
			-->
			<div class="split">
				<Itinerary
					{view}
					{editable}
					viewerId={initial.viewerId}
					onadd={(date) => (dialog = { kind: 'add', date })}
					onedit={(stop) => (dialog = { kind: 'edit', stop })}
				/>
				{#if wide.current}
					<div class="split__map">
						<MapView
							stops={view.scheduled}
							selected={view.selectedStopId}
							{editable}
							onselect={(id) => view.select(id)}
							onadd={(point) => (dialog = { kind: 'add', date: null, point })}
							onmove={moveTo}
						/>
					</div>
				{/if}
			</div>
		{:else if tab === 'map'}
			<div class="full-map">
				<MapView
					stops={view.scheduled}
					selected={view.selectedStopId}
					{editable}
					onselect={(id) => view.select(id)}
					onadd={(point) => (dialog = { kind: 'add', date: null, point })}
					onmove={moveTo}
				/>
			</div>
		{:else if tab === 'globe'}
			<!--
				THE GLOBE, WHEN ASKED FOR
				-------------------------
				three.js and Threlte are the largest dependency in the project, and
				most visits never open this tab. `import()` in markup loads them on
				demand; the boundary shows the pending snippet until the chunk is
				here, and the failed snippet if the network is not. `browser`
				guards it because a WebGL scene has no server-rendered form.

				The frame is painted night before the chunk arrives, so the tab
				never flashes cream and then space.
			-->
			<div class="full-map full-map--night">
				{#if browser}
					<svelte:boundary>
						{#snippet pending()}
							<p class="night__status">{m.globe_loading()}</p>
						{/snippet}
						{#snippet failed(error, reset)}
							<p class="night__status issue">
								{error instanceof Error ? error.message : m.error_title()}
								<button class="btn btn--sm" type="button" onclick={reset}
									>{m.live_reconnect()}</button
								>
							</p>
						{/snippet}
						{const { default: Globe } = await import('#lib/globe/Globe.svelte')}
						<Globe
							stops={view.scheduled}
							selected={view.selectedStopId}
							onselect={(id) => view.select(id)}
						/>
					</svelte:boundary>
				{:else}
					<p class="night__status">{m.globe_loading()}</p>
				{/if}
			</div>
		{:else if tab === 'expenses'}
			<Expenses {view} {editable} viewerId={initial.viewerId} />
		{:else if tab === 'notes'}
			<Notes {view} {editable} />
		{:else if tab === 'companions'}
			<Companions {view} role={initial.role} viewerId={initial.viewerId} />
		{/if}
	</div>
</article>

{#if editable}
	<StopDialog
		mode={dialog}
		tripId={view.trip.id}
		days={view.days}
		onclose={() => (dialog = null)}
		onsaved={(stop) => view.select(stop.id)}
	/>
{/if}

<style>
	/*
	 * `minmax(0, 1fr)`, not the implicit `auto` column. A grid track sized
	 * `auto` refuses to be narrower than its content, and a grid item in it
	 * refuses to be narrower than *its* content — so the expenses table, seven
	 * columns wide, would push the whole page out past a phone's screen even
	 * though its own wrapper scrolls. With a zero minimum the column is the
	 * container's width, the item is the column's width, and the table
	 * scrolls inside its wrapper as intended. The desktop `.split` below
	 * needs the same, for the same reason.
	 */
	.trip {
		--frame-guess: 21rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5);
		padding-block: var(--space-5) var(--section);
	}

	/*
	 * On a phone the trip's name has the full width, and the status tools —
	 * who is here, the palette, the live chip, settings — are a row of
	 * their own under the lede. Sharing the name's row left a real trip name
	 * 177px of a 328px column: "A long weekend in the Douro valley with the
	 * cousins" ran to five ragged lines of display type. From 40em there is
	 * room for both, and the tools move up beside the name. The titles
	 * block is `display: contents`, so its three children sit on the
	 * header's grid directly.
	 */
	.trip__header {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas:
			'name'
			'meta'
			'lede'
			'status';
		align-items: start;
		gap: var(--space-2) var(--space-3);
	}

	.trip__titles {
		display: contents;
	}

	/* The trip's name is 2xl, one step under a page title: the page is the trip, the name is the thing on it. */
	.trip__name {
		grid-area: name;
		font-size: var(--text-2xl);
		max-inline-size: 20ch;
		view-transition-name: trip-title;
	}

	.trip__meta {
		grid-area: meta;
		color: var(--ink-2);
		font-size: var(--text-sm);
	}

	.trip__lede {
		grid-area: lede;
		color: var(--ink-2);
		max-inline-size: var(--measure);
	}

	.trip__status {
		grid-area: status;
		justify-content: flex-start;
		gap: var(--space-2);
	}

	/*
	 * The status slot: the visible chip or button, and under it an
	 * invisible sizer as wide as the widest of the three labels, stacked in
	 * one grid cell. The sizer's labels are generated text (`content:
	 * attr(…)`), so they are in no one's way: not in the accessibility
	 * tree, not in the page's text, not a second "Live" for a test to trip
	 * over.
	 */
	.status {
		display: inline-grid;
		align-items: center;
	}

	.status > *,
	.status__sizer > * {
		grid-area: 1 / 1;
	}

	/*
	 * The chip and the button are as wide as their own label, not the slot:
	 * stretched to it, "Live" sat in a pill two and a half times its width.
	 * They sit at the slot's leading edge on a phone, where the tools read
	 * from the left, and at its trailing edge beside the name, where they are
	 * set against the right — so the edge next to the settings button stays
	 * put when the label changes.
	 */
	.status > :not(.status__sizer) {
		justify-self: start;
	}

	.status__sizer {
		display: inline-grid;
		visibility: hidden;
	}

	.status__sizer > span::before {
		content: attr(data-label);
		display: block;
		padding-inline: calc(0.6rem + 0.5rem + var(--space-2)) 0.7rem;
		font-size: var(--text-xs);
		font-weight: 500;
		white-space: nowrap;
	}

	.trip__settings-label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	@media (min-width: 40em) {
		.trip {
			--frame-guess: 18rem;
		}

		.trip__header {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'name status'
				'meta meta'
				'lede lede';
		}

		.trip__status {
			justify-content: flex-end;
		}

		.status > :not(.status__sizer) {
			justify-self: end;
		}

		/* A ghost button's padding is not part of its look: the icon, not the box, lines up with the gutter. */
		.trip__settings {
			margin-inline-end: calc(-1 * var(--space-2));
		}
	}

	/*
	 * Phone first, the settings link is a square icon button — `.btn--icon`
	 * gives it the 44px hit area every compact icon button has. From 48em
	 * the word comes back and it is a text button again.
	 */
	@media (min-width: 48em) {
		.trip__settings {
			width: auto;
			padding: 0.25rem 0.7rem;
		}

		.trip__settings-label {
			position: static;
			width: auto;
			height: auto;
			overflow: visible;
			clip: auto;
		}
	}

	.live {
		gap: var(--space-2);
	}

	/* The one ambient animation in the product. It is information: the stream is up. */
	.live__dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: currentColor;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}

	/* Not yet live: the same chip in the quiet grey, its dot still. */
	.live--connecting .live__dot {
		animation: none;
		opacity: 0.6;
	}

	@media (prefers-reduced-motion: reduce) {
		.live__dot {
			animation: none;
		}
	}

	/*
	 * The tab strip scrolls sideways on a phone and sticks under the
	 * header. The frame is the sticky thing and carries the paper; the strip
	 * inside it scrolls. Scrollbars are hidden because the fades are the
	 * affordance, and the indicator moves between tabs.
	 *
	 * The fades are two gradients from the paper to nothing, laid *over*
	 * the strip by the frame, each shown only while there is more strip that
	 * way. The first version masked the strip itself, and a mask fades a
	 * background too: once the strip was stuck, the rail of the itinerary
	 * scrolling under it showed through at both ends.
	 *
	 * `overflow-y: hidden`, and the hairline is an inset shadow rather than
	 * a border: a scroll container clips at its padding box, so a bar that
	 * sat on the border was cut to 1px and made the strip scroll a pixel
	 * up and down. Now the 2px bar sits inside, over the hairline.
	 *
	 * No scroll snapping: proximity snapping re-aligned a tab scrolled into
	 * view by hand to the strip's edge, under the fade.
	 */
	.tabs-frame {
		position: sticky;
		top: var(--header-h);
		z-index: var(--z-sticky);
		background: var(--paper);
	}

	.tabs-frame::before,
	.tabs-frame::after {
		content: '';
		position: absolute;
		inset-block: 0 1px;
		z-index: 1;
		width: var(--space-6);
		pointer-events: none;
		opacity: 0;
	}

	.tabs-frame::before {
		left: 0;
		background: linear-gradient(to right, var(--paper), transparent);
	}

	.tabs-frame::after {
		right: 0;
		background: linear-gradient(to left, var(--paper), transparent);
	}

	.tabs-frame[data-fade-start]::before,
	.tabs-frame[data-fade-end]::after {
		opacity: 1;
	}

	.tabs {
		position: relative;
		display: flex;
		gap: var(--space-1);
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		box-shadow: inset 0 -1px var(--line);
	}

	.tabs::-webkit-scrollbar {
		display: none;
	}

	.tabs__link {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control);
		padding-inline: var(--space-3);
		text-decoration: none;
		color: var(--ink-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	/* The current tab is ink, instantly; the bar below does the moving. */
	.tabs__link[aria-current='page'] {
		color: var(--ink);
	}

	/*
	 * Inside the link, not around it: the strip scrolls sideways, and a
	 * scroll container clips what overflows it on both axes, so a ring
	 * drawn outside a tab lost its top and bottom and kept only its sides.
	 */
	.tabs__link:focus-visible {
		outline-offset: -2px;
		border-radius: var(--radius-sm);
		box-shadow: none;
	}

	/* Positioned by the tween in the script; no CSS transition, so the two never fight. */
	.tabs__indicator {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 2px;
		width: var(--w);
		translate: var(--x) 0;
		background: var(--sea);
	}

	.trip__panel {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
	}

	.split {
		display: grid;
		gap: var(--space-5);
	}

	/*
	 * What is left of the screen under the panel's top (the script measures
	 * it), between 20rem and 46rem. Until it has — on the server, and in the
	 * first frame — the top is a guess for the width: on a phone the status
	 * tools are a row of their own under the lede, so the panel starts 3rem
	 * lower than beside them. A guess that matches the measurement means the
	 * frame does not change height under a map that has already started.
	 */
	.full-map {
		height: clamp(
			20rem,
			calc(100dvh - var(--frame-top, var(--frame-guess)) - var(--space-4)),
			46rem
		);
		border-radius: var(--radius-xl);
		overflow: hidden;
	}

	/*
	 * Night, before the globe arrives: `--night` is the globe's own frame,
	 * so the tab never flashes cream and then space, and the pending text
	 * is already in the pale blue the globe will use. The frame carries the
	 * hairline, because it is here before the globe is; the globe stretches
	 * to fill it (a grid item would otherwise shrink to its content and sit
	 * in the middle as a second, narrower frame), and only the pending text
	 * is centred.
	 */
	.full-map--night {
		display: grid;
		background: var(--night);
		border: 1px solid var(--line);
	}

	.night__status {
		place-self: center;
		padding: var(--space-6);
		color: var(--night-ink);
		font-size: var(--text-sm);
		text-align: center;
	}

	@media (min-width: 64em) {
		/*
		 * The split: seven parts list to five parts map. The map column is
		 * sticky below the header and the sticky tab strip, and exactly as
		 * tall as what is left of the viewport.
		 */
		.split {
			grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
			align-items: start;
		}

		.split__map {
			position: sticky;
			top: calc(var(--header-h) + var(--control) + var(--space-4));
			height: calc(100dvh - var(--header-h) - var(--control) - var(--space-8));
			border-radius: var(--radius-xl);
			overflow: hidden;
			box-shadow: var(--shadow-1);
		}
	}
</style>
