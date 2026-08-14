<!--
	CARD — a bordered surface.

	Deliberately dumb. It draws a box and nothing else: no padding opinions beyond a
	sensible default, no internal layout, no title slot. Components that try to own
	their children's structure end up with fifteen boolean props and a `variant` called
	"other".
-->

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Adds a subtle accent border and glow — for the featured pricing plan. */
		highlighted?: boolean;
		/** Lifts slightly on hover. Only use it if the whole card is a link. */
		interactive?: boolean;
		/** Which HTML element to render. Use `article` or `li` where the semantics fit. */
		as?: 'div' | 'article' | 'li' | 'section';
		children: Snippet;
	}

	let { highlighted = false, interactive = false, as = 'div', children }: Props = $props();
</script>

<svelte:element
	this={as}
	class="card"
	class:card--highlighted={highlighted}
	class:card--interactive={interactive}
>
	{@render children()}
</svelte:element>

<style>
	.card {
		display: flex;
		flex-direction: column;
		background-color: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
		transition:
			border-color var(--dur-base) var(--ease-out),
			transform var(--dur-base) var(--ease-out),
			box-shadow var(--dur-base) var(--ease-out);
	}

	@media (min-width: 48em) {
		.card {
			padding: var(--space-8);
		}
	}

	.card--highlighted {
		border-color: var(--border-brand);
		background-color: var(--surface-raised);
		box-shadow: var(--shadow-glow);
	}

	@media (hover: hover) {
		.card--interactive:hover {
			border-color: var(--border-strong);
			transform: translateY(-2px);
			box-shadow: var(--shadow-md);
		}
	}

	/*
	 * `:focus-within` catches keyboard users. If a link inside the card receives
	 * focus, the whole card reacts — so a keyboard user gets the same visual
	 * feedback a mouse user gets from hover.
	 */
	.card--interactive:focus-within {
		border-color: var(--border-brand);
	}
</style>
