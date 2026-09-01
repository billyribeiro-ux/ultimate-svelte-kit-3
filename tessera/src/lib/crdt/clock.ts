/**
 * HYBRID LOGICAL CLOCKS
 * =====================
 *
 * Every operation in Tessera carries a timestamp. That timestamp has three jobs
 * at once, and no ordinary clock does all three.
 *
 *   1. **Total order.** Two edits must have a definite winner, on every replica,
 *      forever. `Date.now()` fails this: two machines produce the same
 *      millisecond routinely, and then "last write wins" means "whichever one
 *      your map iterated first wins", which is not the same on two machines.
 *
 *   2. **Causality.** If your edit arrived at my screen before I made mine, my
 *      timestamp must be greater than yours — even if my laptop's clock is two
 *      minutes behind yours. A pure wall clock fails this and produces the
 *      infuriating bug where your reply to my message sorts before my message.
 *
 *   3. **Meaning to a human.** A Lamport counter satisfies (1) and (2) and reads
 *      `4417`, which tells a support engineer nothing. Version history wants to
 *      say "3 March, 14:02".
 *
 * A **hybrid logical clock** (Kulkarni et al., 2014) does all three. It is a
 * wall-clock reading that is dragged forward — never backward — by the messages
 * it receives, with a counter to break ties inside one millisecond.
 *
 *   wall     the greatest physical time this replica has seen, its own or anyone's
 *   counter  how many events have happened at that same `wall`
 *   actor    who produced it, which breaks the last tie and makes the id unique
 *
 * The `actor` component matters more than it looks. Because it is part of the
 * timestamp, **every HLC this replica produces is globally unique**, which is
 * why the rest of the CRDT can use a timestamp as an identity: an RGA character
 * id, an OR-Set dot, and a last-write-wins stamp are all the same type here.
 * That is not a shortcut; it is the reason the version vector in `version.ts`
 * can be four lines long.
 */

/**
 * A replica identity. Eight lowercase base-36 characters, fixed width so that
 * comparing two encoded timestamps as plain strings gives the same answer as
 * comparing them field by field.
 *
 * Not the user id. One person with the board open in two tabs is two actors,
 * because two tabs can genuinely edit concurrently and a CRDT that pretends
 * otherwise loses one of them.
 */
export type ActorId = string & { readonly __brand: 'ActorId' };

/** A hybrid logical clock reading, decoded. */
export interface Hlc {
	/** Milliseconds since the epoch — the greatest seen, not necessarily local. */
	readonly wall: number;
	/** Events at this same `wall`, on this replica. */
	readonly counter: number;
	readonly actor: ActorId;
}

/**
 * The encoded form: a fixed-width string that sorts lexicographically in exactly
 * the same order as `compare()` sorts the decoded form.
 *
 * This is the type that travels and gets stored. It is a string because SQLite
 * indexes strings, `Map` keys them without boxing, JSON carries them unchanged,
 * and a human reading a log can see the date in it.
 */
export type Stamp = string & { readonly __brand: 'Stamp' };

const WALL_DIGITS = 13; // Decimal ms fits 13 digits until 20 November 2286.
const COUNTER_DIGITS = 5; // 99,999 events in one millisecond on one replica.
const ACTOR_LENGTH = 8;

/** Beyond this the counter cannot be encoded, so `wall` borrows a millisecond. */
const MAX_COUNTER = 10 ** COUNTER_DIGITS - 1;

/**
 * How far ahead of local physical time a received timestamp may be before we
 * refuse it.
 *
 * A replica with a badly wrong clock is not hypothetical — a laptop resuming
 * from sleep before NTP catches up is ahead by minutes, and a virtual machine
 * can be ahead by years. Without this guard, one such message drags every
 * replica's `wall` to that value permanently: the document's clock is now in
 * 2039, version history is nonsense, and no amount of correct local time undoes
 * it, because an HLC only ever moves forward.
 *
 * Five minutes is generous for real clock skew and far tighter than the failure.
 */
export const MAX_DRIFT_MS = 5 * 60 * 1000;

/** Thrown when a received timestamp is too far in the future to be believed. */
export class ClockDriftError extends Error {
	constructor(
		readonly received: Hlc,
		readonly localWall: number
	) {
		super(
			`Timestamp is ${Math.round((received.wall - localWall) / 1000)}s ahead of local time; ` +
				`refusing it (limit ${MAX_DRIFT_MS / 1000}s). Check the sending machine's clock.`
		);
		this.name = 'ClockDriftError';
	}
}

/**
 * Mint an actor id. Random, not sequential: actor ids are compared but never
 * counted, and a sequential one would leak how many replicas exist.
 */
export function newActorId(random: () => number = Math.random): ActorId {
	let id = '';
	while (id.length < ACTOR_LENGTH) {
		id += Math.floor(random() * 36 ** 6)
			.toString(36)
			.padStart(6, '0');
	}
	return id.slice(0, ACTOR_LENGTH) as ActorId;
}

/**
 * Encode to the sortable string form.
 *
 * The padding is the whole point. `1756...` and `999...` compare correctly as
 * numbers and incorrectly as strings unless both are the same width, and every
 * consumer downstream — SQLite's `ORDER BY`, `Array#sort`, a `Map` iterated in
 * insertion order — compares strings.
 */
