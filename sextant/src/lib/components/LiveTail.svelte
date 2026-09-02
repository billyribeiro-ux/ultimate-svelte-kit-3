<script lang="ts">
	import { getAbortSignal } from 'svelte';
	import type { Row } from '#lib/sqf/value.ts';
	import { clock, relative } from '#lib/reactivity/clock.svelte.ts';

	/**
	 * THE LIVE TAIL
	 * =============
	 *
	 * A streaming fetch, consumed as it arrives, cancelled the instant the query
	 * changes underneath it.
	 *
	 * WHY `fetch` AND NOT `EventSource`
	 * ---------------------------------
	 * `EventSource` is the purpose-built API for server-sent events and it has two
	 * limitations that matter here. It cannot send headers — so it cannot carry an
	 * `Accept`, and on an API that authenticated by header it could not
	 * authenticate at all — and it takes no `AbortSignal`, so cancelling means
	 * calling `.close()` from a teardown that has to be wired by hand. It also
	 * reconnects on its own schedule, which sounds helpful and means a tail that
	 * was deliberately stopped comes back.
	 *
	 * A streaming `fetch` gives all three: headers, a signal, and no reconnection
	 * that was not asked for. The cost is parsing the wire format by hand, which
	 * is about fifteen lines because SSE is a genuinely simple format.
	 *
	 * WHY `getAbortSignal()` AND NOT AN `AbortController`
	 * ---------------------------------------------------
	 * The manual version is: create a controller, start the stream, return a
	 * teardown from the effect that aborts it, and remember that the teardown runs
	 * both on unmount *and* on every re-run. That is four things to keep in step,
	 * and the failure mode of getting it wrong is invisible — an orphaned stream
	 * that keeps its server-side subscription alive, one per query edit, until the
	 * tab is closed.
	 *
	 * `getAbortSignal()` is the same thing with none of the bookkeeping: it hands
	 * back a signal tied to *this run of this effect*, and Svelte aborts it when
	 * the effect re-runs or is destroyed. Change the query and the old stream is
	 * already cancelled by the time the new one starts.
	 */
	interface Props {
		tenant: string;
		/** The SQF text. Changing it tears the stream down and opens a new one. */
		q: string;
		/** Rows arriving from the stream. Newest first — see below. */
		rows: Row[];
		paused?: boolean;
	}

	let { tenant, q, rows = $bindable(), paused = false }: Props = $props();

	let status = $state<'idle' | 'connecting' | 'live' | 'error'>('idle');
	let message = $state<string | null>(null);
	let dropped = $state(0);
	let rate = $state(0);
	let lastAt = $state(0);

	/**
	 * How many lines to keep.
	 *
	 * A tail that keeps everything is a memory leak with a nice interface: at two
	 * thousand lines a second an afternoon is tens of millions of rows. Two
	 * thousand is about as far back as anybody scrolls before switching to a
	 * query, and the query is the right tool for further back.
	 */
	const KEEP = 2_000;

	$effect(() => {
		// Read every dependency *before* the first await, so Svelte records them.
		// After an await the effect is no longer tracking, and a dependency read
		// later would silently never trigger a re-run.
		const url = `/api/tail?tenant=${encodeURIComponent(tenant)}&q=${encodeURIComponent(q)}`;
		if (paused) {
			status = 'idle';
			return;
		}

		const signal = getAbortSignal();
		status = 'connecting';
		message = null;

		void consume(url, signal);
	});

	async function consume(url: string, signal: AbortSignal): Promise<void> {
		try {
			const response = await fetch(url, { signal, headers: { accept: 'text/event-stream' } });

			if (!response.ok || !response.body) {
				const body = (await response.json().catch(() => null)) as { message?: string } | null;
				status = 'error';
				message = body?.message ?? `The tail could not start (${response.status}).`;
				return;
			}

			status = 'live';

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;

				/*
				 * `stream: true` is the whole reason this is correct on a slow network.
				 *
				 * A chunk boundary can fall in the middle of a UTF-8 sequence — which
				 * happens the moment a log line contains an emoji or an accent — and a
				 * decoder without it emits a replacement character for the split byte
				 * and another for its partner. The bug looks like corrupt data from the
				 * server.
				 */
				buffer += decoder.decode(value, { stream: true });

				// SSE frames are separated by a blank line. Anything after the last one
				// is an incomplete frame and stays in the buffer.
				const frames = buffer.split('\n\n');
				buffer = frames.pop() ?? '';

				for (const frame of frames) handle(frame);
			}

			// The server closed. Not an error — a deploy, or a proxy timing out — but
			// it must be visible, because a tail that has silently stopped looks
			// exactly like a system that has gone quiet.
			status = 'idle';
			message = 'The tail ended. Start it again to keep watching.';
		} catch (cause) {
			// An abort is the normal way this ends: the query changed, or the
			// component unmounted. It is not a failure and must not be reported as one.
			if (signal.aborted) return;

			status = 'error';
			message = cause instanceof Error ? cause.message : 'The tail was interrupted.';
		}
	}

	function handle(frame: string): void {
		let event = 'message';
		const data: string[] = [];

		for (const line of frame.split('\n')) {
			// A line starting with a colon is a comment — the keep-alive ping.
			if (line.startsWith(':')) continue;
			if (line.startsWith('event:')) event = line.slice(6).trim();
			else if (line.startsWith('data:')) data.push(line.slice(5).trim());
		}

		if (event !== 'rows' || data.length === 0) return;

		const payload = JSON.parse(data.join('\n')) as {
			rows: Row[];
			dropped: number;
			matched: number;
		};

		/*
		 * Newest first, and the array is replaced rather than mutated.
		 *
		 * Newest first because that is where attention is, and because prepending
		 * means the table's scroll anchoring has something to anchor — which is the
		 * case `Virtualizer.anchor` exists for.
		 *
		 * Replaced rather than `unshift`ed because `rows` is `$state.raw` in the
		 * parent: one assignment is one invalidation, where a mutation would be
		 * none.
		 */
		rows = [...payload.rows.reverse(), ...rows].slice(0, KEEP);
		dropped += payload.dropped;
		rate = payload.matched * 10; // The server flushes ten times a second.
		lastAt = Date.now();
	}
