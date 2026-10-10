<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { errorMessage } from '#lib/ui/errors.ts';
	import { fade } from 'svelte/transition';
	import { CheckIcon, CopyIcon, CrownSimpleIcon, LinkIcon, UserMinusIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { isOwner, type ViewerRole } from '#lib/domain/roles.ts';
	import type { Role } from '#lib/domain/schemas.ts';
	import { changeRole, createInvite, leaveTrip, removeMember } from '#lib/remote/invites.remote.ts';
	import { pop } from '#lib/motion/transitions.ts';
	import { reducedMotion } from '#lib/motion/prefers.svelte.ts';
	import type { TripState } from './state.svelte.ts';

	/**
	 * WHO IS ON THE TRIP
	 * ==================
	 *
	 * The member list with their roles, who is here right now, and — for the
	 * owner — the invite link and the two things they can do to a companion.
	 * An invite is a `command` because it exists to be copied; leaving is a
	 * `form` because it is a page with a button and should work with
	 * JavaScript off.
	 */
	interface Props {
		view: TripState;
		role: ViewerRole;
		viewerId: string | null;
	}

	let { view, role, viewerId }: Props = $props();

	const owner = $derived(isOwner(role));
	const here = $derived(new Set(view.presence.map((p) => p.userId)));

	const roleLabel: Record<Role, () => string> = {
		owner: m.role_owner,
		editor: m.role_editor,
		viewer: m.role_viewer
	};

	const initials = (name: string) =>
		name
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');

	let inviteRole: 'editor' | 'viewer' = $state('editor');
	let inviteUrl = $state<string | null>(null);
	/* The copy button shows a check for 1.6s after a copy; the text stays "Copy link". */
	let copied = $state(false);

	async function invite() {
		try {
			const result = await createInvite({ tripId: view.trip.id, role: inviteRole });
			inviteUrl = result.url;
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}

	async function copy() {
		if (!inviteUrl) return;
		try {
			await navigator.clipboard.writeText(inviteUrl);
			toast.success(m.companions_copied());
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			// The link is on screen; a person can still select it.
		}
	}

	async function setRole(userId: string, next: 'editor' | 'viewer') {
		try {
			await changeRole({ tripId: view.trip.id, userId, role: next });
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}

	async function remove(userId: string) {
		try {
			await removeMember({ tripId: view.trip.id, userId });
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}
</script>

<section class="stack stack--lg">
	<h2 class="companions__title">{m.companions_title()}</h2>

	<ul class="members" role="list">
		{#each view.document.members as member (member.userId)}
			<li class="card member">
				<!-- Initials on the sea; the owner wears a small crown on the avatar's corner. -->
				<span class="member__avatar" aria-hidden="true">
					{initials(member.name)}
					{#if member.role === 'owner'}
						<span class="member__crown"><CrownSimpleIcon size={10} weight="fill" /></span>
					{/if}
				</span>
				<div class="member__body">
					<strong class="member__name">
						{member.name}
						{#if member.userId === viewerId}<span class="member__you">({m.companions_you()})</span
							>{/if}
					</strong>
					<p class="cluster">
						<!-- A role is a fact, so a quiet chip: the sea is kept for "here now", which is live. -->
						<span class="chip">{roleLabel[member.role]()}</span>
						{#if here.has(member.userId)}
							<!-- Presence is live, and the sea already means live. -->
							<span class="chip chip--sea member__here">
								<span class="member__dot" aria-hidden="true"></span>
								{m.companions_here()}
							</span>
						{/if}
					</p>
				</div>
				{#if owner && member.role !== 'owner'}
					<div class="member__actions cluster">
						{#if member.role === 'editor'}
							<button
								class="btn btn--sm"
								type="button"
								onclick={() => setRole(member.userId, 'viewer')}
							>
								{m.companions_make_viewer()}
							</button>
						{:else}
							<button
								class="btn btn--sm"
								type="button"
								onclick={() => setRole(member.userId, 'editor')}
							>
								{m.companions_make_editor()}
							</button>
						{/if}
						<button
							class="btn btn--sm btn--ghost btn--danger"
							type="button"
							onclick={() => remove(member.userId)}
							aria-label="{m.companions_remove()} {member.name}"
						>
							<UserMinusIcon size={14} aria-hidden="true" />
							{m.companions_remove()}
						</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	{#if owner}
		<div class="card card--pad stack">
			<h3>{m.companions_invite()}</h3>
			<div class="invite">
				<label class="field invite__role">
					<span class="label">{m.companions_invite_role()}</span>
					<select class="select" bind:value={inviteRole}>
						<option value="editor">{m.companions_role_editor()}</option>
						<option value="viewer">{m.companions_role_viewer()}</option>
					</select>
				</label>
				<button class="btn btn--primary invite__make" type="button" onclick={invite}>
					<LinkIcon size={16} aria-hidden="true" />
					{m.companions_make_link()}
				</button>
			</div>
			{#if inviteUrl}
				<!-- The link block fades in; it does not grow — layout never animates. -->
				<div class="stack stack--sm" in:fade={{ duration: reducedMotion.current ? 0 : 240 }}>
					<p class="muted">{m.companions_link_ready()}</p>
					<div class="invite__row">
						<!--
							A `<code>`, not a read-only input: the end-to-end suite reads its
							text content, and `user-select: all` makes one tap select the lot.
						-->
						<code class="invite__url well tabular">{inviteUrl}</code>
						<!-- The toast says "Copied" to a screen reader; a live region in the button said it a second time. -->
						<button class="btn btn--sm" type="button" onclick={copy}>
							{#if copied}
								<span class="copy__icon" in:pop><CheckIcon size={14} aria-hidden="true" /></span>
							{:else}
								<span class="copy__icon"><CopyIcon size={14} aria-hidden="true" /></span>
							{/if}
							{m.companions_copy()}
						</button>
					</div>
				</div>
			{/if}
		</div>
	{:else if role !== 'link'}
		<form {...leaveTrip}>
			<input {...leaveTrip.fields.tripId.as('hidden', view.trip.id)} />
			<button class="btn btn--danger btn--ghost" type="submit">{m.trip_leave()}</button>
		</form>
	{/if}
</section>

<style>
	/* The same size as the other tabs' headings, so switching tabs does not change the scale. */
	.companions__title {
		font-size: var(--text-2xl);
		letter-spacing: var(--tracking-2xl);
	}

	.members {
		display: grid;
		gap: var(--space-2);
	}

	.member {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
	}

	.member__avatar {
		position: relative;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		background: var(--sea);
		color: var(--on-sea);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.member__crown {
		position: absolute;
		right: -3px;
		bottom: -3px;
		display: grid;
		place-items: center;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: var(--paper-2);
		color: var(--sun);
		box-shadow: var(--shadow-1);
	}

	.member__body {
		display: grid;
		gap: var(--space-1);
		flex: 1 1 10rem;
		min-width: 0;
	}

	.member__name {
		font-weight: 600;
	}

	.member__you {
		color: var(--ink-3);
		font-weight: 400;
	}

	.member__here {
		gap: var(--space-2);
	}

	.member__dot {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		background: currentColor;
	}

	.member__actions {
		margin-inline-start: auto;
	}

	.invite {
		display: grid;
		gap: var(--space-3);
	}

	.invite__make {
		align-self: end;
	}

	.invite__row {
		display: grid;
		gap: var(--space-2);
	}

	.invite__url {
		font-size: var(--text-xs);
		overflow-wrap: anywhere;
		user-select: all;
	}

	.copy__icon {
		display: inline-grid;
		place-items: center;
	}

	/* A two-option choice is not 1,000px wide: the select stops at 18rem, with the button beside it. */
	@media (min-width: 40em) {
		.invite {
			grid-template-columns: minmax(0, 18rem) auto;
			justify-content: start;
			align-items: end;
		}

		.invite__row {
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
		}
	}
</style>
