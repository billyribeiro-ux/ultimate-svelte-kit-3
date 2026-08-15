<script lang="ts">
	import { page } from '$app/state';
	import Alert from '#lib/components/Alert.svelte';
	import Button from '#lib/components/Button.svelte';
	import Field from '#lib/components/Field.svelte';
	import { reveal } from '#lib/motion/index.ts';
	import { signIn } from './auth.remote.ts';

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/manage');
</script>

<svelte:head>
	<title>Sign in — Halfpast</title>
	<!-- Nothing here should ever be indexed. -->
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container-narrow wrap" {@attach reveal({ y: 14 })}>
	<h1>Sign in</h1>
	<p class="text-muted">For studio owners and staff. Customers do not need an account.</p>

	<form {...signIn} class="stack">
		<!--
			Built by the form's own field accessor, not hand-written. SvelteKit has to
			own the name and value to construct the submitted data, so anything it did
			not create throws "Form contained a field that wasn't created with
			form.fields.as(...)" the moment the form is submitted.
		-->
		<input {...signIn.fields.redirectTo.as('hidden', redirectTo)} />

		{#if signIn.fields.allIssues()?.length}
			<Alert tone="error" title="We could not sign you in">
				<p>{signIn.fields.allIssues()?.[0]?.message}</p>
			</Alert>
		{/if}

		<Field label="Email" required error={signIn.fields.email.issues()?.[0]?.message}>
			{#snippet children({ id, describedBy, invalid })}
				<input
					{...signIn.fields.email.as('email')}
					{id}
					aria-describedby={describedBy}
					aria-invalid={invalid}
					autocomplete="username"
				/>
			{/snippet}
		</Field>

		<Field label="Password" required error={signIn.fields.password.issues()?.[0]?.message}>
			{#snippet children({ id, describedBy, invalid })}
				<input
					{...signIn.fields.password.as('password')}
					{id}
					aria-describedby={describedBy}
					aria-invalid={invalid}
					autocomplete="current-password"
				/>
			{/snippet}
		</Field>

		<Button type="submit" full size="lg" loading={signIn.pending > 0}>Sign in</Button>
	</form>

	<!--
		The seeded password used to be printed here, and `{#if dev}` was the first
		attempt at making that safe. It is not enough, and the reason is worth
		knowing: Svelte hoists a component's markup into module-level template
		strings, so the literal `halfpast-demo-2026` stayed in the production
		bundle even though the branch never rendered. Hidden is not removed —
		`grep` on `.svelte-kit/output/client` found it in two files.

		So the credentials live in one place: the output of `pnpm run db:seed`.
		Anybody who can run the seed can read them, and no deployed copy of this
		page carries a working owner password.
	-->
	<div class="demo">
		<p class="eyebrow">Demo studio</p>
		<p>
			Run <code>pnpm run db:seed</code> — it prints the seeded sign-in details, a booking page link, and
			a customer's manage link.
		</p>
	</div>
</div>

<style>
	.wrap {
		padding-block: var(--space-8);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	h1 {
		font-size: var(--text-xl);
	}

	.demo {
		padding: var(--space-4);
		background: var(--surface-sunken);
		border: var(--border) solid var(--line);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}

	.demo p {
		max-width: none;
		line-height: var(--leading-relaxed);
	}

	.eyebrow {
		margin-block-end: var(--space-2);
	}
</style>
