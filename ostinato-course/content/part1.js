/**
 * PART 1 — The model: notes, time, patterns, and a pattern in a URL
 * (chapters 04–08)
 *
 * Nothing here knows about Svelte or the browser. That is the point: the
 * model is plain data and pure functions, which is what makes it testable in
 * Node in under a second, and what makes the reactive layer above it simple.
 */

import { code } from './quote.js';

export const part1 = [
	{
		slug: 'a-note-is-a-class',
		title: 'A note is a class',
		summary:
			'One number — the MIDI note — and everything a sequencer needs derived from it. Why it is a class, why it is immutable, and why that combination is exactly what `$state` wants.',
		goal: 'Write a small immutable value object, know when a class belongs inside reactive state, and see how one decision here pays off in the transport hook later.',
		blocks: [
			{
				type: 'p',
				text: 'Start with the smallest thing in the project. A note is a MIDI number — 60 is middle C, each step up is a semitone — and two things every part of the app asks a note for: its frequency, so the synth can play it, and its name, so the pad can show it.'
			},
			code('src/lib/music/note.ts', 1, 33),
			{
				type: 'p',
				text: 'The header explains the two decisions. It is a **class**, because computing `frequency` in four places is how one of them ends up with A = 435. And it is **immutable**: `transpose()` returns a new note.'
			},
			code('src/lib/music/note.ts', 35, 68, { partial: true }),
			{
				type: 'why',
				title: 'Why immutable, and why that matters for $state',
				text: 'Svelte’s `$state` makes plain objects and arrays deeply reactive by wrapping them in proxies. It leaves class instances alone. So a `Note` inside a `$state` pattern is not observed *inside* — and because it never changes inside, there is nothing to observe. Replacing it (`step.note = step.note.transpose(1)`) is the change, and replacing a property of a `$state` object is exactly what Svelte does observe. Immutability is what makes “a class inside reactive state” safe rather than a trap.'
			},
			code('src/lib/music/note.ts', 77, 113, { partial: true }),
			{
				type: 'p',
				text: '`transpose` returns `this` when nothing changed. That is not an optimisation; it is a correctness detail for reactivity — assigning the same object back to `step.note` is not a change, so nothing re-renders, so holding the up arrow at the top of the range does not repaint a hundred pads for nothing. The test pins it.'
			},
			code('src/lib/music/note.spec.ts', 26, 37),
			{
				type: 'note',
				text: '`toJSON` returns the number, so `JSON.stringify` of a pattern writes `57` rather than `{"midi":57}`. Chapter 26 shows the `transport` hook doing the same thing in both directions for SvelteKit’s wire format — which is why a pattern arrives in the browser with real `Note`s in it.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why `Note` is a class and why it is immutable, and how those two facts relate to `$state`.',
					'You can explain what `transpose` returning `this` buys.',
					'Run `pnpm vitest run --project server src/lib/music` and watch it pass.'
				]
			}
		]
	},

	{
		slug: 'musical-time',
		title: 'Musical time, in seconds',
		summary:
			'The conversions between steps and seconds — tempo, swing, velocity — kept apart from both the scheduler and the pattern so they can be tested with a calculator.',
		goal: 'Know what a sixteenth note is in seconds at a tempo, what swing does to it, and why velocity maps to gain on a curve.',
		blocks: [
			{
				type: 'p',
				text: 'The scheduler thinks in the audio clock — seconds since the `AudioContext` was created. The pattern thinks in steps. Four small functions convert between them.'
			},
			code('src/lib/music/time.ts', 1, 18),
			code('src/lib/music/time.ts', 20, 41),
			{
				type: 'p',
				text: 'Swing is the one worth reading twice. Straight sixteenths land on an even grid; swing delays every *second* step so a pair becomes long-short. At `amount = 1` the second step lands two thirds of the way through the pair — a full triplet feel. It is returned as an *offset* for the caller to add, so the scheduler keeps one simple, even clock and applies the feel on top. The alternative — shortening the *following* step — sounds identical and is far harder to reason about, because then the length of a step depends on which step it is.'
			},
			code('src/lib/music/time.ts', 44, 55),
			{
				type: 'why',
				title: 'Why velocity is squared',
				text: 'MIDI velocity is 0–127 and gain is 0–1, and the obvious mapping is a straight line. But loudness as an ear hears it is closer to the square of the control than to the control itself: a straight line makes the bottom half of the range nearly inaudible and the top half indistinguishable. Squaring is the cheapest curve that fixes both ends. The test checks the ends are fixed and the middle is below the line.'
			},
			code('src/lib/music/note.spec.ts', 50, 78),
			{
				type: 'checkpoint',
				items: [
					'You can compute the length of a step at 120 bpm in your head (an eighth of a second).',
					'You can say why swing is an offset added to odd steps rather than a change to step length.'
				]
			}
		]
	},

	{
		slug: 'the-pattern',
		title: 'The pattern',
		summary:
			'Everything the sequencer plays, as plain data — a deliberate choice about what `$state` can and cannot see — plus the valibot schemas that check a pattern arriving from anywhere.',
		goal: 'Design a model that is deeply reactive under `$state`, understand why it holds plain objects and one immutable class, and read a valibot schema that mirrors the type.',
		blocks: [
			{
				type: 'p',
				text: 'A pattern is a tempo, a swing amount and up to eight tracks of sixteen steps. This file is the vocabulary the rest of the project speaks.'
			},
			code('src/lib/pattern/model.ts', 1, 24),
			{
				type: 'p',
				text: 'The header is the design. `$state` proxies plain objects and arrays *deeply*: toggling `pattern.tracks[2].steps[7].velocity` updates the one pad that reads it and nothing else. A class with methods would be left alone by the proxy, and every change would have to replace the whole track to be noticed. So the model is data, the operations on it are functions, and the one class — `Note` — is immutable for the reason the previous chapter gave.'
			},
			code('src/lib/pattern/model.ts', 26, 67),
			{
				type: 'p',
				text: '`KINDS` is a `const` tuple, so `Kind` is derived from it and `v.picklist(KINDS)` in the schema cannot drift from the type. `MELODIC` is a set of the kinds that care which note a step carries; drums keep a note anyway, so switching a track from a hat to a bass does not lose anything.'
			},

			{ type: 'h3', id: 'schemas', text: 'The same shape, as a schema' },
			code('src/lib/pattern/model.ts', 69, 106),
			{
				type: 'p',
				text: '`v.instance(Note)` is what ties the schema to the class. A step whose `note` is a bare number fails here — and that is the point: the `transport` hook is supposed to have turned it into a `Note` already, and if it has not, something upstream is wrong and this is where it should be found, not three components later.'
			},

			{ type: 'h3', id: 'operations', text: 'Factories and operations' },
			code('src/lib/pattern/model.ts', 108, 167),
			code('src/lib/pattern/model.ts', 173, 218),
			{
				type: 'why',
				title: 'Why clonePattern exists when $state.snapshot does',
				text: '`$state.snapshot` makes a plain copy of reactive state — and it does so with `structuredClone`, which drops the prototype of any class instance, after calling `toJSON()` if there is one. A `Note` would come back as a number. That is the right behaviour for plain data and the wrong tool for a model with a class in it. `clonePattern` knows what a `Note` is, and chapter 14 shows the session using it for anything that leaves Svelte.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain what “deeply reactive” means and why a class inside `$state` is not.',
					'You can say what `v.instance(Note)` guards against.',
					'You know why `clonePattern` exists next to `$state.snapshot`.'
				]
			}
		]
	},

	{
		slug: 'a-pattern-in-a-url',
		title: 'A pattern in a URL',
		summary:
			'A link is a save. The codec packs a pattern into about two hundred characters of base64url, versioned, with tests for every way a link can be damaged.',
		goal: 'Write a small binary format with a version byte, understand base64url and why it needs no escaping, and test a codec the way a codec must be tested.',
		blocks: [
			{
				type: 'p',
				text: '`/studio?p=…` is the whole pattern. No account, no database, no expiry — paste it into a chat and the other person opens your groove. That only works if the encoding is small: JSON of a four-track pattern is about two kilobytes, which some chat clients truncate. This packs the same thing into about two hundred characters.'
			},
			code('src/lib/pattern/codec.ts', 1, 42),
			{
				type: 'p',
				text: 'The format is a byte layout, versioned by its first byte so that a link made today still opens after the format grows. Notes are written only for melodic tracks — a drum has no use for sixteen of them — which is where a third of the size went.'
			},
			code('src/lib/pattern/codec.ts', 44, 90),
			{
				type: 'p',
				text: '`Writer` and `Reader` are tiny cursors over a byte array. `Reader.byte()` throws a `RangeError` — "Pattern data ended early" — rather than returning `undefined`, so a truncated link fails with a sentence rather than with `NaN` bpm three functions later.'
			},
			code('src/lib/pattern/codec.ts', 92, 121),
			code('src/lib/pattern/codec.ts', 123, 170),
			{
				type: 'p',
				text: 'Track ids are not encoded — they are regenerated on decode. They exist only to key an `{#each}` and mean nothing to another browser; encoding them would be twelve bytes per track of nothing.'
			},

			{ type: 'h3', id: 'base64url', text: 'base64url' },
			code('src/lib/pattern/codec.ts', 169, 187),
			{
				type: 'p',
				text: 'Ordinary base64 uses `+`, `/` and `=`, all of which need percent-encoding in a query string and turn a link into something nobody wants to look at. base64url swaps the first two and drops the padding, and the test asserts the property directly: `encodeURIComponent(text) === text`.'
			},

			{ type: 'h3', id: 'testing-a-codec', text: 'Testing a codec' },
			code('src/lib/pattern/codec.spec.ts', 1, 35, { partial: true }),
			code('src/lib/pattern/codec.spec.ts', 82, 125),
			{
				type: 'why',
				title: 'Why the size test compares against JSON rather than a number',
				text: 'The first version of this test said “under two hundred characters” and failed at 262. The honest fix was not to raise the number; it was to make the encoding smarter (no notes for drums) *and* to state the claim the codec actually makes — smaller than JSON by a wide margin — as a ratio measured against the real thing. A threshold picked to make a test pass is a test that only measures the day it was written.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain the version byte and what would happen without it.',
					'You can say why base64url and not base64.',
					'You can name the three ways a link can be damaged that the tests cover.'
				]
			}
		]
	},

	{
		slug: 'stored-and-preset',
		title: 'Stored patterns and presets',
		summary:
			'The DTO — the pattern as JSON without a `Note` in it — and three presets written as strings you can read like a drum machine.',
		goal: 'Keep one boundary between the model and its storage form, and see how a small string notation makes test data and seeds readable.',
		blocks: [
			{
				type: 'p',
				text: 'The database keeps a pattern as one JSON column, and JSON has no idea what a `Note` is. The DTO is the conversion in both directions, with a schema for what comes *out* of the column — because a row written by last year’s version of the app is exactly as untrusted as a request body.'
			},
			code('src/lib/pattern/dto.ts', 1, 46),
			code('src/lib/pattern/dto.ts', 48, 95),
			{
				type: 'note',
				text: 'Only two places touch a DTO: the storage layer, and the publish form, which carries the pattern in one hidden field because a form field cannot hold a class either. Everything else in the project works with `Pattern`. Keeping that boundary narrow is what lets the `Note` class exist at all.'
			},

			{ type: 'h3', id: 'presets', text: 'Three grooves as strings' },
			code('src/lib/pattern/presets.ts', 1, 43),
			code('src/lib/pattern/presets.ts', 45, 90),
			{
				type: 'why',
				title: 'Why strings and not arrays of objects',
				text: 'A groove is something you *read*. `x---x---x---x---` is four on the floor to anybody who has seen a drum machine; sixteen `{ velocity: 112 }` objects are not. The notation costs two small parsing functions and buys presets, seeds and test fixtures that a person can check by eye — which is how the boom-bap hi-hat pattern was noticed to be wrong the first time.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say which two places in the project use a DTO and why nothing else does.',
					'You can write a new four-track preset in the string notation without looking at the parser.'
				]
			}
		]
	}
];
