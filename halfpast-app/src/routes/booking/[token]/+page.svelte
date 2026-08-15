<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { browser } from '$app/env';
	import { PUBLIC_DEFAULT_TIME_ZONE } from '$app/env/public';
	import { CalendarBlankIcon, MapPinIcon, PhoneIcon, UserIcon } from 'phosphor-svelte';

	import Alert from '#lib/components/Alert.svelte';
	import Button from '#lib/components/Button.svelte';
	import { loadMotion } from '#lib/motion/index.ts';
	import {
		detectTimeZone,
		formatDuration,
		formatIsoDate,
		formatMoney,
		formatTime,
		instantToIsoDate,
		offsetLabel,
		sameWallClock
	} from '#lib/time/index.ts';
	import { cancelOwnBooking, getManagedBooking } from './manage.remote.ts';
	import { messageFrom } from '#lib/errors.ts';

	let { data }: { data: { token: string } } = $props();

	/** `?new=1` is set by the redirect after a successful booking. */
	const justBooked = $derived(page.url.searchParams.get('new') === '1');

	/**
	 * The viewer's own time zone.
	 *
	 * On the server there is nothing to detect — `Intl` reports whatever the
	 * container is set to, which is almost always UTC and is nobody's home — so
	 * the configured default is used. In the browser the real zone is available
	 * synchronously, so this is a plain `$derived` rather than state corrected by
	 * an effect: one source of truth, and no intermediate frame showing a time in
	 * the wrong zone.
	 */
	const viewerZone = $derived(browser ? detectTimeZone() : PUBLIC_DEFAULT_TIME_ZONE);

	let cancelling = $state(false);
	let cancelError = $state<string | null>(null);

	/**
	 * The booking, awaited so the layout's boundary suspends and this page arrives
	 * server-rendered rather than filling in after hydration.
	 */
	const b = $derived(await getManagedBooking(data.token));

	const cancelled = $derived(b.status === 'cancelled');
	const zonesDiffer = $derived(!sameWallClock(b.startsAt, viewerZone, b.businessTimeZone));

	async function cancel() {
		if (!confirm('Cancel this appointment?')) return;

		cancelling = true;
		cancelError = null;

		try {
			/*
			 * No `.updates(...)` here, and nothing to await afterwards.
			 *
			 * The command's handler calls `getManagedBooking(token).refresh()` on the
			 * server, so the updated booking arrives with this very response — a
			 * single-flight mutation. By the time this line resolves, the query above
			 * already holds the cancelled booking and the page has re-rendered.
			 *
			 * This page uses a plain `query`, not a live one, so nothing else was
			 * going to tell the browser the answer changed. That is exactly when
			 * single-flight earns its keep.
			 */
			await cancelOwnBooking({ token: data.token, reason: '' });
		} catch (thrown) {
			cancelError = messageFrom(thrown, 'We could not cancel that.');
		} finally {
			cancelling = false;
		}
	}

	/**
	 * A confetti-free celebration: the confirmation card lifts into place once.
	 *
	 * Fired from an effect rather than an attachment because it should happen
	 * only when the booking is new, and only once — an attachment would replay it
	 * every time the query refreshed.
	 */
	let card = $state<HTMLElement | null>(null);
	let celebrated = false;

	$effect(() => {
		if (!justBooked || celebrated || !card) return;
		celebrated = true;

		const node = card;
		void loadMotion().then((motion) => {
			if (!motion) return;
			motion.gsap
				.timeline()
				.from(node, { y: 24, opacity: 0, duration: 0.6, ease: 'power3.out' })
				.from(
					node.querySelectorAll('.detail'),
					{
						y: 10,
						opacity: 0,
						duration: 0.4,
						stagger: 0.06,
						ease: 'power2.out',
						clearProps: 'all'
					},
					'-=0.3'
				);
		});
	});
</script>

