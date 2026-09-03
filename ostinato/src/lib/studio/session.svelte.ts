/**
 * THE STUDIO SESSION
 * ==================
 *
 * The pattern being worked on, and everything about *working on it* that is
 * not the pattern itself: undo, the selected track, whether it has changed
 * since it was last saved, where it came from.
 *
 * A class in a `.svelte.ts` file, so that `$state` works in it and so that it
 * can be tested without a component. The pattern is deep `$state`: toggling
 * one step updates the one pad that shows it. Everything else is small.
 *
 * UNDO IS SNAPSHOTS
 * -----------------
 * Before every change that a person would want to take back, `commit()` pushes
 * a copy of the whole pattern — in DTO form, which is plain data with no
 * proxies in it, safe to keep in an array nothing observes, and small. A
 * pattern is a couple of kilobytes; a hundred of them is nothing, and the
 * limit is there so that a long session cannot grow without bound.
 */

import { SvelteDate } from 'svelte/reactivity';
import { decodePattern, encodePattern } from '#lib/pattern/codec.ts';
import { fromDto, toDto, type PatternDto } from '#lib/pattern/dto.ts';
import {
	clonePattern,
	createTrack,
	cycleVelocity,
	defaultNote,
	emptyPattern,
	MAX_TRACKS,
	MELODIC,
	type Kind,
	type Pattern,
	type Track
} from '#lib/pattern/model.ts';

const STORAGE_KEY = 'ostinato:session';
const HISTORY_LIMIT = 100;

/** How a step is painted: the pad's default cycle, or a fixed velocity. */
export type Brush = 'cycle' | 'accent' | 'soft' | 'erase';

export class Session {
	pattern = $state<Pattern>(emptyPattern());
	/** Which track the sound panel is editing. */
	selected = $state<string | null>(null);
	brush = $state<Brush>('cycle');
	/** The published pattern this is a remix of, if any. */
	remixOf = $state<string | null>(null);
	/** Changes since the last `markSaved()`. */
	dirty = $state(false);
	/**
	 * When the pattern was last saved, as a reactive date. `SvelteDate` is a
	 * `Date` whose reads are tracked — so the "saved 3s ago" label re-renders
	 * when the *clock* it is compared against ticks, not just when this changes.
	 */
	savedAt = $state<SvelteDate | null>(null);
	/** Bumped whenever a whole new pattern is loaded; `{#key}` in the grid watches it. */
	generation = $state(0);

	#undo: PatternDto[] = [];
	#redo: PatternDto[] = [];
	canUndo = $state(false);
	canRedo = $state(false);

	/* ---------------------------------------------------------------- */
	/* Loading                                                           */
	/* ---------------------------------------------------------------- */

	load(pattern: Pattern, options: { remixOf?: string | null; keepHistory?: boolean } = {}): void {
		if (!options.keepHistory) {
			this.#undo.length = 0;
			this.#redo.length = 0;
			this.#syncHistoryFlags();
		}
		this.pattern = pattern;
		this.remixOf = options.remixOf ?? null;
		this.selected = pattern.tracks[0]?.id ?? null;
		this.dirty = false;
		this.generation += 1;
	}

	/** The `?p=` form of the current pattern — the share link. */
	get encoded(): string {
		return encodePattern(this.pattern);
	}

	/**
	 * A copy with no proxies in it, for anything that leaves Svelte.
	 *
	 * NOT `$state.snapshot`, and the reason is worth knowing. `$state.snapshot`
	 * clones with `structuredClone`, which drops the prototype of any class
	 * instance — and calls `toJSON()` first if there is one. A `Note` would come
	 * back as a number. It is the right tool for plain data and the wrong tool
	 * for a model with a class in it; `clonePattern` knows what a `Note` is.
	 */
	snapshot(): Pattern {
		return clonePattern(this.pattern);
	}

	/* ---------------------------------------------------------------- */
	/* History                                                           */
	/* ---------------------------------------------------------------- */

	/** Call before a change a person might want back. */
	commit(): void {
		// `toDto` reads through the proxy and writes plain data: a snapshot by construction.
		this.#undo.push(toDto(this.pattern));
		if (this.#undo.length > HISTORY_LIMIT) this.#undo.shift();
		this.#redo.length = 0;
		this.dirty = true;
		this.#syncHistoryFlags();
	}

	undo(): void {
		const previous = this.#undo.pop();
		if (!previous) return;
		this.#redo.push(toDto(this.pattern));
		this.pattern = fromDto(previous);
		this.dirty = true;
		this.#syncHistoryFlags();
	}

	redo(): void {
		const next = this.#redo.pop();
		if (!next) return;
		this.#undo.push(toDto(this.pattern));
		this.pattern = fromDto(next);
		this.dirty = true;
		this.#syncHistoryFlags();
	}

	#syncHistoryFlags(): void {
		this.canUndo = this.#undo.length > 0;
		this.canRedo = this.#redo.length > 0;
	}

