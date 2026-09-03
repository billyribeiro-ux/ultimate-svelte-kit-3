import { describe, expect, it } from 'vitest';
import {
	INITIAL,
	describe as describeEffect,
	step,
	type AlertRule,
	type AlertStatus
} from './machine.ts';
import { seeded } from '#lib/sketch/testing.ts';

const RULE: AlertRule = { id: 'r1', threshold: 200, clearsAt: 180, forMs: 5 * 60_000 };

/**
 * Feed a series of `[at, value]` samples and return the states it passed
 * through, so a whole scenario reads as a sequence.
 */
function drive(
	rule: AlertRule,
	samples: readonly (readonly [number, number | null])[],
	from: AlertStatus = INITIAL
): { states: string[]; effects: string[]; status: AlertStatus } {
	let status = from;
	const states: string[] = [];
	const effects: string[] = [];

	for (const [at, value] of samples) {
		const result = step(rule, status, value, at);
		status = result.status;
		states.push(status.state);
		if (result.effect.kind !== 'none') effects.push(result.effect.kind);
	}

	return { states, effects, status };
}

const MIN = 60_000;

describe('the happy path', () => {
	it('waits out the `for` duration before firing', () => {
		/*
		 * A single bad sample is usually a scrape hiccup, a GC pause, or one unlucky
		 * request. Paging on it trains people to wait and see, which is the opposite
		 * of what an alert is for.
		 */
		const { states, effects } = drive(RULE, [
			[0, 100],
			[1 * MIN, 250],
			[2 * MIN, 250],
			[3 * MIN, 250],
			[4 * MIN, 250],
			[5 * MIN, 250],
			[6 * MIN, 250]
		]);

		expect(states).toEqual(['ok', 'pending', 'pending', 'pending', 'pending', 'pending', 'firing']);
		expect(effects).toEqual(['fired']);
	});

	it('fires exactly when the duration elapses, not a sample later', () => {
		const { states } = drive(RULE, [
			[0, 250],
			[5 * MIN, 250]
		]);
		expect(states).toEqual(['pending', 'firing']);
	});

	it('absorbs a brief excursion with no notification at all', () => {
		// The whole point of `pending`: nothing was announced, so nothing has to be
		// un-announced.
		const { states, effects } = drive(RULE, [
			[0, 100],
			[1 * MIN, 250],
			[2 * MIN, 100],
			[3 * MIN, 100]
		]);

		expect(states).toEqual(['ok', 'pending', 'ok', 'ok']);
		expect(effects).toEqual([]);
	});

	it('resolves once, with how long it fired for', () => {
		const { effects, status } = drive(RULE, [
			[0, 250],
			[5 * MIN, 250],
			[20 * MIN, 250],
			[25 * MIN, 100],
			[26 * MIN, 100]
		]);

		expect(effects).toEqual(['fired', 'resolved']);
		expect(status.state).toBe('ok');
	});

	it('reports the firing duration from when it fired, not when it crossed', () => {
		let status = INITIAL;
		for (const [at, value] of [
			[0, 250],
			[5 * MIN, 250]
		] as const) {
			status = step(RULE, status, value, at).status;
		}

		const resolved = step(RULE, status, 100, 15 * MIN);
		expect(resolved.effect).toMatchObject({ kind: 'resolved', firedFor: 10 * MIN });
	});

	it('fires immediately when `for` is zero', () => {
		// Right for a rule on something never briefly true — "the certificate
		// expires in under a day" — and it must not cost an evaluation interval
		// passing through `pending`.
		const now: AlertRule = { ...RULE, forMs: 0 };
		const { states, effects } = drive(now, [[0, 250]]);
		expect(states).toEqual(['firing']);
		expect(effects).toEqual(['fired']);
	});
});

describe('hysteresis', () => {
	it('does not flap when the value sits on the threshold', () => {
		/*
		 * With one threshold, a metric parked on the line fires and resolves on
		 * alternate evaluations forever. Ten pages in ten minutes for one problem,
		 * and after the third nobody reads them.
		 */
		const samples: [number, number][] = [];
		for (let i = 0; i < 40; i += 1) samples.push([i * MIN, i % 2 === 0 ? 201 : 199]);

		const { effects } = drive(RULE, samples);

		// One fire, and no resolve: 199 is above `clearsAt` of 180, so the alert
		// stays firing rather than bouncing.
		expect(effects).toEqual(['fired']);
	});

	it('flaps without hysteresis, which is what the gap prevents', () => {
		// The same series against a rule whose clear threshold equals its fire
		// threshold, to show the difference is the gap and not the machine.
		const naive: AlertRule = { id: 'r2', threshold: 200, forMs: 0 };
		const samples: [number, number][] = [];
		for (let i = 0; i < 10; i += 1) samples.push([i * MIN, i % 2 === 0 ? 201 : 199]);

		const { effects } = drive(naive, samples);
		expect(effects.filter((e) => e === 'fired').length).toBeGreaterThan(1);
	});

	it('does not clear on a value sitting exactly on the clear threshold', () => {
		// The boundary a metric parked on a round number lands on. Clearing there
		// reintroduces the flapping the second threshold exists to prevent.
		const { status } = drive(RULE, [
			[0, 250],
			[5 * MIN, 250],
			[6 * MIN, 180]
		]);
		expect(status.state).toBe('firing');
	});

	it('keeps counting down while pending inside the hysteresis band', () => {
		/*
		 * Between the two thresholds the value is neither firing nor clearing, and
		 * the `for` countdown keeps running rather than resetting — otherwise a
		 * metric hovering in the band never fires at all.
		 */
		const { states } = drive(RULE, [
			[0, 250],
			[2 * MIN, 190],
			[4 * MIN, 190],
			[5 * MIN, 250]
		]);
		expect(states).toEqual(['pending', 'pending', 'pending', 'firing']);
	});
});

