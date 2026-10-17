/**
 * JAM ROOMS, LIVE
 * ===============
 *
 * `query.live` is a query whose function is an async *generator*: instead of
 * returning once, it `yield`s every time there is something new, and SvelteKit
 * streams each value to every browser that has the query open. When the last
 * browser closes it, SvelteKit stops iterating — which runs the `finally`
 * below, which leaves the room. There is no connection to manage by hand.
 *
 * The jam page awaits it inside a boundary with a `pending` snippet, and a
 * boundary like that renders only its `pending` snippet on the server. So the
 * stream is opened by the browser, after hydration, and never during server
 * rendering — which is why the page's `load` asks `getRoomName` first: that is
 * the one question the server has to answer before it can send a status.
 */

import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { command, query } from '$app/server';
import { StepSchema, STEPS } from '#lib/pattern/model.ts';
import { PRESET_NAMES, preset } from '#lib/pattern/presets.ts';
import { currentArtist } from '#lib/server/artist.ts';
import { getRoom, join, updateRoom, type RoomSnapshot } from '#lib/server/rooms.ts';

/**
 * A mailbox that holds one value.
 *
 * Live streams are not event logs: if the room changes three times while a
 * slow browser is still receiving the first, it should get the *latest*, not
 * a backlog. So a push while nobody is waiting replaces what was there, and a
 * `next()` while nothing is there waits.
 */
class Latest<T> {
	#value: T | undefined;
	#waiting: ((value: T) => void) | null = null;

	push(value: T): void {
		if (this.#waiting) {
			const resolve = this.#waiting;
			this.#waiting = null;
			resolve(value);
		} else {
			this.#value = value;
		}
	}

	next(): Promise<T> {
		if (this.#value !== undefined) {
			const value = this.#value;
			this.#value = undefined;
			return Promise.resolve(value);
		}
		return new Promise((resolve) => {
			this.#waiting = resolve;
		});
	}
}

/**
 * A room's name, or a 404. The jam page's universal `load` awaits this, so a
 * room that does not exist is a real `404` from the server — the error page,
 * with the status a link checker or a crawler reads — rather than a `200` that
 * says "No such room" once the browser has opened the stream.
 */
export const getRoomName = query(v.string(), async (id) => {
	const room = await getRoom(id);
	if (!room) error(404, 'No such room');
	return room.name;
});

export const watchRoom = query.live(v.string(), async function* (id) {
	const exists = await getRoom(id);
	if (!exists) error(404, 'No such room');

	const mailbox = new Latest<RoomSnapshot>();
	// Who this stream belongs to is read once, here. A browser that chooses a
	// handle while in the room calls `watchRoom(id).reconnect()` from that form,
	// which ends this generator and starts a fresh one that reads the new cookie.
	const leave = join(id, currentArtist(), (snapshot) => mailbox.push(snapshot));

	try {
		// Read again after joining, so the first snapshot already counts this
		// browser among those present.
		yield (await getRoom(id)) ?? error(404, 'No such room');
		while (true) yield await mailbox.next();
	} finally {
		leave();
	}
});

/* ------------------------------------------------------------------ */
/* Edits                                                               */
/* ------------------------------------------------------------------ */

const RoomStep = v.object({
	room: v.string(),
	track: v.string(),
	index: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(STEPS - 1)),
	// `StepSchema` contains `v.instance(Note)`: the argument arrives through the
	// `transport` hook and is a real `Note` by the time it is validated.
	step: StepSchema
});

/**
 * Commands do not refresh anything here, and do not need to: the room's live
 * query yields the new snapshot to every browser — including the one that
 * made the change — the moment `updateRoom` broadcasts it.
 */
export const setRoomStep = command(RoomStep, async ({ room, track, index, step }) => {
	await updateRoom(room, (pattern) => {
		const target = pattern.tracks.find((t) => t.id === track);
		if (!target) error(404, 'No such track in this room');
		target.steps[index] = { velocity: step.velocity, note: step.note };
	});
});

export const fillRoomTrack = command(
	v.object({ room: v.string(), track: v.string(), on: v.boolean() }),
	async ({ room, track, on }) => {
		await updateRoom(room, (pattern) => {
			const target = pattern.tracks.find((t) => t.id === track);
			if (!target) error(404, 'No such track in this room');
			for (const step of target.steps) step.velocity = on ? 96 : 0;
		});
	}
);

export const setRoomTempo = command(
	v.object({
		room: v.string(),
		bpm: v.pipe(v.number(), v.integer(), v.minValue(40), v.maxValue(240)),
		swing: v.pipe(v.number(), v.minValue(0), v.maxValue(1))
	}),
	async ({ room, bpm, swing }) => {
		await updateRoom(room, (pattern) => {
			pattern.bpm = bpm;
			pattern.swing = swing;
		});
	}
);

export const toggleRoomMute = command(
	v.object({ room: v.string(), track: v.string() }),
	async ({ room, track }) => {
		await updateRoom(room, (pattern) => {
			const target = pattern.tracks.find((t) => t.id === track);
			if (!target) error(404, 'No such track in this room');
			target.muted = !target.muted;
		});
	}
);

export const loadRoomPreset = command(
	v.object({ room: v.string(), preset: v.picklist(PRESET_NAMES) }),
	async ({ room, preset: name }) => {
		await updateRoom(room, (pattern) => {
			const fresh = preset(name);
			pattern.title = fresh.title;
			pattern.bpm = fresh.bpm;
			pattern.swing = fresh.swing;
			pattern.tracks = fresh.tracks;
		});
	}
);
