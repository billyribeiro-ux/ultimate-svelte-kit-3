<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';
	import { keepTyped } from '#lib/forms/keep-typed.ts';
	import { signIn } from '#lib/remote/auth.remote.ts';

	// Anything typed into the server-rendered form before the bundle arrived
	// survives hydration. See `keep-typed.ts` for the failure it prevents.
	keepTyped(signIn.fields.email, signIn.fields.password);

	/*
	 * Where to go afterwards rides in a hidden field. The server sanitises it
	 * (see `auth.remote.ts`), so a crafted link cannot send somebody who has
	 * just typed a password to another site.
	 */
	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/trips');
</script>

<svelte:head>
	<title>{m.auth_sign_in()} — {m.app_name()}</title>
</svelte:head>

<!--
	A remote `form`: spread onto a real <form>, it submits with JavaScript
	off and progressively enhances with it on. `fields.x.as('email')` writes
	the name, the type and the current value; `issues()` are the validation
	messages for that field, from the schema or from `invalid()` on the server.
-->
<form class="card card--pad stack" {...signIn}>
	<h1>{m.auth_sign_in()}</h1>

	<input {...signIn.fields.redirectTo.as('hidden', redirectTo)} />

	<label class="field">
		<span class="label">{m.auth_email()}</span>
		<input class="input" {...signIn.fields.email.as('email')} autocomplete="email" required />
		{#each signIn.fields.email.issues() ?? [] as issue (issue.message)}
			<span class="issue">{issue.message}</span>
		{/each}
	</label>

	<label class="field">
		<span class="label">{m.auth_password()}</span>
		<input
			class="input"
			{...signIn.fields.password.as('password')}
			autocomplete="current-password"
			required
		/>
		{#each signIn.fields.password.issues() ?? [] as issue (issue.message)}
			<span class="issue">{issue.message}</span>
		{/each}
	</label>

	<button class="btn btn--primary" type="submit" disabled={signIn.pending > 0}>
		{m.auth_sign_in()}
	</button>

	<p class="muted">
		{m.auth_no_account()}
		<a href={localizeHref(`/signup?redirectTo=${encodeURIComponent(redirectTo)}`)}>
			{m.auth_sign_up()}
		</a>
	</p>
</form>
