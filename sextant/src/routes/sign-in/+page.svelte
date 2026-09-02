<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types.js';

	let { form }: PageProps = $props();

	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign in · Sextant</title>
	<!-- Nothing here should ever appear in a search result. -->
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="wrap">
	<form
		method="POST"
		action="?/signIn"
		class="card"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				// `reset: false` keeps what was typed when the submission failed. The
				// default clears the form, which on a failed sign-in means retyping an
				// email address that was correct.
				await update({ reset: false });
				submitting = false;
			};
		}}
	>
		<h1>Sextant</h1>
		<p class="lede">Sign in to your workspace.</p>

		{#if form?.message}
			<!--
				`role="alert"` so it is announced when it appears.

				A message that is only visible is a message a screen reader user finds by
				accident, after wondering why nothing happened.
			-->
			<p class="error" role="alert">{form.message}</p>
		{/if}

		<div class="field">
			<label for="email">Email</label>
			<input
				id="email"
				name="email"
				type="email"
				class="input"
				required
				autocomplete="username"
				value={form?.email ?? ''}
				aria-invalid={form?.message ? 'true' : undefined}
			/>
		</div>

		<div class="field">
			<label for="password">Password</label>
			<input
				id="password"
				name="password"
				type="password"
				class="input"
				required
				autocomplete="current-password"
			/>
		</div>

		<button type="submit" class="btn btn--primary" disabled={submitting}>
			{submitting ? 'Signing in…' : 'Sign in'}
		</button>
	</form>
</div>

<style>
	.wrap {
		flex: 1;
		display: grid;
		place-items: center;
		padding: var(--space-4);
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		width: 100%;
		max-width: 22rem;
		padding: var(--space-5);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-xl);
	}

	.lede {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.error {
		margin: 0;
		padding: var(--space-2);
		border-left: 2px solid var(--danger);
		background: var(--danger-bg);
		font-size: var(--fs-sm);
	}
</style>
