<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';
	import { keepTyped } from '#lib/forms/keep-typed.ts';
	import { signUp } from '#lib/remote/auth.remote.ts';

	keepTyped(signUp.fields.name, signUp.fields.email, signUp.fields.password);

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/trips');
</script>

<svelte:head>
	<title>{m.auth_sign_up()} — {m.app_name()}</title>
</svelte:head>

<form class="card card--pad stack" {...signUp}>
	<h1>{m.auth_sign_up()}</h1>

	<input {...signUp.fields.redirectTo.as('hidden', redirectTo)} />

	<label class="field">
		<span class="label">{m.auth_name()}</span>
		<input class="input" {...signUp.fields.name.as('text')} autocomplete="name" required />
		{#each signUp.fields.name.issues() ?? [] as issue (issue.message)}
			<span class="issue">{issue.message}</span>
		{/each}
	</label>

	<label class="field">
		<span class="label">{m.auth_email()}</span>
		<input class="input" {...signUp.fields.email.as('email')} autocomplete="email" required />
		{#each signUp.fields.email.issues() ?? [] as issue (issue.message)}
			<span class="issue">{issue.message}</span>
		{/each}
	</label>

	<label class="field">
		<span class="label">{m.auth_password()}</span>
		<input
			class="input"
			{...signUp.fields.password.as('password')}
			autocomplete="new-password"
			minlength="12"
			required
		/>
		<span class="hint">{m.auth_password_hint()}</span>
		{#each signUp.fields.password.issues() ?? [] as issue (issue.message)}
			<span class="issue">{issue.message}</span>
		{/each}
	</label>

	<button class="btn btn--primary" type="submit" disabled={signUp.pending > 0}>
		{m.auth_sign_up()}
	</button>

	<p class="muted">
		{m.auth_have_account()}
		<a href={localizeHref(`/signin?redirectTo=${encodeURIComponent(redirectTo)}`)}>
			{m.auth_sign_in()}
		</a>
	</p>
</form>
