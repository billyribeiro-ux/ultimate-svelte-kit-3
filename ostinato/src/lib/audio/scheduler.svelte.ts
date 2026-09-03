/**
 * THE SCHEDULER
 * =============
 *
 * The heart of the instrument, and the part most people get wrong first.
 *
 * THE WRONG WAY
 * -------------
 * `setInterval(playStep, 125)` at 120bpm. JavaScript timers are not precise —
 * they fire *at least* that late, later when the tab is busy, much later when
 * it is in the background — and every late tick is a hit that lands late. The
 * ear notices ten milliseconds. A groove built on `setInterval` drifts, lurches
 * and never quite sits.
 *
 * THE RIGHT WAY: TWO CLOCKS
 * -------------------------
 * Web Audio has its own clock, `context.currentTime`, on the audio thread,
 * accurate to a sample. And every sound can be told *when* to start on that
 * clock: `osc.start(time)`. So the imprecise timer is used only to *look
 * ahead*: every 25ms it asks "which steps fall in the next 100ms?" and
 * schedules those on the audio clock, exactly. The timer can be late by 50ms
 * and nothing is heard, because everything it needed to schedule was already
 * scheduled last time. This is Chris Wilson's "A Tale of Two Clocks", and it
 * is the only sequencer design that works in a browser.
 *
 * THE PLAYHEAD IS A THIRD CLOCK
 * -----------------------------
 * The interface wants to know which step is *sounding now*, which is neither
 * "the last one scheduled" (that is up to 100ms in the future) nor "the timer
 * tick". Each scheduled step is pushed onto a queue with its audio time, and a
 * `requestAnimationFrame` loop pops the ones whose time has come. `step` is
 * `$state`, so the grid highlights the right column on the frame it starts.
 */

import { stepSeconds } from '#lib/music/time.ts';
import { STEPS, type Pattern } from '#lib/pattern/model.ts';
import type { AudioEngine } from './engine.svelte.ts';
import { scheduleStep, type Outputs } from './schedule.ts';

/** How often the timer looks, and how far ahead it schedules. */
const TICK_MS = 25;
const LOOKAHEAD_S = 0.1;

export class Scheduler {
	#engine: AudioEngine;
	#pattern: () => Pattern;
	#outputs: Outputs;

	#timer: ReturnType<typeof setInterval> | null = null;
	#frame = 0;
	#nextStep = 0;
	#nextTime = 0;

	/*
	 * Plain arrays and plain numbers, on purpose. This queue is touched forty
	 * times a second from a timer and sixty times a second from an animation
	 * frame; nothing renders from it, and a reactive proxy around it would be a
	 * signal write per hit that notifies nobody.
	 */
	#queue: { step: number; time: number }[] = [];

	playing = $state(false);
	/** The step sounding now, or -1 when stopped. */
	step = $state(-1);
	/** Bars completed since play was pressed; the transport shows it. */
	bars = $state(0);

	/**
	 * @param pattern a *getter*, not a value. The timer reads the pattern on
	 * every tick, so a step toggled while playing is heard the next time the
	 * playhead reaches it. Reading `$state` inside a timer is untracked, which
	 * is what we want: nothing should re-run because the pattern changed —
	 * the next tick simply sees the new one.
	 */
	constructor(engine: AudioEngine, pattern: () => Pattern, outputs: Outputs) {
		this.#engine = engine;
		this.#pattern = pattern;
		this.#outputs = outputs;
	}

	async start(): Promise<void> {
		if (this.playing) return;
		await this.#engine.resume();

		const ctx = this.#engine.context;
		this.#nextStep = 0;
		this.#nextTime = ctx.currentTime + 0.05;
		this.#queue.length = 0;
		this.bars = 0;
		this.playing = true;

		this.#tick();
		this.#timer = setInterval(() => this.#tick(), TICK_MS);
		this.#frame = requestAnimationFrame(() => this.#draw());
	}

	stop(): void {
		if (!this.playing) return;
		if (this.#timer) clearInterval(this.#timer);
		cancelAnimationFrame(this.#frame);
		this.#timer = null;
		this.#queue.length = 0;
		this.playing = false;
		this.step = -1;
	}

	toggle(): Promise<void> | void {
		return this.playing ? this.stop() : this.start();
	}

	/** Schedule everything due in the lookahead window. */
	#tick(): void {
		const ctx = this.#engine.context;
		const pattern = this.#pattern();

		while (this.#nextTime < ctx.currentTime + LOOKAHEAD_S) {
			const at = scheduleStep(ctx, this.#outputs, pattern, this.#nextStep, this.#nextTime);
			this.#queue.push({ step: this.#nextStep, time: at });

			// Tempo is read per step, so a BPM change takes effect on the next
			// sixteenth rather than the next bar — or the next restart.
			this.#nextTime += stepSeconds(pattern.bpm);
			this.#nextStep = (this.#nextStep + 1) % STEPS;
		}
	}

	/** Advance the playhead to whichever queued step has started. */
	#draw(): void {
		const now = this.#engine.now;
		let head = this.#queue[0];

		while (head && head.time <= now) {
			if (head.step === 0 && this.step === STEPS - 1) this.bars += 1;
			this.step = head.step;
			this.#queue.shift();
			head = this.#queue[0];
		}

		this.#frame = requestAnimationFrame(() => this.#draw());
	}
}
