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
		use:enhance={({ formElement }) => {
			submitting = true;
			return async ({ update }) => {
				/*
				 * `reset: false` keeps what was typed when the submission failed. The
				 * default clears the whole form, which on a failed sign-in means
				 * retyping an email address that was correct.
				 *
				 * `navigate` is deliberately left alone. SvelteKit 3.0.0-next.17 made
				 * `update` follow the browser and navigate to the page a submission
				 * lands on — on failure as well as success — which is a breaking change
				 * for any form whose action is on a different route. This one posts to
				 * `?/signIn`, the same page, so the destination is where we already
				 * are and nothing moves. `navigate: false` here would be a line that
				 * looks like it is preventing something and is not, which is worse than
				 * no line at all; `e2e/auth.e2e.ts` asserts the URL instead.
				 */
				await update({ reset: false });
				submitting = false;

				/*
				 * The password, and only the password, is cleared by hand.
				 *
				 * Without JavaScript the server re-renders the page and the field is
				 * empty because the action never returns it. With enhancement there is
				 * no re-render, so the typed value stays in the DOM — visible over a
				 * shoulder, and one autofill away from being submitted again after the
				 * person has already decided it was wrong.
				 *
				 * The two paths behaving differently is exactly the sort of thing that
				 * survives review and is caught by a test that checks the field.
				 */
				const password = formElement.querySelector<HTMLInputElement>('input[type="password"]');
				if (password) password.value = '';
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
