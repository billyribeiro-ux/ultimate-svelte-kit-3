/**
 * THE WIRE
 * ========
 *
 * One file, imported by both sides, describing everything that crosses the
 * network. Client and server cannot drift, because there is nothing for them to
 * drift from.
 *
 * TWO CHANNELS, ON PURPOSE
 * ------------------------
 * Operations and presence look similar — small messages about a board, sent
 * often — and they have opposite requirements.
 *
 *   operations   must never be lost, must be ordered, must survive a
 *                disconnection, and are worth storing forever.
 *   presence     is worthless one second later. A cursor position that arrives
 *                late is not "delayed", it is wrong, and the correct handling of
 *                a dropped presence packet is to forget it happened.
 *
 * Sending both through the same durable path means either paying for durability
 * on cursor positions — writing sixty rows a second per person, to be deleted
 * moments later — or weakening the guarantee on operations. So: operations go
 * through a `command()` that writes to the log and returns a watermark; presence
 * goes through a `command()` that writes nowhere and is dropped if nobody is
 * listening. Both arrive back over the same SSE stream, tagged, because a second
 * connection per board would double the sockets to save nothing.
 */

import * as v from 'valibot';
import { BatchSchema, type Operation } from '#lib/board/index.ts';

/* ------------------------------------------------------------------ */
/* Client to server                                                    */
/* ------------------------------------------------------------------ */

/** 8 lowercase base-36 characters. See `crdt/clock.ts`. */
const actorId = v.pipe(v.string(), v.regex(/^[0-9a-z]{8}$/, 'Not an actor id'));

export const PushSchema = v.object({
	boardId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	actor: actorId,
	ops: BatchSchema
});

export type PushRequest = v.InferOutput<typeof PushSchema>;

export interface PushResult {
	/** How many operations were new. Re-sent ones are counted as accepted. */
	readonly accepted: number;
	/**
	 * The board's sequence after this batch.
	 *
	 * The client advances its cursor to this and nothing else. Advancing per
	 * operation is how a gap gets skipped — see `crdt/version.ts`.
	 */
	readonly watermark: number;
}

/** A viewport rectangle, in board coordinates, for the follow-me feature. */
export const ViewportSchema = v.object({
	x: v.pipe(v.number(), v.finite()),
	y: v.pipe(v.number(), v.finite()),
	w: v.pipe(v.number(), v.finite(), v.minValue(1)),
	h: v.pipe(v.number(), v.finite(), v.minValue(1))
});

export const PresenceSchema = v.object({
	boardId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	actor: actorId,
	cursor: v.nullable(
		v.object({ x: v.pipe(v.number(), v.finite()), y: v.pipe(v.number(), v.finite()) })
	),
	/*
	 * A cap, because this is echoed to every other viewer without being stored.
	 * Unbounded, one client selecting everything on a large board would multiply
	 * that array by the number of people watching, sixty times a second.
	 */
	selection: v.pipe(v.array(v.pipe(v.string(), v.maxLength(32))), v.maxLength(64)),
	viewport: v.nullable(ViewportSchema)
});

export type PresenceUpdate = v.InferOutput<typeof PresenceSchema>;

/* ------------------------------------------------------------------ */
/* Server to client                                                    */
/* ------------------------------------------------------------------ */

/** Somebody else on the board, as everybody else sees them. */
export interface Peer {
	readonly actor: string;
	readonly userId: string;
	readonly name: string;
	/** An index into the presence palette, derived from the user id — not stored. */
	readonly hue: number;
	readonly cursor: { x: number; y: number } | null;
	readonly selection: readonly string[];
	readonly viewport: { x: number; y: number; w: number; h: number } | null;
	/** When this was last heard from, as server time. Used to expire the stale. */
	readonly at: number;
}

export type ServerEvent =
	/** Sent once, first. Tells the client where the stream is starting from. */
	| { readonly type: 'hello'; readonly watermark: number }
	| { readonly type: 'ops'; readonly ops: readonly Operation[]; readonly watermark: number }
	| { readonly type: 'presence'; readonly peers: readonly Peer[] }
	/**
	 * A keep-alive.
	 *
	 * Not decoration. Proxies and load balancers close an idle connection after
	 * thirty to sixty seconds, and a closed SSE stream looks to the browser like a
	 * transient failure it should retry — so an idle board reconnects every minute
	 * forever, each time replaying a catch-up query. A comment frame every twenty
	 * seconds costs two bytes and removes the whole cycle.
	 */
	| { readonly type: 'ping' };

/**
 * How long a peer may go unheard-from before they are dropped from the roster.
 *
 * A browser that is closed mid-drag sends no goodbye, and the disconnect is only
 * noticed when the stream's `cancel` fires — which for a machine that went to
 * sleep can be minutes. Without an expiry, a board accumulates ghosts.
 */
export const PRESENCE_TIMEOUT_MS = 15_000;

/** How often a client re-sends its presence even if nothing moved, to stay alive. */
export const PRESENCE_HEARTBEAT_MS = 5_000;

/** The keep-alive interval on the server's side of the stream. */
export const STREAM_PING_MS = 20_000;

/**
 * The most operations a catch-up will send in one go.
 *
 * A client that has been offline for a week asks for everything since its
 * cursor, and "everything" can be a hundred thousand operations. Sending them as
 * one JSON array means the server builds the whole string in memory and the
 * client parses it in one blocking task — a spinner, then a frozen tab.
 *
 * Paging keeps both bounded: each page carries its own watermark, so an
 * interrupted catch-up resumes from where it stopped rather than starting again.
 */
export const CATCHUP_PAGE = 500;

/** Encode one SSE frame. Exported so the route and its tests agree on the format. */
export function frame(event: ServerEvent): string {
	if (event.type === 'ping') return ': ping\n\n';
	return `data: ${JSON.stringify(event)}\n\n`;
}
