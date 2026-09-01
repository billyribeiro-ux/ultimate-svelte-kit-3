import { describe, expect, it } from 'vitest';
import {
	Clock,
	ClockDriftError,
	MAX_DRIFT_MS,
	actorOf,
	compare,
	decode,
	driftMs,
	encode,
	isPlausible,
	max,
	newActorId,
	wallOf,
	type Stamp
} from './clock';
import { actor, fakeClock, seeded, stamp } from './testing';

describe('encoding', () => {
	it('round-trips', () => {
		const hlc = { wall: 1_756_000_000_123, counter: 42, actor: actor('a') };
		expect(decode(encode(hlc))).toEqual(hlc);
	});

	it('sorts as a string exactly as it sorts as fields', () => {
		/*
		 * The property the whole encoding exists for. If this ever fails, every
		 * `ORDER BY stamp` in the database is silently returning history in the
		 * wrong order.
		 */
		const random = seeded(7);
		const stamps: Stamp[] = [];

		for (let i = 0; i < 400; i += 1) {
			stamps.push(
				encode({
					wall: 1_700_000_000_000 + Math.floor(random() * 100_000_000),
					counter: Math.floor(random() * 99_999),
					actor: actor(String.fromCharCode(97 + Math.floor(random() * 6)))
				})
			);
		}

		const byString = [...stamps].sort();
		const byFields = [...stamps].sort((a, b) => {
			const x = decode(a);
			const y = decode(b);
			return x.wall - y.wall || x.counter - y.counter || (x.actor < y.actor ? -1 : 1);
		});

		expect(byString).toEqual(byFields);
	});

	it('reads the actor and wall back out without decoding', () => {
		const value = stamp(1_756_000_000_123, 7, 'c');
		expect(actorOf(value)).toBe(actor('c'));
		expect(wallOf(value)).toBe(1_756_000_000_123);
	});

	it('refuses values that do not fit the fixed width', () => {
		expect(() => encode({ wall: -1, counter: 0, actor: actor('a') })).toThrow(RangeError);
		expect(() => encode({ wall: 0, counter: 100_000, actor: actor('a') })).toThrow(RangeError);
		expect(() => encode({ wall: 0, counter: 0, actor: 'short' as never })).toThrow(RangeError);
		expect(() => decode('nope' as Stamp)).toThrow(RangeError);
	});

	it('orders and maxes', () => {
		const earlier = stamp(10, 0, 'a');
		const later = stamp(10, 1, 'a');
		expect(compare(earlier, later)).toBeLessThan(0);
		expect(compare(later, earlier)).toBeGreaterThan(0);
		expect(compare(earlier, earlier)).toBe(0);
		expect(max(earlier, later)).toBe(later);
	});

	it('mints actor ids of the right shape', () => {
		const id = newActorId(seeded(3));
		expect(id).toHaveLength(8);
		expect(id).toMatch(/^[0-9a-z]{8}$/);
	});
});

describe('ticking', () => {
	it('never issues the same stamp twice, even when time stands still', () => {
		const { clock } = fakeClock('a');
		const seen = new Set<Stamp>();
		for (let i = 0; i < 1000; i += 1) seen.add(clock.tick());
		expect(seen.size).toBe(1000);
	});

	it('is strictly increasing', () => {
		const harness = fakeClock('a');
		let previous = harness.clock.tick();

		for (let i = 0; i < 500; i += 1) {
			if (i % 3 === 0) harness.advance(1);
			const next = harness.clock.tick();
			expect(compare(previous, next)).toBeLessThan(0);
			previous = next;
		}
	});

	it('does not go backwards when the machine clock does', () => {
		/*
		 * NTP correcting a drift, a user changing the date, a VM migrating. The
		 * clock must absorb it into the counter rather than reissuing stamps that
		 * sort before ones already in the document.
		 */
		const harness = fakeClock('a', 5_000);
		const before = harness.clock.tick();

		harness.set(1_000); // two seconds into the past
		const after = harness.clock.tick();

		expect(compare(before, after)).toBeLessThan(0);
		expect(decode(after).wall).toBe(5_000);
		expect(decode(after).counter).toBe(1);
	});

	it('borrows a millisecond when the counter is exhausted', () => {
		const { clock } = fakeClock('a', 1_000);
		for (let i = 0; i <= 99_999; i += 1) clock.tick();

		const overflowed = clock.tick();
		expect(decode(overflowed)).toMatchObject({ wall: 1_001, counter: 0 });
	});

	it('resumes from a persisted reading', () => {
		const first = fakeClock('a', 9_000);
		first.clock.tick();
		const saved = first.clock.peek();

		// A reload: physical time has gone backwards relative to the saved state,
		// which is exactly the case a resume has to survive.
		const second = new Clock(actor('a'), () => 1_000, saved);
		expect(compare(encode(saved), second.tick())).toBeLessThan(0);
	});
});

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
	});

	it('normalises a counter that overflows through a received stamp', () => {
		const harness = fakeClock('a', 1_000);
		harness.clock.observe(stamp(1_000, 99_999, 'b'));
		expect(harness.clock.peek()).toMatchObject({ wall: 1_001, counter: 0 });
	});
});

describe('the drift check the server runs', () => {
	it('accepts skew inside the limit and rejects what is beyond it', () => {
		const now = 1_000_000;
		expect(isPlausible(stamp(now + MAX_DRIFT_MS - 1, 0, 'b'), now)).toBe(true);
		expect(isPlausible(stamp(now + MAX_DRIFT_MS + 1, 0, 'b'), now)).toBe(false);
	});

	it('never rejects a stamp from the past', () => {
		// An offline replica rejoining after a week is the normal case, not an attack.
		const now = 1_000_000_000;
		expect(isPlausible(stamp(1, 0, 'b'), now)).toBe(true);
		expect(driftMs(stamp(1, 0, 'b'), now)).toBeLessThan(0);
	});

	it('explains itself when it refuses', () => {
		const error = new ClockDriftError(stamp(700_000, 0, 'b'), 100_000);
		expect(error.message).toContain('600s ahead of server time');
		expect(error.name).toBe('ClockDriftError');
	});
});