</script>

<div class="tail" role="status">
	<span class="tail__state tail__state--{status}">
		{#if status === 'live'}Live{:else if status === 'connecting'}Connecting…{:else if status === 'error'}Stopped{:else}Paused{/if}
	</span>

	{#if status === 'live'}
		<span class="tail__rate">{rate.toLocaleString()} lines/s</span>
		{#if lastAt > 0}
			<span class="tail__seen">last {relative(lastAt, clock.now)}</span>
		{/if}
	{/if}

	{#if dropped > 0}
		<!--
			The dropped count, stated plainly and never hidden.

			Showing 200 lines out of four thousand without saying so is how somebody
			concludes an error stopped happening. This is the single most important
			label in the tail.
		-->
		<span class="tail__dropped">
			{dropped.toLocaleString()} not shown — arriving faster than they can be read
		</span>
	{/if}

	{#if message}
		<span class="tail__message">{message}</span>
	{/if}
</div>

<style>
	.tail {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-1) var(--space-3);
		font-size: var(--fs-xs);
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
		background: var(--surface-raised);
	}

	.tail__state {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.tail__state::before {
		content: '';
		width: 0.4rem;
		height: 0.4rem;
		border-radius: var(--radius-full);
		background: currentcolor;
	}

	.tail__state--live {
		color: var(--ok);
	}

	.tail__state--connecting {
		color: var(--warn);
	}

	.tail__state--error {
		color: var(--danger);
	}

	.tail__rate,
	.tail__seen {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.tail__dropped {
		color: var(--warn);
		font-weight: var(--weight-medium);
	}

	.tail__message {
		color: var(--text-faint);
	}
</style>
