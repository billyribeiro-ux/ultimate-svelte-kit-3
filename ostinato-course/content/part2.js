/**
 * PART 2 — The engine: instruments, scheduling, and the boundary with Web Audio
 * (chapters 09–13)
 *
 * The part with the most physics and the least Svelte — until chapter 11,
 * where the engine meets reactivity and the two most useful runtime APIs in
 * this project (`createSubscriber` and `SvelteMap.getOrInsertComputed`) earn
 * their place.
 */

import { code } from './quote.js';

export const part2 = [
	{
		slug: 'the-instruments',
		title: 'The instruments',
		summary:
			'A kick, a snare, a hi-hat, a clap, a bass and a lead, each built from oscillators, noise and a filter at the moment it is needed. No samples, and a recipe you can read.',
		goal: 'Understand how a synthesised drum is made from three questions — what decays, how fast, through what filter — and why every voice function takes a *time* rather than playing now.',
		blocks: [
			{
				type: 'p',
				text: 'Every sound in Ostinato is built when it is needed, from parts the browser provides. That is a deliberate choice for a project about a framework: a synthesised kit is a few hundred readable lines, and a sample pack is two hundred megabytes nobody can read.'
			},
			code('src/lib/audio/voices.ts', 1, 47),
			{
				type: 'p',
				text: 'The header makes the one promise every function keeps: nothing plays *now*; everything plays *then*. Each voice takes a `time` on the context’s clock and schedules its nodes to start there. That is how Web Audio wants to be used — chapter 12 explains why — and it is also what lets the same functions render a whole pattern to a file through an `OfflineAudioContext`, which is a `BaseAudioContext` like the live one except that it runs as fast as it can.'
			},

			{ type: 'h3', id: 'noise-and-envelopes', text: 'Noise and envelopes' },
			code('src/lib/audio/voices.ts', 50, 92),
			{
				type: 'p',
				text: 'Two helpers. The noise buffer is made once per context and kept in a `WeakMap`, because an `OfflineAudioContext` is created per export and thrown away — a plain `Map` would keep every one of them alive. The envelope is a gain that opens instantly and closes exponentially, and the `0.0001` is not a typo: exponential ramps cannot reach zero, so the target is a value quiet enough to be silence and the node is stopped just after.'
			},

			{ type: 'h3', id: 'drums', text: 'How a drum is made' },
			code('src/lib/audio/voices.ts', 94, 112),
			{
				type: 'p',
				text: 'A kick is a sine wave whose pitch falls from about 150Hz to 40Hz in a few dozen milliseconds. The fall *is* the click at the front; the tail is the sine settling at its low pitch and fading. `tone` sets how high the pitch starts, `decay` how long the tail lasts. Every drum below is the same three questions with different answers.'
			},
			code('src/lib/audio/voices.ts', 114, 136),
			code('src/lib/audio/voices.ts', 166, 195),
			{
				type: 'why',
				title: 'Why a clap is four bursts',
				text: 'A clap is several people not clapping at quite the same moment. Rendering it as one burst of noise sounds like a snare with the head removed; three very short bursts ten milliseconds apart and then one longer tail is the whole character. The numbers came from an afternoon of listening, and the comment says so — a magic number with a reason attached is documentation; without one it is a superstition.'
			},

			{ type: 'h3', id: 'synths', text: 'Bass and lead' },
			code('src/lib/audio/voices.ts', 197, 232),
			{
				type: 'p',
				text: 'A sawtooth through a low-pass filter whose cutoff *moves* — open with the note, closing as it decays. That moving filter is the sound of every analogue synth bass ever recorded, and `tone` is how far it opens. The lead is two square waves detuned a few cents apart, which is where its width comes from.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can describe a kick, a snare and a clap as “what decays, how fast, through what”.',
					'You can say why every voice takes a `time` argument and what an `OfflineAudioContext` is.',
					'Open `SoundPanel.svelte`’s Audition button later and hear each of these with its knobs.'
				]
			}
		]
	},

	{
		slug: 'one-step-scheduled',
		title: 'One step, scheduled',
		summary:
			'The function both players share: given a pattern, a step index and a time, schedule every hit. Sharing it is what makes “the file sounds like the studio” a property rather than a hope.',
		goal: 'Factor the one piece of logic two different callers need into a pure function with a narrow interface, and make an exhaustive switch fail to compile when a case is missing.',
		blocks: [
			code('src/lib/audio/schedule.ts', 1, 31),
			{
				type: 'p',
				text: '`Outputs` is the whole of what the function needs from its caller: where a track’s sound goes, and the decoded file for a sample track. The live engine answers with a channel strip; the offline renderer answers with a plain gain. Neither knows about the other.'
			},
			code('src/lib/audio/schedule.ts', 33, 88),
			{
				type: 'why',
				title: 'Why `satisfies never` at the bottom of the switch',
				text: 'Adding an instrument to `KINDS` without adding a case here would play silence for it — a bug that shows up as “the new track does nothing” with no error anywhere. `track.kind satisfies never` in the `default` branch makes it a compile error instead: if any kind is left unhandled, its type is not `never`, and TypeScript says so at the line that needs the case. The `noFallthroughCasesInSwitch` flag in `tsconfig.json` catches the other way to get this wrong.'
			},
			{
				type: 'note',
				text: 'A melodic note is held for 80% of its step. The gap is what makes two consecutive notes sound like two notes rather than one long one; a hold of 100% would tie every run of notes together.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can name the two callers of `scheduleStep` and what each passes as `Outputs`.',
					'You can explain what `satisfies never` does and reproduce the error by adding a kind.'
				]
			}
		]
	},

	{
		slug: 'the-engine',
		title: 'The engine: where the audio graph meets reactivity',
		summary:
			'One `AudioContext`, created lazily, a master fader, and a channel strip per track built on first request with `getOrInsertComputed`. The `state` getter is the bridge between a browser event and Svelte, built on `createSubscriber`.',
		goal: 'Use `createSubscriber` to make a browser API reactive without leaking listeners, prefer a setter over an effect for a value that has a consequence, and use Svelte 5.57’s `getOrInsertComputed` for “make it once”.',
		blocks: [
			code('src/lib/audio/engine.svelte.ts', 1, 39),
			{
				type: 'p',
				text: 'Browsers refuse to start audio without a user gesture, so the context is created on the first *use*, which is always inside a click. The interface needs to know whether sound can currently happen — and `AudioContext.state` is not Svelte state. It is a browser property that changes when the browser decides, and announces it with a `statechange` event.'
			},

			{ type: 'h3', id: 'createsubscriber', text: 'createSubscriber: the bridge' },
			code('src/lib/audio/engine.svelte.ts', 41, 94, { partial: true }),
			{
				type: 'why',
				title: 'Why createSubscriber and not an effect that polls',
				text: '`createSubscriber` hands you an `update` function, and any effect that read the getter re-runs when you call it. The listener is attached while something is watching and removed when nothing is — which is the difference between a subscription and a leak. The twist here is that the context may not exist when the first effect subscribes, so `update` is *kept* and called from the `statechange` listener attached at creation time, and once immediately, because going from “no context” to “a suspended one” is itself a change. This is the same shape Svelte’s own `MediaQuery` has, and the shape a `WebSocket` wrapper would have.'
			},

			{ type: 'h3', id: 'setter-not-effect', text: 'A setter, not an effect' },
			code('src/lib/audio/engine.svelte.ts', 111, 135),
			{
				type: 'p',
				text: 'The obvious way to connect `volume` to the gain node is an `$effect` that watches one and pokes the other. The setter is better: the value and its consequence change in the same place, there is nothing to synchronise, and `setTargetAtTime` gives the fader a twenty-millisecond glide so it never clicks. “Use `$effect` to sync state” is the first habit to unlearn in Svelte 5, and this is the pattern that replaces it.'
			},

			{ type: 'h3', id: 'getorinsertcomputed', text: 'getOrInsertComputed (Svelte 5.57)' },
			code('src/lib/audio/engine.svelte.ts', 137, 165),
			{
				type: 'p',
				text: 'The old spelling was `get`, an `if`, a `new` and a `set` — and the old bug was building a second strip because two callers raced through the `if`. A track with two outputs plays at double volume, which is a good bug to never write again. `getOrInsertComputed` is exactly “look it up, and if it is not there, build it once and keep it”. `channels` is a `SvelteMap` because the mixer reads `has(track.id)` to decide whether to draw a meter, and a meter that appears on its own the first time a track sounds is nicer than one that waits for a re-render.'
			},
			code('src/lib/audio/engine.svelte.ts', 167, 190, { partial: true }),
			{
				type: 'note',
				text: '`level()` is static and not reactive on purpose. The meter that draws it runs on `requestAnimationFrame` — the right clock for something that changes sixty times a second — and routing that through the reactivity system would be a signal write per frame to notify nobody.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain what `createSubscriber` gives you and when its cleanup runs.',
					'You can say why `volume` is a setter and what the `$effect` version would have cost.',
					'You can write `getOrInsertComputed` from memory and name the bug it prevents.'
				]
			}
		]
	},

	{
		slug: 'two-clocks',
		title: 'Two clocks: the scheduler',
		summary:
			'The heart of the instrument. Why `setInterval` cannot keep time, how a look-ahead timer and the audio clock together can, and why the playhead is a third clock.',
		goal: 'Build a sequencer that does not drift, understand which of its three clocks each piece of state belongs to, and know why the pattern is read through a getter.',
		blocks: [
			code('src/lib/audio/scheduler.svelte.ts', 1, 42),
			{
				type: 'p',
				text: 'Read the header slowly; it is the most important idea in the engine. A JavaScript timer fires *at least* as late as you asked, and later when the tab is busy. Web Audio has its own clock, accurate to a sample, and every sound can be told *when* to start on it. So the timer is used only to look ahead: every 25ms it schedules whatever falls in the next 100ms, exactly. The timer can be 50ms late and nothing is heard, because everything it needed to schedule was already scheduled last time.'
			},
			code('src/lib/audio/scheduler.svelte.ts', 44, 79, { partial: true }),
			{
				type: 'why',
				title: 'Why the pattern is a getter',
				text: 'The scheduler is built with `() => session.pattern`, not `session.pattern`. The timer calls the getter on every tick, so a step toggled while playing is heard the next time the playhead reaches it. Reading `$state` inside a timer is *untracked* — nothing re-runs because the pattern changed — which is exactly what we want here: the next tick simply sees the new one. This is the difference between “reactive” and “current”, and a scheduler wants the second.'
			},
			code('src/lib/audio/scheduler.svelte.ts', 81, 111),
			code('src/lib/audio/scheduler.svelte.ts', 112, 141, { partial: true }),
			{
				type: 'p',
				text: 'The tick loop schedules steps until it is 100ms ahead; tempo is read per step, so a BPM change lands on the next sixteenth rather than the next bar. Each scheduled step is pushed onto a queue with its audio time, and a `requestAnimationFrame` loop pops the ones whose time has come and sets `step` — which *is* `$state`, so the grid highlights the right column on the frame it starts. The queue itself is a plain array: nothing renders from it, and a proxy around something touched a hundred times a second would be a hundred signal writes to notify nobody.'
			},
			{
				type: 'note',
				text: 'The ESLint rule `svelte/prefer-svelte-reactivity` is turned off for this one file, in `eslint.config.js`, with the reason written next to it. A rule that is right almost everywhere is worth keeping on almost everywhere, and the exception is worth recording where it is made.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain the two-clock design to somebody who has never used Web Audio.',
					'You can name the three clocks and which state lives on each: the timer, the audio clock, the animation frame.',
					'You can say why `step` is `$state` and the queue is not.'
				]
			}
		]
	},

	{
		slug: 'render-to-a-file',
		title: 'Render to a file, and load one',
		summary:
			'The same scheduling function through an `OfflineAudioContext` gives a WAV that sounds like the studio; forty-four bytes of header make it a file every editor opens; and a `SvelteMap` holds the samples people drop on a track.',
		goal: 'Render audio offline, write a WAV without a library, and keep decoded samples in reactive state without proxying the buffers.',
		blocks: [
			code('src/lib/audio/render.ts', 1, 62),
			{
				type: 'p',
				text: '`OfflineAudioContext` is the live context’s twin. Because `scheduleStep` is the same function, the file *is* the groove — not an approximation of it with slightly different swing. Offline, a channel strip is a gain and a pan; the meters are not needed.'
			},
			code('src/lib/audio/wav.ts', 1, 60),
			{
				type: 'p',
				text: 'The oldest audio format still in daily use, and the simplest: a 44-byte header and the samples as interleaved 16-bit integers. Every number is little-endian, hence the `true`s. The clamp matters: a hot mix can exceed ±1, and a float that wraps around in 16 bits is the loudest possible click. The function is pure — arrays in, bytes out — so its test needs no browser.'
			},
			code('src/lib/audio/wav.spec.ts', 25, 62),
			{
				type: 'why',
				title: 'Why the test reads the header back with a DataView',
				text: 'A WAV header is forty-four bytes of numbers that every player checks and nobody can read by eye. The test reads them back exactly the way a decoder would, so “the sample rate is at offset 24, little-endian, 32 bits” is asserted rather than assumed. When the encoder was first written it truncated instead of rounding; the interleave test caught a one-off in the very first run.'
			},

			{ type: 'h3', id: 'samples', text: 'Samples' },
			code('src/lib/audio/samples.svelte.ts', 1, 53),
			{
				type: 'p',
				text: '`SvelteMap` again, and again for a specific reader: the grid asks `has(track.id)` to show whether a track has anything to play. The `AudioBuffer` values are left alone — `SvelteMap` makes the *map* reactive, not what is in it — which is what you want for a buffer of a million floats. The ten-second cap is there because a sample track plays one hit per step, and a three-minute song on it is a mistake that would hold thirty megabytes for the rest of the session.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what an `OfflineAudioContext` shares with the live one and what it does not.',
					'You can describe the WAV header well enough to write one.',
					'You can explain what `SvelteMap` makes reactive and what it leaves alone.'
				]
			}
		]
	}
];