export function encode(hlc: Hlc): Stamp {
	if (hlc.wall < 0 || hlc.wall >= 10 ** WALL_DIGITS) {
		throw new RangeError(`wall ${hlc.wall} does not fit in ${WALL_DIGITS} digits`);
	}
	if (hlc.counter < 0 || hlc.counter > MAX_COUNTER) {
		throw new RangeError(`counter ${hlc.counter} does not fit in ${COUNTER_DIGITS} digits`);
	}
	if (hlc.actor.length !== ACTOR_LENGTH) {
		throw new RangeError(`actor "${hlc.actor}" is not ${ACTOR_LENGTH} characters`);
	}

	return (String(hlc.wall).padStart(WALL_DIGITS, '0') +
		String(hlc.counter).padStart(COUNTER_DIGITS, '0') +
		hlc.actor) as Stamp;
}

/** Decode the string form back to fields. */
export function decode(stamp: Stamp): Hlc {
	if (stamp.length !== WALL_DIGITS + COUNTER_DIGITS + ACTOR_LENGTH) {
		throw new RangeError(`"${stamp}" is not a stamp`);
	}
	return {
		wall: Number(stamp.slice(0, WALL_DIGITS)),
		counter: Number(stamp.slice(WALL_DIGITS, WALL_DIGITS + COUNTER_DIGITS)),
		actor: stamp.slice(WALL_DIGITS + COUNTER_DIGITS) as ActorId
	};
}

/**
 * Who produced this stamp, without decoding the rest.
 *
 * Called on every incoming operation to index it by actor, so it avoids
 * allocating an object thirty thousand times during a catch-up sync.
 */
export function actorOf(stamp: Stamp): ActorId {
	return stamp.slice(WALL_DIGITS + COUNTER_DIGITS) as ActorId;
}

/** The wall-clock reading inside a stamp, for display. */
export function wallOf(stamp: Stamp): number {
	return Number(stamp.slice(0, WALL_DIGITS));
}

/**
 * Total order over stamps: negative if `a` is earlier, positive if later, zero
 * only if they are the same stamp.
 *
 * Because the encoding is fixed-width, this is `a < b` on the strings. It is
 * spelled out as a function anyway so that the ordering has one name and one
 * place to be tested, rather than being an implicit property of nine call sites.
 */
export function compare(a: Stamp, b: Stamp): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** The later of two stamps. */
export function max(a: Stamp, b: Stamp): Stamp {
	return a > b ? a : b;
}

/**
 * A replica's clock.
 *
 * Mutable and single-threaded by design: there is exactly one of these per
 * replica, and every operation that replica creates draws its stamp from it.
 * Two clocks for one actor would issue duplicate stamps, which breaks the
 * uniqueness the rest of the CRDT is built on — so the constructor takes the
 * actor id rather than minting one, and the document owns the only instance.
 */
export class Clock {
	#wall: number;
	#counter: number;
	readonly #now: () => number;

	constructor(
		readonly actor: ActorId,
		now: () => number = Date.now,
		/** Resume from a persisted state so a reload cannot go backwards. */
		resume?: Hlc
	) {
		this.#now = now;
		this.#wall = resume?.wall ?? 0;
		this.#counter = resume?.counter ?? 0;
	}

	/** The last stamp issued or observed, without advancing. */
	peek(): Hlc {
		return { wall: this.#wall, counter: this.#counter, actor: this.actor };
	}

	/**
	 * Issue a stamp for a locally generated operation.
	 *
	 * Physical time only ever *raises* the clock. If the machine's clock has gone
	 * backwards — NTP correcting a drift, a user changing the date, a VM
	 * migrating — `wall` stays where it was and `counter` takes the strain. The
	 * document keeps a consistent order; it simply records a few operations as
	 * having happened in the same millisecond, which is a far smaller lie than
	 * letting time run backwards inside a version history.
	 */
	tick(): Stamp {
		const physical = this.#now();

		if (physical > this.#wall) {
			this.#wall = physical;
			this.#counter = 0;
		} else if (this.#counter >= MAX_COUNTER) {
			// 100,000 operations inside one millisecond means something is looping,
			// but borrowing a millisecond is still the correct answer: the order
			// stays right and the timestamp is off by less than a frame.
			this.#wall += 1;
			this.#counter = 0;
		} else {
			this.#counter += 1;
		}

		return encode(this.peek());
	}

	/**
	 * Fold a received stamp into this clock.
	 *
	 * This is the step that buys causality. After observing your operation, every
	 * stamp I issue is greater than yours, so an edit I made *because* I saw
	 * yours can never sort before it — regardless of what our two machines think
	 * the time is.
	 *
	 * @throws ClockDriftError if the remote wall clock is implausibly far ahead.
	 */
	observe(stamp: Stamp): void {
		const remote = decode(stamp);
		const physical = this.#now();

		if (remote.wall - physical > MAX_DRIFT_MS) {
			throw new ClockDriftError(remote, physical);
		}

		const wall = Math.max(this.#wall, remote.wall, physical);

		if (wall === this.#wall && wall === remote.wall) {
			this.#counter = Math.max(this.#counter, remote.counter) + 1;
		} else if (wall === this.#wall) {
			this.#counter += 1;
		} else if (wall === remote.wall) {
			this.#counter = remote.counter + 1;
		} else {
			// Physical time overtook both; nothing to disambiguate.
			this.#counter = 0;
		}

		this.#wall = wall;

		// The counter can overflow through `remote.counter + 1`; normalise rather
		// than letting `encode` throw at the next `tick()`, three frames later and
		// nowhere near the cause.
		if (this.#counter > MAX_COUNTER) {
			this.#wall += 1;
			this.#counter = 0;
		}
	}
}
