import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { Note } from '#lib/music/note.ts';
import { PRESETS } from '#lib/pattern/presets.ts';
import { Session } from './session.svelte.ts';

/**
 * The session is `$state` in a class, tested without a component. Two things
 * make that possible: the file is `.svelte.test.ts`, so runes compile in it,
 * and `flushSync` forces the effects that would otherwise wait for the next
 * microtask.
 */

const load = () => {
	const session = new Session();
	session.load(PRESETS['boom-bap']!());
	return session;
};

describe('painting', () => {
	it('cycles off → accent → soft → off with the default brush', () => {
		const session = load();
		const track = session.pattern.tracks[0]!;
		// Step 1 of the boom-bap kick is a rest.
		expect(track.steps[1]!.velocity).toBe(0);

		session.paint(track.id, 1);
		expect(track.steps[1]!.velocity).toBe(112);
		session.paint(track.id, 1);
		expect(track.steps[1]!.velocity).toBe(64);
		session.paint(track.id, 1);
		expect(track.steps[1]!.velocity).toBe(0);
	});

	it('paints a fixed velocity with the other brushes, and skips no-ops', () => {
		const session = load();
		const track = session.pattern.tracks[0]!;

		session.brush = 'soft';
		session.paint(track.id, 1);
		expect(track.steps[1]!.velocity).toBe(64);
		expect(session.canUndo).toBe(true);

		session.undo();
		session.paint(track.id, 1);
		session.paint(track.id, 1); // same brush, same value: not a change
		session.undo();
		// Undo replaces the whole pattern, so read it fresh: the `track` above is
		// the object from before the first undo, and it is no longer the pattern.
		expect(session.pattern.tracks[0]!.steps[1]!.velocity).toBe(0);
		expect(session.canUndo).toBe(false);
	});

	it('transposes only melodic tracks, immutably', () => {
		const session = load();
		const lead = session.pattern.tracks.find((t) => t.kind === 'lead')!;
		const kick = session.pattern.tracks[0]!;
		const before = lead.steps[0]!.note;

		session.transpose(lead.id, 0, 12);
		expect(lead.steps[0]!.note.midi).toBe(before.midi + 12);
		expect(before.midi).toBe(Note.parse('E4').midi); // the old note is untouched

		session.transpose(kick.id, 0, 12);
		expect(kick.steps[0]!.note.midi).toBe(60);
	});
});

describe('history', () => {
	it('undoes and redoes whole patterns', () => {
		const session = load();
		const track = session.pattern.tracks[0]!;

		session.paint(track.id, 1);
		session.paint(track.id, 2);
		expect(session.pattern.tracks[0]!.steps[2]!.velocity).toBe(112);

		session.undo();
		expect(session.pattern.tracks[0]!.steps[2]!.velocity).toBe(0);
		expect(session.pattern.tracks[0]!.steps[1]!.velocity).toBe(112);

		session.redo();
		expect(session.pattern.tracks[0]!.steps[2]!.velocity).toBe(112);
		expect(session.canRedo).toBe(false);
	});

	it('forgets the redo stack when a new change is made', () => {
		const session = load();
		const track = session.pattern.tracks[0]!;
		session.paint(track.id, 1);
		session.undo();
		session.paint(track.id, 3);
		expect(session.canRedo).toBe(false);
	});

	it('keeps notes as notes across an undo', () => {
		const session = load();
		const lead = session.pattern.tracks.find((t) => t.kind === 'lead')!;
		session.transpose(lead.id, 0, 1);
		session.undo();
		expect(session.pattern.tracks.find((t) => t.kind === 'lead')!.steps[0]!.note).toBeInstanceOf(
			Note
		);
	});
});

describe('tracks', () => {
	it('adds up to eight and never removes the last one', () => {
		const session = new Session();
		expect(session.pattern.tracks).toHaveLength(4);
		for (let i = 0; i < 6; i += 1) session.addTrack('clap');
		expect(session.pattern.tracks).toHaveLength(8);
		expect(session.addTrack('hat')).toBeNull();

		for (const track of [...session.pattern.tracks]) session.removeTrack(track.id);
		expect(session.pattern.tracks).toHaveLength(1);
	});

	it('moves a track and stops at the edges', () => {
		const session = load();
		const [first, second] = session.pattern.tracks.map((t) => t.id);
		session.moveTrack(first!, 1);
		expect(session.pattern.tracks.map((t) => t.id).slice(0, 2)).toEqual([second, first]);
		session.moveTrack(second!, -1);
		session.moveTrack(second!, -1);
		expect(session.pattern.tracks[0]!.id).toBe(second);
	});

	it('gives a drum turned into a bass a bass note to start from', () => {
		const session = load();
		const kick = session.pattern.tracks[0]!;
		session.setKind(kick.id, 'bass');
		expect(session.pattern.tracks[0]!.steps[0]!.note.midi).toBe(40);
	});
});

describe('autosave', () => {
	it('persists after every change through a root effect', () => {
		const written: string[] = [];
		const fake = {
			getItem: () => null,
			setItem: (_key: string, value: string) => written.push(value)
		};
		Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true });

		const session = load();
		const stop = session.autosave();
		flushSync();
		// The initial state is not saved — see `autosave()` for why.
		expect(written).toHaveLength(0);

		session.paint(session.pattern.tracks[0]!.id, 1);
		flushSync();
		expect(written).toHaveLength(1);
		expect(JSON.parse(written[0]!).p).toBe(session.encoded);

		stop();
		session.paint(session.pattern.tracks[0]!.id, 2);
		flushSync();
		expect(written).toHaveLength(1);
	});
});