describe('no data is not zero', () => {
	it('holds the state when the query returns nothing', () => {
		/*
		 * The single worst failure an alerting system can have. A rule on error rate
		 * whose query returns nothing means no requests were made, not that the
		 * error rate is fine — and resolving there is silence during exactly the
		 * outage the alert exists to report.
		 */
		const { states, effects } = drive(RULE, [
			[0, 250],
			[5 * MIN, 250],
			[6 * MIN, null],
			[7 * MIN, null],
			[8 * MIN, null]
		]);

		expect(states).toEqual(['pending', 'firing', 'firing', 'firing', 'firing']);
		expect(effects).toEqual(['fired']);
	});

	it('does not start an alert on missing data either', () => {
		const { states } = drive(RULE, [
			[0, null],
			[1 * MIN, null]
		]);
		expect(states).toEqual(['ok', 'ok']);
	});

	it('still advances the timestamp, so staleness is visible', () => {
		// A separate staleness check needs to see that the rule is being evaluated
		// and getting nothing, which is different from not being evaluated.
		const { status } = drive(RULE, [[42_000, null]]);
		expect(status.at).toBe(42_000);
		expect(status.value).toBeNull();
	});
});

describe('the `below` direction', () => {
	const DROP: AlertRule = {
		id: 'r3',
		threshold: 100,
		clearsAt: 120,
		forMs: 2 * MIN,
		direction: 'below'
	};

	it('fires when throughput falls', () => {
		const { states, effects } = drive(DROP, [
			[0, 500],
			[1 * MIN, 50],
			[2 * MIN, 50],
			[3 * MIN, 50]
		]);
		expect(states).toEqual(['ok', 'pending', 'pending', 'firing']);
		expect(effects).toEqual(['fired']);
	});

	it('mirrors the hysteresis', () => {
		// Clearing means going back *above* `clearsAt`, so 110 — between the two —
		// keeps it firing.
		const { status } = drive(DROP, [
			[0, 50],
			[2 * MIN, 50],
			[3 * MIN, 110]
		]);
		expect(status.state).toBe('firing');
	});

	it('clears above the clear threshold', () => {
		const { effects } = drive(DROP, [
			[0, 50],
			[2 * MIN, 50],
			[3 * MIN, 130]
		]);
		expect(effects).toEqual(['fired', 'resolved']);
	});
});

describe('invariants under random input', () => {
	it('never fires twice without resolving in between', () => {
		/*
		 * The property that matters most to whoever is carrying the pager, checked
		 * against schedules nobody designed. A duplicate page for one incident is
		 * how an alerting system loses its audience.
		 */
		for (let seed = 1; seed <= 300; seed += 1) {
			const random = seeded(seed);
			let status = INITIAL;
			let open = false;

			for (let i = 0; i < 200; i += 1) {
				const value = random() < 0.1 ? null : random() * 400;
				const { status: next, effect } = step(RULE, status, value, i * MIN);
				status = next;

				if (effect.kind === 'fired') {
					expect(open, `seed ${seed} step ${i}: fired while already firing`).toBe(false);
					open = true;
				}
				if (effect.kind === 'resolved') {
					expect(open, `seed ${seed} step ${i}: resolved without firing`).toBe(true);
					open = false;
				}
			}
		}
	});

	it('keeps the state consistent with the effects it emitted', () => {
		for (let seed = 1; seed <= 200; seed += 1) {
			const random = seeded(seed * 13);
			let status = INITIAL;

			for (let i = 0; i < 100; i += 1) {
				const { status: next, effect } = step(RULE, status, random() * 400, i * MIN);

				if (effect.kind === 'fired') expect(next.state).toBe('firing');
				if (effect.kind === 'resolved') expect(next.state).toBe('ok');
				// `firingSince` is set if and only if the state is `firing`.
				expect(next.firingSince !== null, `seed ${seed} step ${i}`).toBe(next.state === 'firing');

				status = next;
			}
		}
	});

	it('is a pure function of its arguments', () => {
		// Same inputs, same outputs — which is what makes the whole of alerting
		// testable without a clock, a scheduler or a database.
		const status: AlertStatus = {
			state: 'pending',
			since: 0,
			firingSince: null,
			value: 250,
			at: 0
		};
		const a = step(RULE, status, 250, 5 * MIN);
		const b = step(RULE, status, 250, 5 * MIN);
		expect(b).toEqual(a);
	});
});

describe('the words people are woken by', () => {
	it('names the metric, the threshold and the current value', () => {
		const effect = { kind: 'fired', value: 254.19999999, at: 0 } as const;
		expect(describeEffect(RULE, 'checkout p95', effect)).toBe(
			'checkout p95 is above 200 (currently 254.2)'
		);
	});

	it('says how long it was firing when it recovered', () => {
		const effect = { kind: 'resolved', value: 100, at: 0, firedFor: 14 * MIN } as const;
		expect(describeEffect(RULE, 'checkout p95', effect)).toBe('checkout p95 recovered after 14m');
	});

	it('says nothing when nothing happened', () => {
		expect(describeEffect(RULE, 'x', { kind: 'none' })).toBeNull();
	});

	it('mirrors the wording for a `below` rule', () => {
		const drop: AlertRule = { id: 'r3', threshold: 100, forMs: 0, direction: 'below' };
		expect(describeEffect(drop, 'throughput', { kind: 'fired', value: 12, at: 0 })).toBe(
			'throughput is below 100 (currently 12)'
		);
	});
});
