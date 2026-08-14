<!--
	BUTTON
	======

	One component that renders either a real <button> or a real <a>, depending on
	whether you gave it an `href`.

	This matters more than it looks. A <div onclick> is not focusable, not keyboard
	operable, not announced as interactive, and not openable in a new tab. Those aren't
	edge cases — they're how a meaningful share of people use the web. The rule is
	simple and worth memorising:

	  Navigates somewhere?  →  <a href>
	  Performs an action?   →  <button>

	We use <svelte:element> to pick between them at runtime, which keeps this one
	component instead of two nearly-identical ones.
-->

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { magnetic } from '#lib/motion/index.ts';

	type Variant = 'primary' | 'secondary' | 'ghost';
	type Size = 'sm' | 'md' | 'lg';

	interface Props {
		variant?: Variant;
		size?: Size;
		/** Provide this and you get an <a>. Omit it and you get a <button>. */
		href?: string;
		/** Opens in a new tab with the correct rel attributes. */
		external?: boolean;
		/** Stretches to fill its container — the right default on narrow screens. */
		fullWidth?: boolean;
		disabled?: boolean;
		/** Only meaningful for <button>. */
		type?: 'button' | 'submit' | 'reset';
		/** Optional label for screen readers when the visible text isn't enough. */
		ariaLabel?: string;
		onclick?: (event: MouseEvent) => void;
		children: Snippet;
		/** Optional leading icon, rendered before the label. */
		icon?: Snippet;
		/** Optional trailing icon, rendered after the label. */
		iconTrailing?: Snippet;
		/**
		 * Lean slightly toward the cursor on approach.
		 *
		 * Reserve this for primary calls to action. If every button on the page is
		 * magnetic the effect stops reading as premium and starts reading as unstable.
		 * It is automatically inert on touch devices and under reduced motion.
		 */
		pull?: boolean;
	}

	let {
		variant = 'primary',
		size = 'md',
		href,
		external = false,
		fullWidth = false,
		disabled = false,
		type = 'button',
		ariaLabel,
		onclick,
		children,
		icon,
		iconTrailing,
		pull = false
	}: Props = $props();

	const tag = $derived(href ? 'a' : 'button');
</script>

<svelte:element
	this={tag}
	class="btn btn--{variant} btn--{size}"
	class:btn--full={fullWidth}
	class:btn--disabled={disabled}
	{href}
	{onclick}
	aria-label={ariaLabel}
	role={href ? undefined : 'button'}
	target={external ? '_blank' : undefined}
	rel={external ? 'noopener noreferrer' : undefined}
	type={href ? undefined : type}
	disabled={href ? undefined : disabled}
	aria-disabled={href && disabled ? 'true' : undefined}
	tabindex={href && disabled ? -1 : undefined}
	{@attach pull && !disabled ? magnetic() : undefined}
>
	{#if icon}
		<span class="btn__icon" aria-hidden="true">{@render icon()}</span>
	{/if}
	<span class="btn__label">{@render children()}</span>
	{#if iconTrailing}
		<span class="btn__icon" aria-hidden="true">{@render iconTrailing()}</span>
	{/if}
</svelte:element>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);

		font-family: var(--font-heading);
		font-weight: var(--weight-semibold);
		line-height: 1;
		white-space: nowrap;
		text-decoration: none;
		text-align: center;

		border: 1px solid transparent;
		border-radius: var(--radius-md);
		cursor: pointer;

		/*
		 * 44px is the minimum touch target recommended by both Apple's and Google's
		 * guidelines, and it's WCAG 2.2 Success Criterion 2.5.8. Smaller buttons get
		 * mis-tapped, and on a marketing site a mis-tapped CTA is a lost conversion.
		 */
		min-height: 2.75rem;

		/* Stop a double-tap from zooming on iOS, and kill the 300ms tap delay. */
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;

		transition:
			background-color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out),
			transform var(--dur-fast) var(--ease-out);
	}

	/* Sizes -------------------------------------------------------- */
	.btn--sm {
		font-size: var(--fs-sm);
		padding: 0.5rem 0.875rem;
		min-height: 2.25rem;
	}

	.btn--md {
		font-size: var(--fs-base);
		padding: 0.75rem 1.25rem;
	}

	.btn--lg {
		font-size: var(--fs-md);
		padding: 0.9375rem 1.75rem;
		min-height: 3.25rem;
	}

	/* Variants ----------------------------------------------------- */
	.btn--primary {
		background-color: var(--accent);
		color: var(--accent-contrast);
		box-shadow: var(--shadow-sm);
	}

	.btn--secondary {
		background-color: var(--surface-raised);
		border-color: var(--border);
		color: var(--text-primary);
	}

	.btn--ghost {
		background-color: transparent;
		color: var(--text-secondary);
	}

	/*
	 * Hover styles live behind `@media (hover: hover)`.
	 *
	 * On a touchscreen there is no hover — but browsers fake one on tap, and it
	 * *sticks* until you tap elsewhere. So a phone user taps a button and it stays
	 * lit up afterwards, looking broken. This query means hover styles only apply
	 * to devices with a real pointer.
	 */
	@media (hover: hover) {
		/*
		 * NOTE: no `transform` here. The magnetic attachment owns this element's
		 * transform, and a CSS hover transform would be overwritten by GSAP's inline
		 * style mid-hover — producing a visible fight between the two. Where two
		 * systems can write the same property, exactly one of them must own it.
		 */
		.btn--primary:hover:not(.btn--disabled) {
			background-color: var(--accent-hover);
			box-shadow: var(--shadow-md);
		}

		.btn--secondary:hover:not(.btn--disabled) {
			background-color: var(--surface-overlay);
			border-color: var(--border-strong);
		}

		.btn--ghost:hover:not(.btn--disabled) {
			background-color: var(--surface-raised);
			color: var(--text-primary);
		}
	}

	/* Pressed state — applies on touch too, which is what you want. */
	.btn:active:not(.btn--disabled) {
		transform: translateY(0) scale(0.985);
	}

	.btn--full {
		width: 100%;
	}

	.btn--disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.btn__icon {
		display: inline-flex;
		flex-shrink: 0;
		/* Icons ship at 1em, so this reads as "slightly larger than the text". */
		font-size: 1.15em;
	}

	.btn__label {
		/* Lets a long label wrap on a very narrow phone rather than overflow. */
		white-space: normal;
	}
</style>
