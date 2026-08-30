<script lang="ts">
	import { PlusIcon, TrashIcon } from 'phosphor-svelte';
	import Alert from '#lib/components/Alert.svelte';
	import Button from '#lib/components/Button.svelte';
	import { WEEKDAY_NAMES } from '#lib/time/index.ts';
	import { addHours, getHours, getTeam, removeHours } from '../studio.remote.ts';
	import type { LayoutData } from '../$types';
	import { messageFrom } from '#lib/errors.ts';

	let { data }: { data: LayoutData } = $props();

	/*
	 * These four declarations sit ABOVE the awaited `$derived`s below, and the
	 * order is load-bearing.
	 *
	 * When a component binds to a *member* of a `$state` object —
	 * `bind:value={draft.weekday}` — the compiler emits a getter/setter pair that
	 * is evaluated before the part of the instance script that follows the first
	 * awaited `$derived`. Declare `draft` after those and it is still `undefined`
	 * when the getter runs, so server rendering dies with "Cannot read properties
	 * of undefined (reading 'weekday')" and the page 500s before anybody sees it.
	 *
	 * Binding to a plain `$state` variable is unaffected, and so is reading
	 * `draft.weekday` in ordinary markup — which is what makes this so easy to
	 * walk into. Keeping bound state at the top of the script sidesteps it
	 * entirely.
	 */
	let lastError = $state<string | null>(null);
	let busy = $state(false);

	/** New-shift form state, kept per weekday so several can be filled at once. */
	let draft = $state<{ staffId: string; weekday: number; start: string; end: string }>({
		// Default to the viewer, which is right for a member and a sensible start
		// for an owner. An initial value, not an `$effect` that backfills one:
		// nothing ever resets this field, so an effect writing state here would
		// run exactly once to do what the initializer can do — the pattern the
		// docs (and the autofixer) warn effects away from. Capturing the initial
		// value is the point, hence the ignore: a draft must not change under
		// the person filling it in.
		// svelte-ignore state_referenced_locally
		staffId: data.viewer.staffId,
		weekday: 1,
		start: '09:00',
		end: '17:00'
	});

	const hours = $derived(await getHours({ slug: data.slug }));
	const team = $derived(await getTeam(data.slug));

	/** `09:30` → 570. The input gives us wall-clock text; the API wants minutes. */
	function toMinutes(value: string): number {
		const [h = '0', m = '0'] = value.split(':');
		return Number(h) * 60 + Number(m);
	}

	/** 570 → `09:30`, for display. */
	function toClock(minutes: number): string {
		// Minutes beyond 1440 mean "past midnight" — show them as 25:30 rather than
		// wrapping to 01:30, because that is what the rule actually means.
		const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
		const mm = String(minutes % 60).padStart(2, '0');
		return `${hh}:${mm}`;
	}

	const byStaff = $derived.by(() => {
		/* eslint-disable svelte/prefer-svelte-reactivity -- built fresh each run */
		const grouped = new Map<string, typeof hours.rules>();
		for (const rule of hours.rules) {
			const list = grouped.get(rule.staffId);
			if (list) list.push(rule);
			else grouped.set(rule.staffId, [rule]);
		}
		return grouped;
		/* eslint-enable svelte/prefer-svelte-reactivity */
	});

	async function add() {
		lastError = null;
		busy = true;
		try {
			await addHours({
				slug: data.slug,
				staffId: draft.staffId,
				weekday: draft.weekday,
				startMinute: toMinutes(draft.start),
				endMinute: toMinutes(draft.end)
			});
		} catch (thrown) {
			lastError = messageFrom(thrown, 'Could not add that shift.');
		} finally {
			busy = false;
		}
	}

	async function remove(ruleId: string) {
		lastError = null;
		try {
			await removeHours({ slug: data.slug, ruleId });
		} catch (thrown) {
			lastError = messageFrom(thrown, 'Could not remove that shift.');
		}
	}
</script>

