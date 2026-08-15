<script lang="ts">
	import { page } from '$app/state';
	import { signInEntrance } from '#lib/motion/motion.ts';
	import { signIn } from './auth.remote.ts';

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/terminal');
</script>

<!--
	The one screen in the venue with a composed entrance.

	Everywhere else, motion is information and anything decorative is banned —
	a trader waiting for an animation is a trader who cannot act. But nobody
	signing in is mid-trade. They can afford a second, and a front door that
	feels considered is making a claim about the care taken behind it.

	It also works because it is the only one. The restraint everywhere else is
	what gives this its weight.
-->
<div class="container narrow" use:signInEntrance>
	<div class="card stack" data-motion="card">
		<header class="stack tight">
			<h1>Sequent</h1>
			<span class="rule" data-motion="rule" aria-hidden="true"></span>
			<p class="muted small">For member firms and venue operators.</p>
		</header>

		<form {...signIn} class="stack">
			<!--
				Built by the form's own field accessor, not hand-written. SvelteKit has
				to own the name and value to construct the submitted data, so a field it
				did not create throws on submit.
			-->
			<input {...signIn.fields.redirectTo.as('hidden', redirectTo)} />

			{#if signIn.fields.allIssues()?.length}
				<p class="error" role="alert">{signIn.fields.allIssues()?.[0]?.message}</p>
			{/if}

			<label data-motion="field">
				Email
				<input {...signIn.fields.email.as('email')} autocomplete="username" required />
			</label>

			<label data-motion="field">
				Password
				<input
					{...signIn.fields.password.as('password')}
					autocomplete="current-password"
					required
				/>
			</label>

			<button type="submit" data-motion="field">Sign in</button>
		</form>
	</div>
</div>

<style>
	/*
	 * Centred vertically, but with `min-block-size` rather than a fixed height.
	 * `dvh` and not `vh`: on a phone `100vh` is the height *without* the address
	 * bar, so a full-height layout is always a little too tall and the page
	 * scrolls by exactly the height of the browser chrome.
	 */
	.narrow {
		inline-size: min(100% - 2rem, 26rem);
		min-block-size: calc(100dvh - 8rem);
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.tight { gap: var(--space-2); }

	h1 { font-size: var(--text-xl); letter-spacing: 0.01em; }

	/* The line that draws itself. One element, one transform, no layout cost. */
	.rule {
		block-size: 2px;
		inline-size: 3rem;
		background: linear-gradient(90deg, var(--accent), transparent);
		border-radius: 2px;
	}

	form { margin-block-start: var(--space-2); }

	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
	}

	.error {
		color: var(--ask);
		font-size: var(--text-sm);
		border: 1px solid var(--ask);
		border-radius: var(--radius);
		padding: var(--space-2) var(--space-3);
	}
</style>
