<script lang="ts">
	import {
		BroadcastIcon,
		CaretLeftIcon,
		CaretRightIcon,
		CurrencyGbpIcon,
		EnvelopeSimpleIcon,
		PhoneIcon,
		XCircleIcon
	} from 'phosphor-svelte';

	import Alert from '#lib/components/Alert.svelte';
	import Button from '#lib/components/Button.svelte';
	import { reveal, stagger } from '#lib/motion/index.ts';
	import {
		addDays,
		formatDuration,
		formatIsoDate,
		formatMoney,
		formatTime,
		todayIn,
		type IsoDate
	} from '#lib/time/index.ts';
	import { signOut } from '../../sign-in/auth.remote.ts';
	import { cancelAppointment, getDiary } from './diary.remote.ts';

	let { data }: { data: { slug: string; businessName: string; timeZone: string } } = $props();

	/*
	 * `day` starts as null and means "today", rather than being initialised to
	 * today's date.
	 *
	 * Initialising it would read `data.timeZone` once, at component creation, and
	 * freeze that value — which Svelte warns about, correctly. It would also mean
	 * a diary left open overnight still says "Today" above yesterday's date.
	 * Deriving today separately and falling back to it keeps both honest.
	 */
	let day = $state<IsoDate | null>(null);
	let cancelling = $state<string | null>(null);
	let lastError = $state<string | null>(null);

	const today = $derived(todayIn(data.timeZone));
	const activeDay = $derived(day ?? today);
	const isToday = $derived(activeDay === today);

	/*
	 * `diaryQuery` carries `connected` for the Live badge; `result` is the awaited
	 * value, re-resolved every time the server pushes a new diary down the stream.
	 */
	const diaryQuery = $derived(getDiary({ slug: data.slug, day: activeDay }));
	const result = $derived(await diaryQuery);

	async function cancel(bookingId: string, customerName: string) {
		if (!confirm(`Cancel ${customerName}'s appointment? They are not told automatically.`)) return;

		cancelling = bookingId;
		lastError = null;

		try {
			/*
			 * No `.updates(...)` and no optimistic override, on purpose.
			 *
			 * `getDiary` is a *live* query: the cancellation publishes to the notice
			 * board, and the stream pushes a fresh diary to this screen and every
			 * other one within the same round trip. Adding an optimistic override
			 * on top would mean two sources of truth racing each other, and the
			 * loser would flicker.
			 *
			 * Single-flight updates earn their keep on ordinary queries, where
			 * nothing else is going to tell the client the answer changed.
			 */
			await cancelAppointment({ slug: data.slug, bookingId, reason: '' });
		} catch (thrown) {
			lastError = thrown instanceof Error ? thrown.message : 'Could not cancel that appointment.';
		} finally {
			cancelling = null;
		}
	}
</script>