<svelte:head>
	<title>{data.business.name} — hours</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container page">
	<header>
		<h2>Working hours</h2>
		<p class="text-muted">
			Recurring weekly shifts, written as clock times in {data.business.timeZone}. Two rows on the
			same day make a lunch break. These are wall-clock times, so they stay put when the clocks
			change — you still open at nine.
		</p>
	</header>

	{#if lastError}
		<Alert tone="error" title="That did not work"><p>{lastError}</p></Alert>
	{/if}

	<section class="adder">
		<h3>Add a shift</h3>

		<div class="adder-fields">
			{#if data.viewer.role === 'owner'}
				<label>
					Who
					<select bind:value={draft.staffId}>
						{#each team as member (member.id)}
							<option value={member.id}>{member.displayName}</option>
						{/each}
					</select>
				</label>
			{/if}

			<label>
				Day
				<select bind:value={draft.weekday}>
					{#each WEEKDAY_NAMES as name, index (name)}
						<option value={index}>{name}</option>
					{/each}
				</select>
			</label>

			<label>
				From
				<input type="time" bind:value={draft.start} step="300" />
			</label>

			<label>
				To
				<input type="time" bind:value={draft.end} step="300" />
			</label>

			<Button onclick={() => void add()} loading={busy}>
				{#snippet icon()}<PlusIcon weight="bold" />{/snippet}
				Add
			</Button>
		</div>
	</section>

	{#each team.filter((member) => member.isActive) as member (member.id)}
		{@const rules = byStaff.get(member.id) ?? []}
		{@const canEdit = hours.canEdit.includes(member.id)}
		<section class="person" style="--hue: {member.colourHue}">
			<h3>{member.displayName}</h3>

			{#if rules.length === 0}
				<p class="empty text-muted">No shifts yet — nothing can be booked.</p>
			{:else}
				<ul class="shifts" role="list">
					{#each rules as rule (rule.id)}
						<li>
							<span class="day">{WEEKDAY_NAMES[rule.weekday]}</span>
							<span class="span">{toClock(rule.startMinute)} – {toClock(rule.endMinute)}</span>
							{#if canEdit}
								<button
									type="button"
									class="remove"
									onclick={() => void remove(rule.id)}
									aria-label="Remove {WEEKDAY_NAMES[rule.weekday]} {toClock(
										rule.startMinute
									)} to {toClock(rule.endMinute)} for {member.displayName}"
								>
									<TrashIcon weight="bold" />
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	h2 {
		font-size: var(--text-lg);
	}

	h3 {
		font-size: var(--text-md);
	}

	header p {
		margin-block-start: var(--space-2);
		font-size: var(--text-sm);
	}

	.adder {
		padding: var(--space-4);
		background: var(--surface-sunken);
		border: var(--border) solid var(--line);
		border-radius: var(--radius-lg);
	}

	.adder-fields {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3);
		margin-block-start: var(--space-3);
	}

	.adder-fields label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
		margin: 0;
	}

	.adder-fields select,
	.adder-fields input {
		width: auto;
		min-width: 7rem;
	}

	.person {
		padding: var(--space-4);
		background: var(--surface);
		border: var(--border) solid var(--line);
		border-inline-start: 4px solid oklch(60% 0.14 var(--hue));
		border-radius: var(--radius-md);
	}

	.shifts {
		list-style: none;
		padding: 0;
		margin-block-start: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.shifts li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: 0;
		font-size: var(--text-sm);
	}

	.day {
		min-width: 6rem;
		font-weight: var(--weight-medium);
	}

	.span {
		font-variant-numeric: tabular-nums;
		color: var(--ink-muted);
	}

	.remove {
		margin-inline-start: auto;
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: var(--radius-sm);
		color: var(--ink-faint);
	}

	.remove:hover {
		color: var(--danger);
		background: var(--danger-soft);
	}

	.empty {
		margin-block-start: var(--space-2);
		font-size: var(--text-sm);
		max-width: none;
	}
</style>
