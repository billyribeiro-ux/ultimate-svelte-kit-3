<!--
	THE EMBEDDABLE PLAYER
	=====================

	`<ostinato-player pattern="seedfour"></ostinato-player>` on any page, with
	no framework on that page and no iframe. `vite.config.ts` compiles this
	folder — and only this folder — with `customElement: true`, through
	`dynamicCompileOptions`; `vite.embed.config.ts` builds it a second time
	into one standalone file for pages outside the app.

	It shares the engine, the scheduler and the pattern model with the studio,
	and nothing else: no `$app/*`, no remote functions, no context from above.
	A custom element is its own root, mounted by a page we do not control.

	A NOTE ON `options_missing_custom_element`
	-----------------------------------------
	`svelte-check` warns that the compile option is not set, because it reads
	the compiler options itself and does not run the Vite plugin that sets it
	for this folder. The `check` script passes `--compiler-warnings
	"options_missing_custom_element:ignore"` for exactly this file.
-->
<svelte:options
	customElement={{
		tag: 'ostinato-player',
		/*
			An open shadow root: styles are encapsulated either way, and `open`
			lets the host page inspect and, if it must, reach in. For something
			people put on pages we do not control, refusing them that is the
			wrong trade.
		*/
		shadow: 'open',
		props: {
			pattern: { attribute: 'pattern', reflect: true },
			src: { attribute: 'src' },
			playing: { attribute: 'playing', type: 'Boolean', reflect: true }
		},
		/*
			`extend` receives the element class Svelte generated and returns a
			subclass. Methods added here exist from the moment the element is
			created — *before* the inner component mounts on the next tick — so
			a host page can call `player.play()` immediately after inserting it.
			They set a prop; the component reacts to the prop.
		*/
		extend: (Base) =>
			class extends Base {
				play() {
					(this as unknown as { playing: boolean }).playing = true;
				}
				stop() {
					(this as unknown as { playing: boolean }).playing = false;
				}
			}
	}}
/>

<script lang="ts" module>
	/**
	 * Where this script came from, captured while it is still running.
	 *
	 * In the standalone bundle — an IIFE in a `<script src>` — the host page's
	 * tag is `document.currentScript` for exactly as long as the script body
	 * runs, and this module body is part of it. Inside the app, which imports
	 * the element as an ES module, `currentScript` is `null` and the app's own
	 * origin is the right answer. (`import.meta.url` would be the obvious tool
	 * and does not exist in an IIFE.)
	 */
	const scriptSource =
		typeof document !== 'undefined'
			? (document.currentScript as HTMLScriptElement | null)?.src
			: undefined;
	const scriptOrigin = scriptSource
		? new URL(scriptSource).origin
		: typeof location !== 'undefined'
			? location.origin
			: '';
</script>

<script lang="ts">
	import { AudioEngine } from '#lib/audio/engine.svelte.ts';
	import { Scheduler } from '#lib/audio/scheduler.svelte.ts';
	import { fromDto, PatternDtoSchema } from '#lib/pattern/dto.ts';
	import type { Pattern } from '#lib/pattern/model.ts';
	import MiniGrid from '#lib/components/MiniGrid.svelte';
	import * as v from 'valibot';

	let {
		pattern = '',
		src = '',
		playing = false
	}: {
		/** The published pattern's id. */
		pattern?: string;
		/** Where the app lives, for pages on other origins. Defaults to wherever this script came from. */
		src?: string;
		playing?: boolean;
	} = $props();

	const engine = new AudioEngine();
	let loaded = $state<Pattern | null>(null);
	let title = $state('');
	let artist = $state('');
	let error = $state<string | null>(null);

	const scheduler = new Scheduler(engine, () => loaded!, {
		output: (track) => engine.channel(track).input,
		sample: () => undefined
	});

	/**
	 * Where to fetch from: the `src` attribute if the host page set one, else
	 * the origin the script itself was loaded from — so an embed works from
	 * wherever it was served with no configuration.
	 */
	const origin = $derived(src || scriptOrigin);

	/**
	 * `$host()` is the custom element itself. Events dispatched on it are how
	 * an element talks to the page around it: `player.addEventListener('play', …)`
	 * works with nothing but the DOM.
	 */
	function announce(type: 'ready' | 'play' | 'stop' | 'error', detail?: unknown) {
		$host().dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
	}

	// Fetch whenever the id or origin changes. An effect, because a network
	// request in response to a prop is an interaction with the outside world.
	$effect(() => {
		const id = pattern;
		const base = origin;
		if (!id) return;

		let cancelled = false;
		loaded = null;
		error = null;

		fetch(new URL(`/api/patterns/${id}`, base))
			.then(async (response) => {
				if (!response.ok) throw new Error(`No pattern ${id} (${response.status})`);
				const body = await response.json();
				if (cancelled) return;
				title = body.title;
				artist = body.artist;
				loaded = fromDto(v.parse(PatternDtoSchema, body.pattern));
				announce('ready', { id, title: body.title });
			})
			.catch((e: Error) => {
				if (cancelled) return;
				error = e.message;
				announce('error', e.message);
			});

		return () => {
			cancelled = true;
		};
	});

	// The `playing` prop drives the transport; the transport reports back.
	$effect(() => {
		if (!loaded) return;
		if (playing && !scheduler.playing) {
			void scheduler.start().then(() => announce('play'));
		} else if (!playing && scheduler.playing) {
			scheduler.stop();
			announce('stop');
		}
	});

	$effect(() => () => scheduler.stop());
</script>

<div class="player">
	<button
		type="button"
		class="play"
		aria-pressed={playing}
		disabled={!loaded}
		onclick={() => (playing = !playing)}
	>
		{playing ? '■' : '▶'}
	</button>
	<div class="body">
		<div class="meta">
			<strong>{title || (error ? 'Unavailable' : 'Loading…')}</strong>
			{#if artist}<span>@{artist}</span>{/if}
			{#if error}<span class="error">{error}</span>{/if}
		</div>
		{#if loaded}
			<MiniGrid pattern={loaded} playhead={scheduler.step} />
		{/if}
	</div>
	<a class="brand" href="{origin}/p/{pattern}" target="_blank" rel="noopener">Ostinato</a>
</div>

<style>
	:host {
		display: block;
		--hue-kick: 25;
		--hue-snare: 80;
		--hue-hat: 200;
		--hue-clap: 340;
		--hue-bass: 290;
		--hue-lead: 165;
		--hue-sample: 60;
		--surface-active: #2b2b37;
		--playhead: #ffb347;
		--dur-fast: 120ms;
	}

	.player {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border-radius: 12px;
		background: #15151b;
		color: #f1efe9;
		font-family: system-ui, sans-serif;
		font-size: 14px;
	}

	.play {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 50%;
		background: #ffb347;
		color: #1a1206;
		font-size: 16px;
		cursor: pointer;
	}

	.play:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.meta {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}

	.meta span {
		color: #a6a3b3;
		font-size: 12px;
	}

	.error {
		color: #ff6b74;
	}

	.brand {
		color: #6b6a7a;
		font-size: 11px;
		text-decoration: none;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
</style>
