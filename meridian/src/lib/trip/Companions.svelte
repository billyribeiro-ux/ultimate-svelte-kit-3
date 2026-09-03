<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { CopyIcon, LinkIcon, UserMinusIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { isOwner, type ViewerRole } from '#lib/domain/roles.ts';
	import type { Role } from '#lib/domain/schemas.ts';
	import { changeRole, createInvite, leaveTrip, removeMember } from '#lib/remote/invites.remote.ts';
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

	let inviteRole: 'editor' | 'viewer' = $state('editor');
	let inviteUrl = $state<string | null>(null);

	async function invite() {
		try {
			const result = await createInvite({ tripId: view.trip.id, role: inviteRole });
			inviteUrl = result.url;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function copy() {
		if (!inviteUrl) return;
		try {
			await navigator.clipboard.writeText(inviteUrl);
			toast(m.companions_copied());
		} catch {
			// The link is on screen; a person can still select it.
		}
	}

	async function setRole(userId: string, next: 'editor' | 'viewer') {
		try {
			await changeRole({ tripId: view.trip.id, userId, role: next });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}

	async function remove(userId: string) {
		try {
			await removeMember({ tripId: view.trip.id, userId });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}
</script>

<section class="stack stack--lg">
	<h2>{m.companions_title()}</h2>

	<ul class="members" role="list">
		{#each view.document.members as member (member.userId)}
			<li class="card member">
				<div class="stack stack--sm">
					<strong>
						{member.name}
						{#if member.userId === viewerId}<span class="muted">({m.companions_you()})</span>{/if}
					</strong>
					<p class="cluster">
						<span class="chip" class:chip--sea={member.role === 'owner'}
							>{roleLabel[member.role]()}</span
						>
						{#if here.has(member.userId)}
							<span class="chip chip--sun">{m.companions_here()}</span>
						{/if}
					</p>
				</div>
				{#if owner && member.role !== 'owner'}
					<div class="cluster">
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
							class="btn btn--sm btn--danger"
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
			<div class="cluster">
				<label class="field">
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
				<p class="muted">{m.companions_link_ready()}</p>
				<div class="cluster">
					<code class="invite__url">{inviteUrl}</code>
					<button class="btn btn--sm" type="button" onclick={copy}>
						<CopyIcon size={14} aria-hidden="true" />
						{m.companions_copy()}
					</button>
				</div>
			{/if}
		</div>
	{:else if role !== 'link'}
		<form {...leaveTrip}>
			<input {...leaveTrip.fields.tripId.as('hidden', view.trip.id)} />
			<button class="btn btn--danger" type="submit">{m.trip_leave()}</button>
		</form>
	{/if}
</section>

<style>
	.members {
		display: grid;
		gap: var(--space-2);
	}

	.member {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
	}

	.invite__make {
		align-self: end;
	}

	.invite__url {
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius-sm);
		background: var(--paper-3);
		font-size: var(--text-xs);
		overflow-wrap: anywhere;
	}
</style>
