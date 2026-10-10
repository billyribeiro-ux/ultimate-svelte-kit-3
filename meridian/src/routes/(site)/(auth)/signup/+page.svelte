<script lang="ts">
	import { page } from '$app/state';
	import { WarningCircleIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import { keepTyped } from '#lib/forms/keep-typed.ts';
	import { signUp } from '#lib/remote/auth.remote.ts';

	keepTyped(signUp.fields.name, signUp.fields.email, signUp.fields.password);

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/trips');
</script>

<svelte:head>
	<title>{m.auth_sign_up()} — {m.app_name()}</title>
</svelte:head>

<!--
	`novalidate`: the schema on the server is the one validator, and its
	messages come back as the coral line under the field, the same with
	JavaScript on or off — not the browser's own bubble, which looks like
	nothing else in the product and says something slightly different.
-->
<form class="stack" novalidate {...signUp}>
	<h1>{m.auth_sign_up()}</h1>
	<p class="auth__lede">{m.auth_sign_up_lede()}</p>

	<input {...signUp.fields.redirectTo.as('hidden', redirectTo)} />

	<label class="field">
		<span class="label">{m.auth_name()}</span>
		<input class="input" {...signUp.fields.name.as('text')} autocomplete="name" required />
		{#each signUp.fields.name.issues() ?? [] as issue (issue.message)}
			<span class="issue"><WarningCircleIcon size={14} aria-hidden="true" />{issue.message}</span>
		{/each}
	</label>

	<label class="field">
		<span class="label">{m.auth_email()}</span>
		<input class="input" {...signUp.fields.email.as('email')} autocomplete="email" required />
		{#each signUp.fields.email.issues() ?? [] as issue (issue.message)}
			<span class="issue"><WarningCircleIcon size={14} aria-hidden="true" />{issue.message}</span>
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
			<span class="issue"><WarningCircleIcon size={14} aria-hidden="true" />{issue.message}</span>
		{/each}
	</label>

	<button class="btn btn--primary" type="submit" disabled={signUp.pending > 0}>
		{m.auth_sign_up()}
	</button>

	<p class="muted auth__foot">
		{m.auth_have_account()}
		<a href={href(`/(site)/(auth)/signin?redirectTo=${encodeURIComponent(redirectTo)}`)}>
			{m.auth_sign_in()}
		</a>
	</p>
</form>
