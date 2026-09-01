/**
 * PART 1 — Time, order, and the two tools everything else is built from
 * (chapters 06–08)
 *
 * No application code in this part, and no Svelte. These three files are pure
 * algebra: a clock that cannot go backwards, a summary of what a replica has
 * seen, and a way to order things that always has room for one more. Everything
 * in the rest of the project stands on them.
 */

export const part1 = [
	{
		slug: 'hybrid-logical-clocks',
		title: 'Time that cannot go backwards',
		summary:
			'Why `Date.now()` cannot decide who wins, what a hybrid logical clock is, and the drift guard that was in the wrong tier for a fortnight.',
		goal: 'Write a timestamp that gives a total order, respects causality, and still reads as a date to a human.',
		blocks: [
			{
				type: 'p',
				text: 'Ada and Mo both drag the same box. Two edits, two timestamps, one has to win. Reach for `Date.now()` and you have three separate problems, only one of which is obvious.'
			},
			{
				type: 'ol',
				items: [
					'**Ties.** Two machines produce the same millisecond routinely. "Last write wins" then means "whichever one the map iterated first", and two machines do not iterate the same way. The board diverges.',
					'**Causality inverted.** Mo’s laptop is two minutes slow. Ada draws a box; Mo *sees it* and draws an arrow to it. Mo’s arrow carries an earlier timestamp than the box it points at. Sort by time and the reply comes before the message.',
					'**Nobody’s clock is right.** A laptop resuming from sleep is minutes off until NTP catches up. A VM can be years off. There is no authority to appeal to, because appealing to one is the round trip we removed in chapter 02.'
				]
			},
			{
				type: 'p',
				text: 'A **Lamport counter** fixes 1 and 2 — a plain integer that increments locally and jumps forward whenever you see a bigger one. It also produces `4417`, which tells version history nothing and a support engineer less.'
			},
			{
				type: 'p',
				text: 'A **hybrid logical clock** (Kulkarni et al., 2014) fixes all three. It is a wall-clock reading dragged forward — never backward — by the messages it receives, with a counter to break ties inside a millisecond.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/clock.ts',
				lang: 'ts',
				code: `
/**
 * HYBRID LOGICAL CLOCKS
 * =====================
 *
 * Every operation in Tessera carries a timestamp. That timestamp has three jobs
 * at once, and no ordinary clock does all three.
 *
 *   1. **Total order.** Two edits must have a definite winner, on every replica,
 *      forever. \`Date.now()\` fails this: two machines produce the same
 *      millisecond routinely, and then "last write wins" means "whichever one
 *      your map iterated first wins", which is not the same on two machines.
 *
 *   2. **Causality.** If your edit arrived at my screen before I made mine, my
 *      timestamp must be greater than yours — even if my laptop's clock is two
 *      minutes behind yours. A pure wall clock fails this and produces the
 *      infuriating bug where your reply to my message sorts before my message.
 *
 *   3. **Meaning to a human.** A Lamport counter satisfies (1) and (2) and reads
 *      \`4417\`, which tells a support engineer nothing. Version history wants to
 *      say "3 March, 14:02".
 *
 * A **hybrid logical clock** (Kulkarni et al., 2014) does all three. It is a
 * wall-clock reading that is dragged forward — never backward — by the messages
 * it receives, with a counter to break ties inside one millisecond.
 *
 *   wall     the greatest physical time this replica has seen, its own or anyone's
 *   counter  how many events have happened at that same \`wall\`
 *   actor    who produced it, which breaks the last tie and makes the id unique
 *
 * The \`actor\` component matters more than it looks. Because it is part of the
 * timestamp, **every HLC this replica produces is globally unique**, which is
 * why the rest of the CRDT can use a timestamp as an identity: an RGA character
 * id, an OR-Set dot, and a last-write-wins stamp are all the same type here.
 * That is not a shortcut; it is the reason the version vector in \`version.ts\`
 * can be four lines long.
 */`
			},
			{
				type: 'why',
				title: 'The third component does more than break ties',
				text: 'Because `actor` is *part of* the timestamp, every stamp a replica produces is globally unique. That means a stamp can be used as an **identity**, not just an ordering — and it is, everywhere. An RGA character id, an OR-Set dot, and a last-write-wins version are all the same type in this codebase. That is not a shortcut taken to save typing; it is the reason the version vector in the next chapter is four lines long.'
			},

			{ type: 'h3', id: 'the-encoding', text: 'The encoding is the interesting part' },
			{
				type: 'code',
				file: 'src/lib/crdt/clock.ts',
				lang: 'ts',
				code: `
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
	/** Events at this same \`wall\`, on this replica. */
	readonly counter: number;
	readonly actor: ActorId;
}

/**
 * The encoded form: a fixed-width string that sorts lexicographically in exactly
 * the same order as \`compare()\` sorts the decoded form.
 *
 * This is the type that travels and gets stored. It is a string because SQLite
 * indexes strings, \`Map\` keys them without boxing, JSON carries them unchanged,
 * and a human reading a log can see the date in it.
 */
export type Stamp = string & { readonly __brand: 'Stamp' };

const WALL_DIGITS = 13; // Decimal ms fits 13 digits until 20 November 2286.
const COUNTER_DIGITS = 5; // 99,999 events in one millisecond on one replica.
const ACTOR_LENGTH = 8;

/** Beyond this the counter cannot be encoded, so \`wall\` borrows a millisecond. */
const MAX_COUNTER = 10 ** COUNTER_DIGITS - 1;`
			},
			{
				type: 'p',
				text: 'A stamp is a **fixed-width string**: 13 digits of milliseconds, 5 of counter, 8 of actor. Twenty-six characters, and the field order is the sort order.'
			},
			{
				type: 'p',
				text: 'That is the design decision the whole file exists to make. Because the widths are fixed, comparing two stamps *as strings* gives exactly the same answer as comparing them field by field. Which means:'
			},
			{
				type: 'ul',
				items: [
					'SQLite can `ORDER BY stamp` on an ordinary text index.',
					'`Array#sort()` with no comparator is correct.',
					'A `Map` keys them without boxing.',
					'JSON carries them unchanged — no encode step, no decode step, no drift between the two.',
					'A human reading a log can see the date in the first thirteen characters.'
				]
			},
			{
				type: 'code',
				file: 'src/lib/crdt/clock.ts',
				lang: 'ts',
				code: `
/**
 * Encode to the sortable string form.
 *
 * The padding is the whole point. \`1756...\` and \`999...\` compare correctly as
 * numbers and incorrectly as strings unless both are the same width, and every
 * consumer downstream — SQLite's \`ORDER BY\`, \`Array#sort\`, a \`Map\` iterated in
 * insertion order — compares strings.
 */
export function encode(hlc: Hlc): Stamp {
	if (hlc.wall < 0 || hlc.wall >= 10 ** WALL_DIGITS) {
		throw new RangeError(\`wall \${hlc.wall} does not fit in \${WALL_DIGITS} digits\`);
	}
	if (hlc.counter < 0 || hlc.counter > MAX_COUNTER) {
		throw new RangeError(\`counter \${hlc.counter} does not fit in \${COUNTER_DIGITS} digits\`);
	}
	if (hlc.actor.length !== ACTOR_LENGTH) {
		throw new RangeError(\`actor "\${hlc.actor}" is not \${ACTOR_LENGTH} characters\`);
	}

	return (String(hlc.wall).padStart(WALL_DIGITS, '0') +
		String(hlc.counter).padStart(COUNTER_DIGITS, '0') +
		hlc.actor) as Stamp;
}

/** Decode the string form back to fields. */
export function decode(stamp: Stamp): Hlc {
	if (stamp.length !== WALL_DIGITS + COUNTER_DIGITS + ACTOR_LENGTH) {
		throw new RangeError(\`"\${stamp}" is not a stamp\`);
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
}`
			},
			{
				type: 'p',
				text: 'Note `actorOf` and `wallOf`: they slice rather than decode. Both are called on every incoming operation, and a catch-up sync can be thirty thousand of them — allocating an object each time to read one field of it is the kind of thing that turns a fast path into a slow one for no reason at all.'
			},

			{ type: 'h3', id: 'the-clock', text: 'The clock itself' },
			{
				type: 'code',
				file: 'src/lib/crdt/clock.ts',
				lang: 'ts',
				code: `
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

	readonly actor: ActorId;

	/**
	 * Fields and assignments written out, rather than TypeScript's parameter
	 * properties.
	 *
	 * \`constructor(readonly actor: ActorId)\` is the same thing in four fewer
	 * characters, and it is one of the three constructs — with \`enum\` and
	 * namespaces — that TypeScript has to *emit* code for rather than erase. Node
	 * strips types without a compiler, so a file using them cannot be run with
	 * \`node file.ts\`, and \`scripts/seed.ts\` does exactly that with this module in
	 * its import graph. The failure is \`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX\`, at
	 * runtime, from a file that type-checks perfectly.
	 */
	constructor(
		actor: ActorId,
		now: () => number = Date.now,
		/** Resume from a persisted state so a reload cannot go backwards. */
		resume?: Hlc
	) {
		this.actor = actor;
		this.#now = now;
		this.#wall = resume?.wall ?? 0;
		this.#counter = resume?.counter ?? 0;
	}`
			},
			{
				type: 'warn',
				text: 'That comment about parameter properties is not padding. `constructor(readonly actor: ActorId)` is one of three TypeScript constructs — with `enum` and namespaces — that has to *emit* code rather than be erased. Node strips types without compiling them, so a file using it cannot be run with `node file.ts`, and `scripts/seed.ts` does exactly that with this module in its import graph. The failure is `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, at runtime, from a file that type-checks perfectly.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/clock.ts',
				lang: 'ts',
				code: `
/**
 * Issue a stamp for a locally generated operation.
 *
 * Physical time only ever *raises* the clock. If the machine's clock has gone
 * backwards — NTP correcting a drift, a user changing the date, a VM
 * migrating — \`wall\` stays where it was and \`counter\` takes the strain. The
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
}`
			},
			{
				type: 'p',
				text: 'Read the three branches as a policy: physical time only ever *raises* the clock. If the machine’s clock goes backwards — NTP correcting, a user changing the date, a VM migrating — `wall` stays and `counter` absorbs it. The document keeps a consistent order and simply records a few operations as having happened in the same millisecond, which is a much smaller lie than letting time run backwards inside a version history.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/clock.ts',
				lang: 'ts',
				code: `
	/**
	 * Fold a stamp into this clock — one received from the network, or one read
	 * back out of our own persisted state.
	 *
	 * This is the step that buys causality. After observing your operation, every
	 * stamp I issue is greater than yours, so an edit I made *because* I saw
	 * yours can never sort before it — regardless of what our two machines think
	 * the time is.
	 *
	 * It never refuses. See the note on drift above: refusing here protects
	 * nothing and breaks the replica with the slow clock rather than the one with
	 * the wrong one.
	 */
	observe(stamp: Stamp): void {
		const remote = decode(stamp);
		const physical = this.#now();
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

		// The counter can overflow through \`remote.counter + 1\`; normalise rather
		// than letting \`encode\` throw at the next \`tick()\`, three frames later and
		// nowhere near the cause.
		if (this.#counter > MAX_COUNTER) {
			this.#wall += 1;
			this.#counter = 0;
		}
	}
}`
			},
			{
				type: 'p',
				text: '`observe` is the step that buys causality, and it is worth being slow about. After I have observed your stamp, **every stamp I issue is greater than yours**. So an edit I made *because* I saw yours can never sort before it, no matter what our two machines believe the time is. That single property is what makes "Mo’s arrow sorts before Ada’s box" impossible.'
			},

			{ type: 'h3', id: 'drift', text: 'The drift guard, and why it moved' },
			{
				type: 'p',
				text: 'One replica with a badly wrong clock can poison every other one. An HLC only moves forward, so a single stamp claiming to be from 2039 drags everybody’s `wall` there permanently. Version history then reads as 2039 and no amount of correct local time undoes it.'
			},
			{
				type: 'p',
				text: 'The first version of this file guarded against that inside `observe()`, which threw on a stamp too far ahead. It was the wrong tier, for two reasons that are worth internalising.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/clock.ts',
				lang: 'ts',
				code: `
/**
 * CLOCK DRIFT, AND WHERE THE GUARD BELONGS
 * ----------------------------------------
 * A replica with a badly wrong clock is not hypothetical: a laptop resuming from
 * sleep before NTP catches up is minutes ahead, and a virtual machine can be
 * years ahead. One such stamp drags every replica's \`wall\` to that value
 * permanently — an HLC only moves forward — so version history reads as 2039 and
 * no amount of correct local time undoes it.
 *
 * The first version of this file guarded against that inside \`observe()\`, which
 * threw on a stamp too far ahead. It was the wrong tier, for two reasons.
 *
 *   - It protects nothing. By the time a client sees the stamp, the operation is
 *     already in the shared log and on everybody's screen. Refusing to advance
 *     past it does not un-publish it; it only leaves this replica free to reissue
 *     a stamp it has already used.
 *   - It breaks the innocent party. The comparison is "remote ahead of me", so a
 *     user whose own clock is *slow* rejects every operation from everyone. Their
 *     board silently stops updating, and the machine at fault is not theirs.
 *
 * So the client never refuses: \`observe()\` always advances. The check lives at
 * the one boundary where poison can still be kept out of the log — the server's
 * ingestion path, whose clock is the one everybody has implicitly agreed to
 * trust. \`isPlausible()\` is that check, and \`sync/ingest.ts\` is its only caller.
 *
 * Five minutes is generous for real skew and far tighter than the failure.
 */
export const MAX_DRIFT_MS = 5 * 60 * 1000;

/** How far ahead of \`now\` a stamp claims to be. Negative means it is in the past. */
export function driftMs(stamp: Stamp, now: number): number {
	return wallOf(stamp) - now;
}

/** Is this stamp close enough to the given time to be worth accepting? */
export function isPlausible(stamp: Stamp, now: number = Date.now()): boolean {
	return driftMs(stamp, now) <= MAX_DRIFT_MS;
}

/** Thrown by the server when an incoming stamp is too far in the future to believe. */
export class ClockDriftError extends Error {
	readonly stamp: Stamp;
	readonly now: number;

	constructor(stamp: Stamp, now: number) {
		super(
			\`Operation is \${Math.round(driftMs(stamp, now) / 1000)}s ahead of server time; \` +
				\`refusing it (limit \${MAX_DRIFT_MS / 1000}s). Check the sending machine's clock.\`
		);
		this.name = 'ClockDriftError';
		this.stamp = stamp;
		this.now = now;
	}
}`
			},
			{
				type: 'why',
				title: 'The general shape of that mistake',
				text: 'A validation that runs *after* the damage is done protects nothing, and a validation phrased as "is the other side ahead of me?" punishes whoever is behind. Both are easy to write and hard to see, because the code reads defensively and the tests pass. The question to ask of any guard is: **at this point, can the bad thing still be prevented, and is the party I am refusing the party at fault?** Here the answer was no and no, and the check belonged at the server’s ingestion path — the one boundary where poison can still be kept out of the log, and whose clock everybody has implicitly agreed to trust.'
			},

			{ type: 'h3', id: 'testing-a-clock', text: 'Testing a clock' },
			{
				type: 'p',
				text: 'A clock test that calls `Date.now()` passes on a fast machine and fails on a slow one, and cannot express drift at all. So time is injected.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/testing.ts',
				lang: 'ts',
				code: `
/**
 * A clock whose "physical time" is a counter you control.
 *
 * Real time in a test means a suite that passes on a fast machine and fails on a
 * slow one, and a drift test that cannot be written at all.
 */
export function fakeClock(who: string, start = 1_000_000_000_000) {
	let now = start;
	const clock = new Clock(actor(who), () => now);
	return {
		clock,
		advance(ms: number) {
			now += ms;
		},
		set(ms: number) {
			now = ms;
		},
		get now() {
			return now;
		}
	};
}`
			},
			{
				type: 'code',
				file: 'src/lib/crdt/clock.spec.ts',
				lang: 'ts',
				code: `
describe('observing', () => {
	it('makes a reply sort after the message it replies to', () => {
		// The causality property, stated the way it actually bites.
		const mine = fakeClock('a', 1_000); // my laptop is two minutes slow
		const yours = fakeClock('b', 121_000);

		const yourEdit = yours.clock.tick();
		mine.clock.observe(yourEdit);
		const myReply = mine.clock.tick();

		expect(compare(yourEdit, myReply)).toBeLessThan(0);
	});

	it('breaks a dead heat with the actor id', () => {
		const a = new Clock(actor('a'), () => 1_000);
		const b = new Clock(actor('b'), () => 1_000);
		expect(compare(a.tick(), b.tick())).toBeLessThan(0);
	});

	it('never refuses, however wrong the other machine’s clock is', () => {
		/*
		 * The client's job is to stay consistent, not to police. By the time a stamp
		 * reaches here the operation is already in the shared log; refusing to
		 * advance would only let this replica reissue a stamp it has already used.
		 */
		const harness = fakeClock('a', 1_000_000);
		const fromTheFuture = stamp(1_000_000 + MAX_DRIFT_MS * 100, 0, 'b');

		expect(() => harness.clock.observe(fromTheFuture)).not.toThrow();
		expect(harness.clock.peek().wall).toBe(1_000_000 + MAX_DRIFT_MS * 100);
	});

	it('keeps working when it is our own clock that is slow', () => {
		/*
		 * The bug the first design had. The comparison is "remote ahead of me", so a
		 * user whose machine is behind rejects everybody — and the machine at fault
		 * is not theirs. Their board just silently stops updating.
		 */
		const behind = fakeClock('a', 1_000);
		const fromCorrectClock = stamp(1_000 + MAX_DRIFT_MS * 10, 0, 'b');

		behind.clock.observe(fromCorrectClock);
		expect(compare(fromCorrectClock, behind.clock.tick())).toBeLessThan(0);
	});`
			},
			{
				type: 'terminal',
				code: `
pnpm vitest run src/lib/crdt/clock.spec.ts

 ✓ src/lib/crdt/clock.spec.ts (18 tests) 6ms

 Test Files  1 passed (1)
      Tests  18 passed (18)`
			},

			{
				type: 'checkpoint',
				items: [
					'You can explain why a stamp is a fixed-width string rather than an object.',
					'You can say what `observe` buys that `tick` alone does not.',
					'You can state the rule for where a guard belongs: where the bad thing can still be prevented, and where the party being refused is the party at fault.'
				]
			}
		]
	},

	{
		slug: 'version-vectors',
		title: 'What have I already seen?',
		summary:
			'A four-line version vector, made possible by the last chapter — and the afternoon lost to using it for the wrong job.',
		goal: 'Be able to ask "what do I still need from you?" in one string comparison, and know exactly what a vector must never be used for.',
		blocks: [
			{
				type: 'p',
				text: 'When a replica reconnects it needs to ask the server one question: *what have I missed?* Answering it badly means either re-downloading the whole board on every reconnect, or missing operations silently.'
			},
			{
				type: 'p',
				text: 'The textbook answer is a **version vector**: a map from replica to sequence number. Actor `a3f1` is at operation 412. That works, and it requires every replica to maintain a sequence counter alongside its clock, keep the two in step, and persist both.'
			},
			{
				type: 'p',
				text: 'Tessera’s maps a replica to a **stamp** instead — and this is the payoff from the last chapter.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/version.ts',
				lang: 'ts',
				code: `
/**
 * VERSION VECTORS
 * ===============
 *
 * "What do I already have, and what do I still need from you?"
 *
 * The usual version vector maps a replica to a sequence number: actor \`a3f1\` is
 * at operation 412. Tessera's maps a replica to a **stamp** instead, because
 * \`clock.ts\` already guarantees that every stamp an actor produces is strictly
 * greater than the last one it produced. A stamp *is* that actor's sequence
 * number, with a readable date attached and nothing extra to keep in step.
 *
 * The consequences are pleasant:
 *
 *   - "Have I seen this operation?" is \`stamp <= vector[actor]\`, a string
 *     comparison.
 *   - "What do you need?" is \`SELECT * WHERE actor = ? AND stamp > ?\`, one index
 *     scan per actor, no join, no scan of anything you already have.
 *   - A vector is a small JSON object that compresses well and reads clearly in
 *     a log.
 *`
			},
			{
				type: 'p',
				text: 'Because `clock.ts` guarantees every stamp an actor produces is strictly greater than its last, **a stamp already is that actor’s sequence number** — with a readable date attached and nothing extra to keep in step.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/version.ts',
				lang: 'ts',
				code: `
import { type ActorId, type Stamp, actorOf, max } from './clock.ts';

/** A frozen point in a document's history. */
export type VersionVector = ReadonlyMap<ActorId, Stamp>;

/** The wire form: a plain object, because JSON has no Map. */
export type EncodedVersion = Record<string, string>;

/** The empty vector — a replica that has seen nothing. */
export function empty(): VersionVector {
	return new Map();
}

/**
 * Has this vector already observed \`stamp\`?
 *
 * Note \`<=\` rather than \`<\`: the vector stores the *last* stamp seen, inclusive.
 * Getting this wrong makes every sync redeliver exactly one operation per actor
 * forever — a bug that looks like a performance problem and is a correctness one,
 * because those redelivered operations also re-trigger any effect watching them.
 */
export function has(vector: VersionVector, stamp: Stamp): boolean {
	const seen = vector.get(actorOf(stamp));
	return seen !== undefined && stamp <= seen;
}

/**
 * The vector after observing \`stamp\`. Returns a new Map; vectors are values.
 *
 * Copying rather than mutating costs an allocation per operation and buys the
 * ability to hand a vector to a component and know it will not change underneath
 * the render. In a document with a hot loop this would be the wrong trade; a
 * vector has one entry per replica that has ever touched the board, which is
 * tens, not thousands.
 */
export function observe(vector: VersionVector, stamp: Stamp): VersionVector {
	const actor = actorOf(stamp);
	const seen = vector.get(actor);
	if (seen !== undefined && stamp <= seen) return vector;

	const next = new Map(vector);
	next.set(actor, stamp);
	return next;
}

/** The least upper bound of two vectors: everything either side has seen. */
export function merge(a: VersionVector, b: VersionVector): VersionVector {
	const next = new Map(a);
	for (const [actor, stamp] of b) {
		const seen = next.get(actor);
		next.set(actor, seen === undefined ? stamp : max(seen, stamp));
	}
	return next;
}`
			},
			{
				type: 'p',
				text: 'Four functions and one of them is a `Map` copy. Note the `<=` in `has`: the vector stores the *last* stamp seen, inclusive. Make it `<` and every sync redelivers exactly one operation per actor forever — which looks like a performance problem, and is a correctness one, because those redelivered operations re-trigger anything watching them.'
			},
			{
				type: 'p',
				text: 'And note that `observe` returns a **new** map. Vectors are values here. That costs an allocation per operation and buys the ability to hand one to a component and know it will not change underneath a render. In a hot loop that would be the wrong trade; a vector has one entry per replica that has ever touched the board, which is tens.'
			},

			{ type: 'h3', id: 'dominates', text: 'Concurrency, defined' },
			{
				type: 'code',
				file: 'src/lib/crdt/version.ts',
				lang: 'ts',
				code: `
/**
 * Does \`a\` dominate \`b\` — has it seen everything \`b\` has?
 *
 * Two vectors where neither dominates the other are *concurrent*, which is the
 * interesting case and the reason a CRDT exists at all.
 */
export function dominates(a: VersionVector, b: VersionVector): boolean {
	for (const [actor, stamp] of b) {
		const seen = a.get(actor);
		if (seen === undefined || seen < stamp) return false;
	}
	return true;
}

/** Do these two vectors describe exactly the same set of operations? */
export function equal(a: VersionVector, b: VersionVector): boolean {
	return a.size === b.size && dominates(a, b);
}`
			},
			{
				type: 'p',
				text: 'This is where "concurrent" gets a definition rather than a feeling. `a` **dominates** `b` if it has seen everything `b` has. If neither dominates the other, the two states are **concurrent** — they each know something the other does not. That is the case a CRDT exists for, and it is now a function you can call.'
			},

			{ type: 'h3', id: 'the-bug', text: 'The afternoon this cost' },
			{
				type: 'warn',
				text: 'A version vector is a **sync cursor**, not a delivery filter. Those sound like the same thing. They are not, and the difference is silent data loss.'
			},
			{
				type: 'p',
				text: 'The first version of `apply` began with a fast path that looked obviously correct:'
			},
			{
				type: 'code',
				lang: 'ts',
				code: `
apply(operation: Operation): void {
	// "We have already seen this one." — and this is wrong.
	if (has(this.#version, operation.stamp)) return;
	…
}`
			},
			{
				type: 'p',
				text: 'The reasoning: an operation already covered by the vector is one we have already applied, so skip the work. That reasoning holds **only while each actor’s operations arrive in order**.'
			},
			{
				type: 'p',
				text: 'They usually do. A client keeps one request in flight; the server replays in stamp order. "Usually" is not a property you can build on. Shuffle the delivery — which a reconnecting client does by accident, and which the property test in chapter 12 does on purpose — and the vector jumps over a gap. Everything in that gap is discarded, in silence, with no error anywhere. One replica ends up with `aegaa` and another with `aaegaa`.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/version.ts',
				lang: 'ts',
				code: `
 * WHAT THIS IS NOT FOR
 * --------------------
 * A vector is a **sync cursor**, not a delivery filter. The distinction cost an
 * afternoon.
 *
 * The first version of \`apply\` started with \`if (has(version, stamp)) return\`,
 * on the reasoning that an operation already covered by the vector is one we
 * have already applied. That reasoning holds only while each actor's operations
 * arrive in order. They usually do — a client keeps one request in flight and
 * the server replays in stamp order — but "usually" is not a property you can
 * build on, and when delivery *was* shuffled the vector jumped over a gap and
 * the skipped operation was discarded in silence.
 *
 * So nothing gates on this. Every structure in this folder is idempotent on its
 * own, which makes \`apply\` safe under any delivery order and makes the fast path
 * worthless anyway. The vector's job is to tell the server where to resume, and
 * \`sync/client.svelte.ts\` advances it from the **watermark** the server sends
 * with each batch — a point the server guarantees is complete — never from the
 * stamps of individual operations.
 */`
			},
			{
				type: 'why',
				title: 'The fix was to delete the optimisation',
				text: 'Every structure in this folder is idempotent on its own — a set insert, a stamp comparison, a `Map.has`. Applying an operation twice costs a few nanoseconds and changes nothing. So the fast path bought approximately nothing and cost a correctness guarantee. Deleting it makes `apply` safe under **any** delivery order, which is a much stronger property than "safe under the order we currently happen to produce".'
			},
			{
				type: 'p',
				text: 'The vector goes back to the one job it is genuinely correct for: telling the server where to resume. And the client advances it from the **watermark** the server sends with each batch — a point the server guarantees is complete — never from the stamps of individual operations. That distinction returns, with consequences, in chapter 25.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/version.ts',
				lang: 'ts',
				code: `
/**
 * Filter a batch down to the operations \`vector\` has not seen.
 *
 * The server does this with SQL. The client does it in memory, on every incoming
 * batch, because a reconnect can legitimately redeliver: the client's cursor is
 * what it last *persisted*, and it may have applied operations after that.
 */
export function unseen<T extends { readonly stamp: Stamp }>(
	vector: VersionVector,
	operations: readonly T[]
): T[] {
	return operations.filter((operation) => !has(vector, operation.stamp));
}

export function toJSON(vector: VersionVector): EncodedVersion {
	return Object.fromEntries(vector);
}

export function fromJSON(encoded: EncodedVersion): VersionVector {
	return new Map(Object.entries(encoded) as [ActorId, Stamp][]);
}`
			},

			{
				type: 'checkpoint',
				items: [
					'You can say what a version vector is for and what it must never be used for.',
					'You can define "concurrent" precisely, in terms of domination.',
					'You can explain why deleting a fast path was the right fix rather than fixing it.'
				]
			}
		]
	},

	{
		slug: 'fractional-indexing',
		title: 'Room between any two things',
		summary:
			'Stacking order without renumbering: base-62 keys that always have a gap, and the tiebreak that stops two replicas rendering the same data differently.',
		goal: 'Reorder one shape by writing one field on one shape, with no operation touching anything else.',
		blocks: [
			{
				type: 'p',
				text: 'Shapes stack. "Bring to front", "send backward", and the question of which of two overlapping boxes is on top. The obvious model is an integer `z` per shape, and it is a trap.'
			},
			{
				type: 'p',
				text: 'Move one shape between two others and you renumber every shape above it. A one-shape reorder becomes fifty operations, and all fifty conflict with anything anybody else did to the stack — because the operations were never *about* the shapes they touched. Two people reordering two different shapes at the same time produce a mess no merge rule can untangle.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/fracdex.ts',
				lang: 'ts',
				code: `
/**
 * FRACTIONAL INDEXING
 * ===================
 *
 * Stacking order. "Bring to front", "send backward", and the order shapes sit in
 * when two of them overlap.
 *
 * The obvious model — an integer \`z\` per node — is a trap in a collaborative
 * document. Moving one shape between two others renumbers every shape above it,
 * so a one-shape reorder becomes fifty operations that all conflict with
 * anything anybody else did to the stack. Two people reordering different shapes
 * at the same time produce a mess that no merge rule can untangle, because the
 * operations were never about the shapes they touched.
 *
 * The fix is to stop using integers. A **fractional index** is a string that
 * sorts lexicographically, and there is always room to mint another one strictly
 * between any two. Moving a shape writes exactly one field on exactly one shape,
 * and that write is an ordinary last-write-wins register.
 *
 * The keys are base-62 digits read as the fractional part of a number — \`"V"\` is
 * roughly a half, \`"V5"\` is slightly more than a half — so \`between\` is long
 * division that stops as soon as it finds room.
 *
 * THE COLLISION NOBODY MENTIONS
 * -----------------------------
 * Two replicas that concurrently move different shapes to the same slot compute
 * the *same* key, because the inputs are the same. Sorting by key alone then
 * leaves their order down to whatever \`Array#sort\` felt like, which differs
 * between replicas — a divergence in the rendering, from a data structure that
 * has technically converged.
 *
 * So nothing sorts by the key alone. \`compareOrder\` sorts by key and breaks ties
 * with the element's own id, which is a stamp and therefore unique and totally
 * ordered. Cheap, and it removes the failure entirely.
 */

/** Digits in ascending order. ASCII order and value order must agree. */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length; // 62

/** A stacking key. Sorts lexicographically; never empty; never ends in \`'0'\`. */
export type OrderKey = string & { readonly __brand: 'OrderKey' };

/** The key for the first element on an empty board — the midpoint of the range. */
export const MIDDLE = 'V' as OrderKey; // DIGITS[31], as close to a half as base 62 gets`
			},
			{
				type: 'p',
				text: 'A **fractional index** is a string that sorts lexicographically, with the property that there is always room to mint another one strictly between any two. Moving a shape then writes exactly one field on exactly one shape, and that write is an ordinary last-write-wins register — the subject of chapter 10.'
			},
			{
				type: 'p',
				text: 'The keys are base-62 digits read as the fractional part of a number. `"V"` is roughly a half; `"V5"` is slightly more than a half. So `between` is long division that stops as soon as it finds room.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/fracdex.ts',
				lang: 'ts',
				code: `
function digitAt(key: string | null, index: number, fallback: number): number {
	if (key === null || index >= key.length) return fallback;
	const value = DIGITS.indexOf(key[index]!);
	if (value < 0) throw new RangeError(\`"\${key}" is not a valid order key\`);
	return value;
}

/**
 * A key strictly between \`before\` and \`after\`.
 *
 * \`null\` means "no bound": \`between(null, null)\` is the middle of the range,
 * \`between(key, null)\` is after everything, \`between(null, key)\` is before
 * everything.
 *
 * The loop walks digit by digit. As soon as two consecutive positions differ by
 * more than one there is room for a midpoint and it stops; otherwise it copies
 * the lower bound's digit and descends. Since the upper bound is treated as
 * \`BASE\` past its end, descending always terminates — the worst case is one
 * extra character per call, which is why a thousand consecutive "insert just
 * above this one" operations grow a key to about a thousand characters and not
 * to infinity.
 */
export function between(before: OrderKey | null, after: OrderKey | null): OrderKey {
	if (before !== null && after !== null && before >= after) {
		throw new RangeError(\`order keys are not ascending: "\${before}" >= "\${after}"\`);
	}

	let result = '';

	for (let index = 0; ; index += 1) {
		const low = digitAt(before, index, 0);
		const high = digitAt(after, index, BASE);

		if (high - low > 1) {
			// \`low + 1\` rather than the midpoint when the gap is small keeps keys
			// short; the midpoint keeps them balanced when the gap is wide. Halving
			// is the one that survives repeated insertion at the same spot.
			result += DIGITS[Math.floor((low + high) / 2)];
			return result as OrderKey;
		}

		result += DIGITS[low];
	}
}`
			},
			{
				type: 'p',
				text: 'Walk it by hand once and it stops being magic. `between(null, null)`: at index 0, `low` is 0 and `high` is 62, the gap is wide, so take the midpoint — `DIGITS[31]`, which is `"V"`. `between("V", null)`: `low` is 31, `high` is 62, midpoint 46, which is `"k"`. `between("V", "W")`: `low` 31, `high` 32, gap of one — no room — so copy `"V"` and descend; at index 1 the bound has run out, so `low` is 0 and `high` is 62, and the answer is `"VV"`.'
			},
			{
				type: 'note',
				text: 'The termination argument matters, because a loop with no exit condition in it deserves scrutiny. Past the end of the upper bound, `high` is treated as `BASE`, so descending always eventually finds a gap. The worst case is one extra character per call — which is why a thousand consecutive "insert just above this one" operations grow a key to about a thousand characters, and not to infinity.'
			},

			{ type: 'h3', id: 'many', text: 'Pasting forty shapes' },
			{
				type: 'code',
				file: 'src/lib/crdt/fracdex.ts',
				lang: 'ts',
				code: `
/**
 * \`count\` keys strictly between the two bounds, ascending.
 *
 * Pasting forty shapes should not be forty calls to \`between\` chained off each
 * other — that builds a key that grows a character per shape and reads like a
 * hash. Splitting the gap evenly keeps them all short.
 */
export function betweenMany(
	before: OrderKey | null,
	after: OrderKey | null,
	count: number
): OrderKey[] {
	if (count < 0) throw new RangeError(\`count must not be negative: \${count}\`);
	if (count === 0) return [];

	const middle = between(before, after);
	if (count === 1) return [middle];

	// Halve the range, fill the lower half, then the upper. Recursion depth is
	// log2(count), so a paste of a million shapes is twenty frames deep.
	const half = Math.floor(count / 2);
	return [
		...betweenMany(before, middle, half),
		middle,
		...betweenMany(middle, after, count - half - 1)
	];
}`
			},
			{
				type: 'p',
				text: 'Chaining `between` forty times off its own output builds a key that grows a character per shape and reads like a hash. Splitting the gap by halving keeps them all short, and the recursion is `log2(count)` deep — a paste of a million shapes is twenty frames.'
			},

			{ type: 'h3', id: 'the-collision', text: 'The collision nobody mentions' },
			{
				type: 'p',
				text: 'Here is the failure that articles about fractional indexing tend to skip.'
			},
			{
				type: 'p',
				text: 'Two replicas concurrently move two *different* shapes into the same slot. Both compute `between(a, b)` with the same arguments, so both get the **same key**. The data has converged perfectly — both replicas hold both shapes with identical keys — and the two screens still differ, because sorting by key alone leaves their relative order to whatever `Array#sort` felt like, and that is implementation-defined for equal elements.'
			},
			{
				type: 'p',
				text: 'A divergence in the rendering, from a data structure that is provably correct. The fix is three lines and has to be used everywhere.'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/fracdex.ts',
				lang: 'ts',
				code: `
/** Validate a key that arrived from somewhere untrusted. */
export function isOrderKey(value: string): value is OrderKey {
	if (value.length === 0) return false;
	if (value.endsWith('0')) return false; // ambiguous: "V" and "V0" would tie
	for (const character of value) {
		if (!DIGITS.includes(character)) return false;
	}
	return true;
}

/**
 * The comparator every render path uses.
 *
 * Never sort by \`key\` alone — see the note at the top of this file. The \`id\`
 * tiebreak is what makes two replicas agree when they have independently minted
 * the same key.
 */
export function compareOrder(
	a: { readonly key: OrderKey; readonly id: string },
	b: { readonly key: OrderKey; readonly id: string }
): number {
	if (a.key !== b.key) return a.key < b.key ? -1 : 1;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}`
			},
			{
				type: 'warn',
				text: 'Never sort by `key` alone anywhere in the codebase. `compareOrder` breaks the tie with the element’s id, which is a stamp and therefore unique and totally ordered — so two replicas that have independently minted the same key still agree on what to draw. Every render path in Tessera goes through this function, and a grep for `.key <` should return exactly one result: this one.'
			},

			{ type: 'h3', id: 'testing-it', text: 'Testing the property, not the examples' },
			{
				type: 'code',
				file: 'src/lib/crdt/fracdex.spec.ts',
				lang: 'ts',
				code: `
	it('stays ordered under a thousand insertions at the same spot', () => {
		// "Send backward" pressed a thousand times. Keys get longer; they never
		// collide and never come out of order.
		let low: OrderKey | null = null;
		const high = key('V');
		const produced: OrderKey[] = [];

		for (let i = 0; i < 1000; i += 1) {
			const next = between(low, high);
			produced.push(next);
			low = next;
		}

		expect(produced).toEqual([...produced].sort());
		expect(new Set(produced).size).toBe(produced.length);
	});
});`
			},
			{
				type: 'p',
				text: 'The assertion is the invariant itself — still sorted, still unique — checked against a thousand insertions at the worst possible spot rather than against six cases somebody thought of. And the collision:'
			},
			{
				type: 'code',
				file: 'src/lib/crdt/fracdex.spec.ts',
				lang: 'ts',
				code: `
describe('compareOrder', () => {
	it('breaks a collision with the element id', () => {
		/*
		 * Two replicas moving different shapes into the same gap compute the same
		 * key. Sorting on the key alone then leaves the result to whatever the sort
		 * implementation felt like — which is not the same on two machines, so the
		 * boards render differently while the data has technically converged.
		 */
		const a = { key: key('V'), id: 'node-a' };
		const b = { key: key('V'), id: 'node-b' };

		expect(compareOrder(a, b)).toBeLessThan(0);
		expect(compareOrder(b, a)).toBeGreaterThan(0);
		expect(compareOrder(a, a)).toBe(0);
	});
`
			},
			{
				type: 'p',
				text: 'That is the pattern for everything in this folder — assert the property, not the example — and chapter 12 takes it as far as it goes.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can explain why integer `z`-order is unusable in a collaborative document.',
					'You can compute `between("V", "W")` on paper and get `"VV"`.',
					'You can describe a divergence that happens *after* the data has converged, and the three-line fix.'
				]
			}
		]
	}
];
