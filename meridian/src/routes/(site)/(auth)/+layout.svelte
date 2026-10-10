<script lang="ts">
	import { CompassRoseIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';

	let { children } = $props();
</script>

<!--
	Both sign-in and sign-up sit here: the brand mark above, the form below.
	On a phone the form sits straight on the paper — a card inside a page
	inside a screen was a form in a box in a box — and from 40em it becomes
	one card with room around it. The pages own the form and its words.
-->
<div class="auth container">
	<div class="auth__panel">
		<p class="auth__brand">
			<CompassRoseIcon size={28} weight="duotone" aria-hidden="true" />
			<span class="visually-hidden">{m.app_name()}</span>
		</p>
		{@render children()}
	</div>
</div>

<style>
	.auth {
		display: grid;
		place-items: start center;
		padding-block: var(--section);
		max-width: 26rem;
	}

	.auth__panel {
		width: 100%;
		display: grid;
		gap: var(--space-5);
	}

	.auth__brand {
		display: flex;
		justify-content: center;
		color: var(--sea);
	}

	/* The page's h1 and lede are centred under the mark; the form below them is not. */
	.auth__panel :global(h1),
	.auth__panel :global(.auth__lede) {
		text-align: center;
		max-inline-size: none;
	}

	.auth__panel :global(.auth__lede) {
		color: var(--ink-2);
		margin-block-start: calc(-1 * var(--space-2));
	}

	/* The primary button on these two pages is the tallest in the product: 48px, full width. */
	.auth__panel :global(.btn--primary) {
		min-height: 3rem;
		font-size: var(--text-md);
	}

	.auth__panel :global(.auth__foot) {
		text-align: center;
	}

	@media (min-width: 40em) {
		.auth__panel {
			padding: var(--space-6);
			border: 1px solid var(--line);
			border-radius: var(--radius-xl);
			background: var(--paper-2);
			box-shadow: var(--shadow-2);
		}
	}
</style>
