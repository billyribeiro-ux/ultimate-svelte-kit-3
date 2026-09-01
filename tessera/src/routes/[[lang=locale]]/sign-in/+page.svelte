<script lang="ts">
	import { messages } from '#lib/i18n/index.ts';
	import { signIn, signUp } from '#lib/remote/auth.remote.ts';
	import Button from '#lib/components/Button.svelte';
	import type { PageData } from './$types';
	import { page } from '$app/state';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const t = $derived(messages(data.locale));

	let mode = $state<'in' | 'up'>('in');
	const from = $derived(page.url.searchParams.get('from') ?? '/boards');
</script>

<svelte:head>
	<title>{t.nav.signIn} — {t.app.name}</title>
</svelte:head>

<div class="auth container">
	<h1>{mode === 'in' ? t.nav.signIn : 'Create an account'}</h1>

	{#if mode === 'in'}
		<form {...signIn} class="auth__form stack">
			<!--
				`fields.x.as('type')` rather than a hand-written `name` and `type`.

				It supplies the name, the input type and `aria-invalid`, all derived from
				the same schema the server validates against — so a field renamed in
				`auth.remote.ts` becomes a build error here rather than a form that posts
				a key nothing reads.
			-->
			<input {...signIn.fields.from.as('hidden', from)} />

			<label class="auth__field">
				<span>Email</span>
				<input {...signIn.fields.email.as('email')} autocomplete="email" required />
			</label>

			<label class="auth__field">
				<span>Password</span>
				<input
					{...signIn.fields.password.as('password')}
					autocomplete="current-password"
					required
				/>
			</label>

			<!--
				One error region, not one per field.

				`fields.issues()` at the root collects the problems from every field, and a
				single `role="alert"` gives a screen reader one place to look. Six separate
				alerts fire six announcements for one failed submission.
			-->
			{#if signIn.fields.issues()?.length}
				<p class="auth__error" role="alert">{signIn.fields.issues()?.[0]?.message}</p>
			{/if}

			<Button variant="primary" type="submit">{t.nav.signIn}</Button>
		</form>

		<p class="auth__switch">
			<button type="button" onclick={() => (mode = 'up')}>Create an account instead</button>
		</p>
	{:else}
		<form {...signUp} class="auth__form stack">
			<label class="auth__field">
				<span>Name</span>
				<input {...signUp.fields.name.as('text')} autocomplete="name" required />
			</label>

			<label class="auth__field">
				<span>Email</span>
				<input {...signUp.fields.email.as('email')} autocomplete="email" required />
			</label>

			<label class="auth__field">
				<span>Password</span>
				<input
					{...signUp.fields.password.as('password')}
					autocomplete="new-password"
					minlength="12"
					required
				/>
				<small>At least 12 characters.</small>
			</label>

			{#if signUp.fields.issues()?.length}
				<p class="auth__error" role="alert">{signUp.fields.issues()?.[0]?.message}</p>
			{/if}

			<Button variant="primary" type="submit">Create account</Button>
		</form>

		<p class="auth__switch">
			<button type="button" onclick={() => (mode = 'in')}>I already have an account</button>
		</p>
	{/if}
</div>

<style>
	.auth {
		max-width: 24rem;
		padding-block: var(--space-8);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.auth__form {
		--stack-gap: var(--space-4);
	}

	.auth__field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--fs-sm);
	}

	.auth__field input {
		min-height: 44px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
	}

	.auth__field small {
		color: var(--text-faint);
		font-size: var(--fs-xs);
	}

	.auth__error {
		color: var(--danger);
		font-size: var(--fs-sm);
	}

	.auth__switch button {
		color: var(--accent);
		font-size: var(--fs-sm);
		text-decoration: underline;
		text-underline-offset: 0.15em;
		min-height: 44px;
	}
</style>