<svelte:head>
	<title>Your appointment — Halfpast</title>
	<!--
		Never index this page. The URL is the credential, and a search engine that
		crawled it would publish somebody's appointment along with the ability to
		cancel it.
	-->
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="container-narrow page">
	{#if justBooked && !cancelled}
		<Alert tone="success" title="You're booked in">
			<p>We've kept this page for you — bookmark it to change or cancel your appointment.</p>
		</Alert>
	{/if}

	{#if cancelled}
		<Alert tone="info" title="This appointment is cancelled">
			<p>Nothing further to do. You're welcome to book another time whenever suits.</p>
		</Alert>
	{/if}

	{#if cancelError}
		<Alert tone="error" title="We could not cancel that"><p>{cancelError}</p></Alert>
	{/if}

	<article class="card" class:dim={cancelled} bind:this={card}>
		<p class="eyebrow">{b.businessName}</p>

		<h1 class="when">
			{formatTime(b.startsAt, viewerZone, { withZone: zonesDiffer })}
		</h1>
		<p class="date">{formatIsoDate(instantToIsoDate(b.startsAt, viewerZone))}</p>

		{#if zonesDiffer}
			<p class="zone-note detail">
				That's {formatTime(b.startsAt, b.businessTimeZone)} at the studio ({offsetLabel(
					b.startsAt,
					b.businessTimeZone
				)}).
			</p>
		{/if}

		<dl class="details">
			<div class="detail">
				<dt><CalendarBlankIcon aria-hidden="true" /> What</dt>
				<dd>
					{b.serviceName} · {formatDuration(b.durationMinutes)} ·
					{b.priceCents === 0 ? 'Free' : formatMoney(b.priceCents, b.currency)}
				</dd>
			</div>

			<div class="detail">
				<dt><UserIcon aria-hidden="true" /> With</dt>
				<dd>{b.staffName}</dd>
			</div>

			{#if b.addressLine || b.city}
				<div class="detail">
					<dt><MapPinIcon aria-hidden="true" /> Where</dt>
					<dd>
						{[b.addressLine, b.city, b.postcode].filter(Boolean).join(', ')}
					</dd>
				</div>
			{/if}

			{#if b.businessPhone}
				<div class="detail">
					<dt><PhoneIcon aria-hidden="true" /> Phone</dt>
					<dd><a href="tel:{b.businessPhone}">{b.businessPhone}</a></dd>
				</div>
			{/if}
		</dl>

		{#if b.customerNote}
			<p class="note detail">“{b.customerNote}”</p>
		{/if}

		<p class="reference detail">
			Reference <strong>{b.reference}</strong>
		</p>
	</article>

	<div class="actions">
		{#if b.canCancel}
			<Button variant="secondary" full onclick={() => void cancel()} loading={cancelling}>
				Cancel this appointment
			</Button>
			<p class="small text-faint">
				Free to cancel up to {b.cancellationNoticeHours} hours beforehand.
			</p>
		{:else if !cancelled}
			<Alert tone="warning" title="Too late to cancel online">
				<p>
					Please ring the studio{b.businessPhone ? ` on ${b.businessPhone}` : ''} and they will sort it
					out.
				</p>
			</Alert>
		{/if}

		<Button href={resolve('/book/[slug]', { slug: b.businessSlug })} variant="ghost" full>
			{cancelled ? 'Book another time' : 'Book something else'}
		</Button>
	</div>
</div>

<style>
	.page {
		padding-block: var(--space-7) var(--space-8);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.card {
		padding: var(--space-6);
		background: var(--surface);
		border: var(--border) solid var(--line);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-lg);
	}

	.dim {
		opacity: 0.6;
	}

	.when {
		font-size: var(--text-2xl);
		margin-block: var(--space-2) var(--space-1);
	}

	.date {
		color: var(--ink-muted);
		max-width: none;
	}

	.zone-note {
		margin-block-start: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: var(--surface-sunken);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		max-width: none;
	}

	.details {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-block-start: var(--space-5);
		padding-block-start: var(--space-5);
		border-block-start: var(--border) solid var(--line);
	}

	.detail {
		display: grid;
		grid-template-columns: 7rem 1fr;
		gap: var(--space-3);
		align-items: baseline;
	}

	dt {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--ink-muted);
	}

	dd {
		margin: 0;
		font-size: var(--text-sm);
	}

	.note {
		margin-block-start: var(--space-4);
		padding: var(--space-3);
		background: var(--surface-sunken);
		border-radius: var(--radius-md);
		font-style: italic;
		font-size: var(--text-sm);
		max-width: none;
	}

	.reference {
		margin-block-start: var(--space-4);
		font-size: var(--text-sm);
		color: var(--ink-muted);
		max-width: none;
	}

	.reference strong {
		font-family: var(--font-mono);
		color: var(--ink);
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.small {
		font-size: var(--text-sm);
		text-align: center;
		max-width: none;
	}

	@media (max-width: 26rem) {
		.detail {
			grid-template-columns: 1fr;
			gap: var(--space-1);
		}
	}
</style>
