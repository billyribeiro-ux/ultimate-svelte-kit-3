<script lang="ts">
	import { onMount, settled, untrack } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowUUpLeftIcon, ArrowUUpRightIcon, PlusIcon, ShareNetworkIcon } from 'phosphor-svelte';
	import type { PageProps, Snapshot } from './$types.js';
	import { AudioEngine } from '#lib/audio/engine.svelte.ts';
	import { SampleBank } from '#lib/audio/samples.svelte.ts';
	import { Scheduler } from '#lib/audio/scheduler.svelte.ts';
	import { setStudio } from '#lib/audio/context.ts';
	import { decodePattern } from '#lib/pattern/codec.ts';
	import { KINDS, type Kind } from '#lib/pattern/model.ts';
	import { PRESET_NAMES, preset } from '#lib/pattern/presets.ts';
	import { Session } from '#lib/studio/session.svelte.ts';
	import Mixer from '#lib/studio/Mixer.svelte';
	import Sheet from '#lib/studio/Sheet.svelte';
	import SharePanel from '#lib/studio/SharePanel.svelte';
	import SoundPanel from '#lib/studio/SoundPanel.svelte';
	import StepGrid from '#lib/studio/StepGrid.svelte';
	import Transport from '#lib/studio/Transport.svelte';
	import { toast } from '#lib/toast/toast.ts';

	let { data }: PageProps = $props();

	/* ---------------------------------------------------------------- */
	/* The instrument                                                    */
	/* ---------------------------------------------------------------- */

	const session = new Session();
	const engine = new AudioEngine();
	const samples = new SampleBank(engine);

	/*
	 * The scheduler reads the pattern through a getter, so whatever the session
	 * holds when the timer ticks is what plays — including a step toggled a
	 * millisecond ago. Its outputs are the engine's channel strips.
	 */
	const scheduler = new Scheduler(engine, () => session.pattern, {
		output: (track) => engine.channel(track).input,
		sample: (track) => samples.get(track.id)
	});

	// Every component under this page reaches the three through context.
	setStudio({ engine, scheduler, samples });

	/*
	 * The first pattern. `load` decided what it is, except for a fresh visit,
	 * which shows a preset on the server and swaps in the saved session once
	 * mounted — after hydration, so the server's markup is never contradicted.
	 */
	const initial = untrack(() => data);
	session.load(initial.pattern ?? preset('four-on-the-floor'), { remixOf: initial.remixOf });

	onMount(() => {
		if (initial.source === 'fresh') session.restore();
		if (initial.source === 'broken')
			toast('That link was damaged, so here is a fresh pattern', 'error');
	});

	/**
	 * SNAPSHOT
	 * ========
	 * Navigating away and back — to the gallery to steal an idea, say — must
	 * not lose the pattern. `capture` runs before the page is left, `restore`
	 * when it comes back, and the value is kept with the history entry. It is
	 * the encoded string: small, serialisable, and exactly what a link holds.
	 */
	export const snapshot: Snapshot<string> = {
		capture: () => session.encoded,
		restore: (code) => session.load(decodePattern(code), { remixOf: session.remixOf })
	};

	// Autosave to localStorage after every change; the root effect's teardown is this effect's cleanup.
	$effect(() => session.autosave());

	// Drop channel strips for tracks that no longer exist. A sync with an
	// external system — the audio graph — which is what `$effect` is for.
	$effect(() => {
		engine.prune(session.pattern.tracks.map((track) => track.id));
	});

	/*
	 * `$inspect` logs its arguments whenever they change, in development only.
	 * `.with` replaces the default `console.log` — here with something that
	 * says which of the two changed, which the default does not.
	 */
	// eslint-disable-next-line svelte/no-inspect -- deliberate: development-only, compiles away
	$inspect(session.pattern.bpm, session.pattern.swing).with((type, bpm, swing) => {
		if (type === 'update') console.debug(`tempo → ${bpm} bpm, swing ${Math.round(swing * 100)}%`);
	});

	/* ---------------------------------------------------------------- */
	/* Panels, as history entries                                        */
	/* ---------------------------------------------------------------- */

	/**
	 * SHALLOW ROUTING
	 * ===============
	 * Opening the sound panel pushes a history entry with `{ panel: 'sound' }`
	 * in its state and no change to the URL. The back button — or a swipe on a
	 * phone — closes it, which is what a person expects of something that
	 * covers the screen. `page.state.panel` is typed by `App.PageState`.
	 */
	function open(panel: NonNullable<App.PageState['panel']>) {
		if (page.state.panel === panel) return;
		pushState('', { panel });
	}

	function close() {
		if (page.state.panel) history.back();
	}

	const selectedTrack = $derived(session.selected ? session.track(session.selected) : undefined);

	/* ---------------------------------------------------------------- */
	/* Loading presets                                                   */
	/* ---------------------------------------------------------------- */

	/**
	 * `settled()` resolves when the state change *and everything it caused*
	 * has reached the DOM — the new rows, their transitions started, the pads
	 * in place. Focusing the first pad before that would focus a pad about to
	 * be replaced.
	 */
	async function loadPreset(name: string) {
		session.load(preset(name));
		await settled();
		document.querySelector<HTMLElement>('.pad')?.focus({ preventScroll: true });
		toast(`Loaded ${session.pattern.title}`);
	}

	function addTrack(kind: Kind) {
		const track = session.addTrack(kind);
		if (!track) toast('Eight tracks is the limit', 'error');
	}

	/* ---------------------------------------------------------------- */
	/* Keyboard                                                          */
	/* ---------------------------------------------------------------- */

	function keydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable]')) return;

		if (event.key === ' ') {
			event.preventDefault();
			void scheduler.toggle();
		} else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			if (event.shiftKey) session.redo();
			else session.undo();
		} else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
			event.preventDefault();
			session.redo();
		} else if (event.key >= '1' && event.key <= '4' && !event.metaKey && !event.ctrlKey) {
			session.brush = (['cycle', 'accent', 'soft', 'erase'] as const)[Number(event.key) - 1]!;
		} else if (event.key === 'Escape') {
			close();
		}
	}

	/**
	 * Browsers will not start audio until the person has done something. Any
	 * pointer press on the page counts, so the first one wakes the engine — and
	 * the space bar, which is not a gesture in every browser, then works too.
	 */
	function wake() {
		if (engine.state !== 'running') void engine.resume();
	}

	/** Save battery when the tab is hidden and nothing is playing. */
	function visibility() {
		if (document.hidden && !scheduler.playing) void engine.suspend();
	}

	/* "Saved 3s ago" — a `SvelteDate` for now, ticking, against the session's `savedAt`. */
	const now = new SvelteDate();
	$effect(() => {
		const timer = setInterval(() => now.setTime(Date.now()), 1000);
		return () => clearInterval(timer);
	});
	const savedAgo = $derived.by(() => {
		if (!session.savedAt) return null;
		const seconds = Math.max(0, Math.round((now.getTime() - session.savedAt.getTime()) / 1000));
		return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`;
	});
</script>

<svelte:head>
	<title>{data.title} — Ostinato</title>
</svelte:head>

<!-- Window for shortcuts, document for visibility, body for the audio unlock: each element for what it is the right listener for. -->
<svelte:window onkeydown={keydown} />
<svelte:document onvisibilitychange={visibility} />
<svelte:body onpointerdown={wake} />

<div class="studio page">
	<header class="studio__head">
		<label class="title">
			<span class="visually-hidden">Pattern title</span>
			<input class="title__input" bind:value={session.pattern.title} maxlength="60" />
		</label>

		<div class="cluster">
			<button
				type="button"
				class="btn btn--icon"
				aria-label="Undo"
				disabled={!session.canUndo}
				onclick={() => session.undo()}
			>
				<ArrowUUpLeftIcon size={18} />
			</button>
			<button
				type="button"
				class="btn btn--icon"
				aria-label="Redo"
				disabled={!session.canRedo}
				onclick={() => session.redo()}
			>
				<ArrowUUpRightIcon size={18} />
			</button>

			<label class="field">
				<span class="visually-hidden">Load a preset</span>
				<select
					class="input"
					value=""
					onchange={(e) => e.currentTarget.value && loadPreset(e.currentTarget.value)}
				>
					<option value="">Load a preset…</option>
					{#each PRESET_NAMES as name (name)}
						<option value={name}>{preset(name).title}</option>
					{/each}
				</select>
			</label>

			<label class="field">
				<span class="visually-hidden">Add a track</span>
				<select
					class="input"
					value=""
					onchange={(e) => e.currentTarget.value && addTrack(e.currentTarget.value as Kind)}
				>
					<option value="">＋ Add track…</option>
					{#each KINDS as kind (kind)}
						<option value={kind}>{kind}</option>
					{/each}
				</select>
			</label>

			<button type="button" class="btn btn--primary" onclick={() => open('share')}>
				<ShareNetworkIcon size={16} /> Share
			</button>
		</div>

		<p class="status hint" aria-live="polite">
			{#if savedAgo}
				Published {savedAgo}{session.dirty ? ' · edited since' : ''}
			{:else if session.remixOf}
				Remixing <code>{session.remixOf}</code>
			{:else}
				Saved in this browser as you go
			{/if}
		</p>
	</header>

	<div class="studio__body">
		<div class="studio__main stack">
			<div class="transport-wrap">
				<Transport
					{engine}
					{scheduler}
					bind:bpm={session.pattern.bpm}
					bind:swing={session.pattern.swing}
					onstart={() => session.commit()}
				/>
			</div>

			<!--
				`{#key}` destroys and recreates its contents when the expression
				changes: a whole new grid for a whole new pattern, so no row
				transition from the old one plays against the new.
			-->
			{#key session.generation}
				<svelte:boundary onerror={(error) => toast((error as Error).message, 'error')}>
					<StepGrid
						pattern={session.pattern}
						step={scheduler.step}
						bind:brush={session.brush}
						selected={session.selected}
						onpaint={(track, index) => session.paint(track, index)}
						ontranspose={(track, index, semitones) => session.transpose(track, index, semitones)}
						onfill={(track, on) => session.fill(track, on)}
						onselect={(track) => {
							session.selected = track;
							open('sound');
						}}
						onmove={(track, direction) => session.moveTrack(track, direction)}
						onremove={(track) => session.removeTrack(track)}
						onrename={(track, name) => {
							const t = session.track(track);
							if (t) t.name = name;
						}}
					/>

					{#snippet failed(error, reset)}
						<p class="issue">The grid could not be drawn: {(error as Error).message}</p>
						<button type="button" class="btn" onclick={reset}>Try again</button>
					{/snippet}
				</svelte:boundary>
			{/key}

			<p class="hint keys">
				<kbd>space</kbd> play · <kbd>1</kbd>–<kbd>4</kbd> brush · <kbd>⌘Z</kbd> undo · click a
				track's
				<PlusIcon size={12} /> to add, sliders to edit its sound
			</p>
		</div>

		<aside class="studio__mixer">
			<Mixer pattern={session.pattern} {engine} onstart={() => session.commit()} />
		</aside>
	</div>
</div>

{#if page.state.panel === 'sound' && selectedTrack}
	<Sheet title="Sound: {selectedTrack.name}" onclose={close}>
		<SoundPanel {session} track={selectedTrack} />
	</Sheet>
{:else if page.state.panel === 'share'}
	<Sheet title="Share" onclose={close}>
		<SharePanel {session} />
	</Sheet>
{/if}

<style>
	.studio {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding-block: var(--space-4) var(--space-8);
	}

	.studio__head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.title {
		flex: 1 1 14rem;
	}

	.title__input {
		width: 100%;
		padding: var(--space-1) 0;
		border: 0;
		border-bottom: 1px solid transparent;
		background: transparent;
		font-size: var(--fs-xl);
		font-weight: var(--weight-bold);
		letter-spacing: -0.02em;
	}

	.title__input:focus {
		outline: none;
		border-bottom-color: var(--accent);
	}

	.status {
		flex-basis: 100%;
	}

	.studio__body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.transport-wrap {
		position: sticky;
		top: 3.5rem;
		z-index: var(--z-sticky);
		margin-inline: calc(-1 * var(--gutter));
		padding-inline: var(--gutter);
		background: color-mix(in oklab, var(--bg) 92%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--border);
	}

	.keys {
		display: none;
	}

	@media (min-width: 40rem) {
		.keys {
			display: block;
		}
	}

	@media (min-width: 64rem) {
		.studio__body {
			display: grid;
			grid-template-columns: 1fr 17rem;
			align-items: start;
		}

		.studio__mixer {
			position: sticky;
			top: 4.5rem;
		}

		.transport-wrap {
			margin-inline: 0;
			padding-inline: 0;
		}
	}
</style>