	/* ---------------------------------------------------------------- */
	/* Editing                                                           */
	/* ---------------------------------------------------------------- */

	track(id: string): Track | undefined {
		return this.pattern.tracks.find((track) => track.id === id);
	}

	/** Paint a step with the current brush. */
	paint(trackId: string, index: number): void {
		const track = this.track(trackId);
		const step = track?.steps[index];
		if (!step) return;

		const next =
			this.brush === 'cycle'
				? cycleVelocity(step.velocity)
				: this.brush === 'accent'
					? 112
					: this.brush === 'soft'
						? 64
						: 0;
		if (next === step.velocity) return;

		this.commit();
		step.velocity = next;
	}

	setVelocity(trackId: string, index: number, velocity: number): void {
		const step = this.track(trackId)?.steps[index];
		if (!step || step.velocity === velocity) return;
		this.commit();
		step.velocity = velocity;
	}

	transpose(trackId: string, index: number, semitones: number): void {
		const track = this.track(trackId);
		const step = track?.steps[index];
		if (!track || !step || !MELODIC.has(track.kind)) return;
		const note = step.note.transpose(semitones);
		if (note === step.note) return;
		this.commit();
		step.note = note;
	}

	/** Every step of a track on or off — the row's checkbox. */
	fill(trackId: string, on: boolean): void {
		const track = this.track(trackId);
		if (!track) return;
		this.commit();
		for (const step of track.steps) step.velocity = on ? 96 : 0;
	}

	clear(trackId: string): void {
		this.fill(trackId, false);
	}

	addTrack(kind: Kind): Track | null {
		if (this.pattern.tracks.length >= MAX_TRACKS) return null;
		this.commit();
		const track = createTrack(kind);
		this.pattern.tracks.push(track);
		this.selected = track.id;
		return track;
	}

	removeTrack(id: string): void {
		const index = this.pattern.tracks.findIndex((track) => track.id === id);
		if (index === -1 || this.pattern.tracks.length === 1) return;
		this.commit();
		this.pattern.tracks.splice(index, 1);
		if (this.selected === id) this.selected = this.pattern.tracks[0]?.id ?? null;
	}

	/** Reorder by dragging; `animate:flip` in the grid draws the move. */
	moveTrack(id: string, direction: -1 | 1): void {
		const tracks = this.pattern.tracks;
		const from = tracks.findIndex((track) => track.id === id);
		const to = from + direction;
		if (from === -1 || to < 0 || to >= tracks.length) return;
		this.commit();
		const [track] = tracks.splice(from, 1);
		tracks.splice(to, 0, track!);
	}

	/** Change what a track *is*; melodic tracks get a sensible starting note. */
	setKind(id: string, kind: Kind): void {
		const track = this.track(id);
		if (!track || track.kind === kind) return;
		this.commit();
		const wasMelodic = MELODIC.has(track.kind);
		track.kind = kind;
		if (MELODIC.has(kind) && !wasMelodic) {
			for (const step of track.steps) step.note = defaultNote(kind);
		}
	}

	/* ---------------------------------------------------------------- */
	/* Persistence                                                       */
	/* ---------------------------------------------------------------- */

	/** Write to `localStorage`. Cheap enough to call on every change. */
	persist(): void {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ p: this.encoded, remixOf: this.remixOf }));
		} catch {
			// Private mode, full quota: the studio still works, it just forgets.
		}
	}

	/** Whatever the last visit left behind, or `false` if nothing usable. */
	restore(): boolean {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return false;
			const saved = JSON.parse(raw) as { p: string; remixOf: string | null };
			this.load(decodePattern(saved.p), { remixOf: saved.remixOf });
			return true;
		} catch {
			return false;
		}
	}

	markSaved(): void {
		this.dirty = false;
		this.savedAt = new SvelteDate();
	}

	/**
	 * Autosave: persist after every change, without a save button.
	 *
	 * `$effect.root` creates an effect *outside* a component. The session is
	 * built by the studio page and would normally create its effects in that
	 * component's context — but it is also built by tests, where there is no
	 * component, and an `$effect` there would throw. A root effect works in
	 * both and returns the function that tears it down, which the page calls
	 * from its own cleanup.
	 *
	 * Reading `this.encoded` inside the effect is what subscribes it to every
	 * step, knob and title — the whole pattern, because the encoding reads the
	 * whole pattern.
	 */
	autosave(): () => void {
		return $effect.root(() => {
			let first = true;
			$effect(() => {
				void this.encoded;
				void this.remixOf;

				/*
				 * Skip the first run. The effect fires once with the pattern the page
				 * started from — a preset, or the server's placeholder for a fresh
				 * visit — and persisting *that* would overwrite the saved session
				 * moments before `restore()` reads it. Only changes are saved.
				 */
				if (first) {
					first = false;
					return;
				}
				this.persist();
			});
		});
	}
}
