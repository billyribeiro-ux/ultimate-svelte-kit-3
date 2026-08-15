<script lang="ts">
	import { page } from '$app/state';
	import { signIn } from './auth.remote.ts';

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/terminal');
</script>

<div class="container narrow">
	<h1>Sign in</h1>
	<p class="muted">For member firms and venue operators.</p>

	<form {...signIn} class="stack card">
		<!--
			Built by the form's own field accessor, not hand-written. SvelteKit has
			to own the name and value to construct the submitted data, so a field it
			did not create throws on submit.
		-->
		<input {...signIn.fields.redirectTo.as('hidden', redirectTo)} />

		{#if signIn.fields.allIssues()?.length}
			<p class="error" role="alert">{signIn.fields.allIssues()?.[0]?.message}</p>
		{/if}

		<label>
			Email
			<input {...signIn.fields.email.as('email')} autocomplete="username" required />
		</label>

		<label>
			Password
			<input {...signIn.fields.password.as('password')} autocomplete="current-password" required />
		</label>

		<button type="submit">Sign in</button>
	</form>
</div>

<style>
	.narrow { inline-size: min(100% - 2rem, 26rem); }
	h1 { margin-block-end: var(--space-2); }
	form { margin-block-start: var(--space-4); }
	label { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); }
	.error {
		color: var(--ask);
		font-size: var(--text-sm);
		border: 1px solid var(--ask);
		border-radius: var(--radius);
		padding: var(--space-2) var(--space-3);
	}
</style>
