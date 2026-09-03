<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, localizeHref } from '#lib/paraglide/runtime.js';
	import { formatRange } from '#lib/domain/dates.ts';
	import { acceptInvite, inviteByToken } from '#lib/remote/invites.remote.ts';

	const token = $derived(page.params.token ?? '');
	const locale = getLocale();
</script>

<svelte:head>
	<title>{m.join_title()} — {m.app_name()}</title>
</svelte:head>

<!--
	An invite link opened by somebody signed in (the `(app)` group saw to
	that, and will bring them back here after signing in). One query says
	whether the link still works; one remote form accepts it — a real form,
	so the button works on a phone that has not finished loading the script.
-->
{const invite = await inviteByToken(token)}

<section class="container join">
	<div class="card card--pad stack">
		<h1>{m.join_title()}</h1>
		<p>{m.join_text({ trip: invite.trip.name })}</p>
		<p class="muted">{formatRange(invite.trip.startDate, invite.trip.endDate, locale)}</p>

		{#if invite.alreadyMember}
			<p>{m.join_already()}</p>
			<a class="btn btn--primary" href={localizeHref(`/t/${invite.trip.slug}`)}>{m.join_open()}</a>
		{:else if invite.used}
			<p class="issue">{m.join_used()}</p>
		{:else if invite.expired}
			<p class="issue">{m.join_expired()}</p>
		{:else}
			<form {...acceptInvite}>
				<input {...acceptInvite.fields.token.as('hidden', token)} />
				<button class="btn btn--primary" type="submit" disabled={acceptInvite.pending > 0}>
					{m.join_accept()}
				</button>
			</form>
		{/if}
	</div>
</section>

<style>
	.join {
		max-width: 30rem;
		padding-block: var(--space-7);
	}
</style>