<svelte:head>
	<title>{data.businessName} — diary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container page">
	<header class="head" {@attach reveal({ y: 10, duration: 0.4 })}>
		<div>
			<p class="eyebrow">{data.businessName}</p>
			<h1>{isToday ? 'Today' : formatIsoDate(activeDay)}</h1>
		</div>

		<div class="head-actions">
			{#if diaryQuery.connected}
				<span class="live"><BroadcastIcon weight="fill" aria-hidden="true" /> Live</span>
			{/if}
			<Button variant="ghost" size="sm" onclick={() => void signOut()}>Sign out</Button>
		</div>
	</header>

	<nav class="daybar" aria-label="Choose a day">
		<button type="button" onclick={() => (day = addDays(activeDay, -1))} aria-label="Previous day">
			<CaretLeftIcon weight="bold" />
		</button>

		<p class="daylabel">{formatIsoDate(activeDay)}</p>

		<button type="button" onclick={() => (day = addDays(activeDay, 1))} aria-label="Next day">
			<CaretRightIcon weight="bold" />
		</button>

		{#if !isToday}
			<Button variant="secondary" size="sm" onclick={() => (day = null)}>Today</Button>
		{/if}
	</nav>

	{#if lastError}
		<Alert tone="error" title="That did not work"><p>{lastError}</p></Alert>
	{/if}

	<div class="summary">
		<p>
			<strong>{result.entries.length}</strong>
			{result.entries.length === 1 ? 'appointment' : 'appointments'}
		</p>
		<p class="takings">
			<CurrencyGbpIcon weight="bold" aria-hidden="true" />
			{formatMoney(result.takingsCents, result.entries[0]?.currency ?? 'GBP')}
		</p>
	</div>

	{#if result.entries.length === 0}
		<p class="empty">Nothing booked. Enjoy it.</p>
	{:else}
		<ul class="entries" role="list" {@attach stagger({ y: 8, each: 0.04, onView: false })}>
			{#each result.entries as entry (entry.id)}
				{@const canManage =
					result.viewer.role === 'owner' || result.viewer.staffId === entry.staffId}
				<li class="entry" style="--hue: {entry.colourHue}">
					<div class="times">
						<span class="start">{formatTime(entry.startsAt, result.timeZone)}</span>
						<span class="length text-faint">
							{formatDuration(Math.round((entry.endsAt - entry.startsAt) / 60000))}
						</span>
					</div>

					<div class="body">
						<p class="who">
							<strong>{entry.customerName}</strong>
							<span class="text-muted"> · {entry.serviceName}</span>
						</p>

						<p class="with text-muted">
							with {entry.staffName} ·
							{formatTime(entry.startsAt, result.timeZone)}–{formatTime(
								entry.endsAt,
								result.timeZone
							)}
							{#if entry.blockEndsAt > entry.endsAt}
								<span class="text-faint">
									(chair to {formatTime(entry.blockEndsAt, result.timeZone)})
								</span>
							{/if}
						</p>

						{#if entry.customerNote}
							<p class="note">{entry.customerNote}</p>
						{/if}

						<p class="contact">
							<a href="mailto:{entry.customerEmail}">
								<EnvelopeSimpleIcon aria-hidden="true" />
								{entry.customerEmail}
							</a>
							{#if entry.customerPhone}
								<a href="tel:{entry.customerPhone}">
									<PhoneIcon aria-hidden="true" />
									{entry.customerPhone}
								</a>
							{/if}
							<span class="ref text-faint">{entry.reference}</span>
						</p>
					</div>

					{#if canManage}
						<button
							type="button"
							class="cancel"
							onclick={() => void cancel(entry.id, entry.customerName)}
							disabled={cancelling === entry.id}
							aria-label="Cancel {entry.customerName}'s appointment"
						>
							<XCircleIcon weight="bold" />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.page {
		padding-block: var(--space-6) var(--space-8);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	h1 {
		font-size: var(--text-xl);
		margin-block-start: var(--space-1);
	}

	.head-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.live {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		letter-spacing: var(--tracking-wide);
		text-transform: uppercase;
		color: var(--ok);
	}

	.live :global(svg) {
		animation: breathe 2.4s ease-in-out infinite;
	}

	@keyframes breathe {
		50% {
			opacity: 0.35;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.live :global(svg) {
			animation: none;
		}
	}

	.daybar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.daybar button:not(:global(.btn)) {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border: var(--border) solid var(--line);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--ink-muted);
	}

	.daybar button:not(:global(.btn)):hover {
		color: var(--ink);
		border-color: var(--line-strong);
	}

	.daylabel {
		flex: 1;
		font-weight: var(--weight-medium);
		max-width: none;
	}

	.summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-4);
		background: var(--surface-sunken);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}

	.summary p {
		max-width: none;
	}

	.takings {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-weight: var(--weight-semibold);
	}

	.empty {
		padding: var(--space-7) var(--space-4);
		text-align: center;
		color: var(--ink-muted);
		background: var(--surface-sunken);
		border: var(--border) dashed var(--line-strong);
		border-radius: var(--radius-lg);
		max-width: none;
	}

	.entries {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.entries li + li {
		margin: 0;
	}

	.entry {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: var(--space-4);
		align-items: start;

		padding: var(--space-4);
		background: var(--surface);
		border: var(--border) solid var(--line);
		/*
		 * The staff member's colour, as a stripe rather than a background. A tinted
		 * card would put text on an arbitrary hue and lose the contrast guarantee;
		 * a stripe carries the same information and costs nothing in legibility.
		 */
		border-inline-start: 4px solid oklch(60% 0.14 var(--hue));
		border-radius: var(--radius-md);
	}

	.times {
		display: flex;
		flex-direction: column;
		min-width: 4.5rem;
	}

	.start {
		font-family: var(--font-display);
		font-size: var(--text-md);
		font-weight: var(--weight-bold);
		font-variant-numeric: tabular-nums;
	}

	.length {
		font-size: var(--text-xs);
	}

	.body {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.body p {
		max-width: none;
	}

	.who {
		font-size: var(--text-base);
	}

	.with {
		font-size: var(--text-sm);
	}

	.note {
		margin-block-start: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: var(--warn-soft);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.contact {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-block-start: var(--space-2);
		font-size: var(--text-sm);
	}

	.contact a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		text-decoration: none;
		color: var(--ink-muted);
	}

	.contact a:hover {
		color: var(--accent);
	}

	.ref {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.cancel {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--radius-md);
		color: var(--ink-faint);
		font-size: 1.25rem;
		transition:
			color var(--dur-fast) var(--ease-standard),
			background-color var(--dur-fast) var(--ease-standard);
	}

	.cancel:hover:not(:disabled) {
		color: var(--danger);
		background: var(--danger-soft);
	}

	.cancel:disabled {
		opacity: 0.4;
		cursor: wait;
	}

	/* On a phone the stripe and the time column stay; the cancel button drops to
	 * its own row so the customer's name gets the full width. */
	@media (max-width: 30rem) {
		.entry {
			grid-template-columns: auto 1fr;
		}
		.cancel {
			grid-column: 2;
			justify-self: end;
		}
	}
</style>
