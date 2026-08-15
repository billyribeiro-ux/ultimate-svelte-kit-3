<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * One button, two elements.
	 *
	 * If `href` is present it renders an `<a>`; otherwise a `<button>`. That is
	 * not a convenience — it is the difference between a control a keyboard user
	 * can middle-click, open in a new tab and copy the address of, and one they
	 * cannot. A `<button>` that navigates and an `<a>` that submits are both
	 * wrong, and both are extremely common.
	 *
	 * The props type is a union so the compiler enforces it: pass `href` and you
	 * get anchor attributes, omit it and you get button attributes including
	 * `type` and `disabled`.
	 */

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'sm' | 'md' | 'lg';

	type Common = {
		variant?: Variant;
		size?: Size;
		/** Stretch to the width of the container. The default on small screens. */
		full?: boolean;
		/** Show a spinner and stop accepting input. */
		loading?: boolean;
		children: Snippet;
		/** Rendered before the label — an icon, usually. */
		icon?: Snippet;
	};

	type Props =
		| (Common & { href: string } & Omit<HTMLAnchorAttributes, 'children'>)
		| (Common & { href?: undefined } & Omit<HTMLButtonAttributes, 'children'>);

	let {
		variant = 'primary',
		size = 'md',
		full = false,
		loading = false,
		children,
		icon,
		...rest
	}: Props = $props();

	// Narrow the union at runtime the same way the type does.
	const isLink = $derived('href' in rest && rest.href !== undefined);
</script>

{#snippet body()}
	{#if loading}
		<!--
			`aria-hidden` on the spinner, and the state announced in text instead.
			A screen reader describing a rotating circle helps nobody.
		-->
		<span class="spinner" aria-hidden="true"></span>
		<span class="visually-hidden">Working…</span>
	{:else if icon}
		<span class="icon" aria-hidden="true">{@render icon()}</span>
	{/if}
	<span class="label">{@render children()}</span>
{/snippet}

{#if isLink}
	<a class="btn {variant} {size}" class:full class:loading {...rest as HTMLAnchorAttributes}>
		{@render body()}
	</a>
{:else}
	<button
		class="btn {variant} {size}"
		class:full
		class:loading
		{...rest as HTMLButtonAttributes}
		disabled={loading || (rest as HTMLButtonAttributes).disabled}
	>
		{@render body()}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);

		font-family: var(--font-body);
		font-weight: var(--weight-medium);
		line-height: 1;
		text-decoration: none;
		white-space: nowrap;

		border: var(--border) solid transparent;
		border-radius: var(--radius-md);
		cursor: pointer;

		/*
		 * A 44px minimum on every interactive control. That is the smallest target
		 * most people can hit reliably with a thumb, and it is not negotiable on a
		 * page whose entire purpose is tapping a time while standing on a bus.
		 */
		min-height: 2.75rem;

		transition:
			background-color var(--dur-fast) var(--ease-standard),
			border-color var(--dur-fast) var(--ease-standard),
			color var(--dur-fast) var(--ease-standard),
			box-shadow var(--dur-fast) var(--ease-standard),
			transform var(--dur-instant) var(--ease-standard);
	}

	.btn:active:not(:disabled) {
		/* Small enough to feel like a press, not like the button shrank. */
		transform: scale(0.985);
	}

	.btn:disabled,
	.btn.loading {
		cursor: not-allowed;
		opacity: 0.6;
	}

	/* ------------------------------------------------------------- sizes */

	.sm {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
		min-height: 2.25rem;
	}
	.md {
		padding: var(--space-3) var(--space-5);
		font-size: var(--text-base);
	}
	.lg {
		padding: var(--space-4) var(--space-6);
		font-size: var(--text-md);
		min-height: 3.25rem;
	}

	.full {
		width: 100%;
	}

	/* ---------------------------------------------------------- variants */

	.primary {
		background: var(--accent);
		color: var(--on-accent);
		box-shadow: var(--shadow-sm);
	}
	.primary:hover:not(:disabled) {
		background: var(--accent-strong);
		box-shadow: var(--shadow-md);
	}

	.secondary {
		background: var(--surface);
		color: var(--ink);
		border-color: var(--line-strong);
	}
	.secondary:hover:not(:disabled) {
		border-color: var(--ink-faint);
		background: var(--surface-sunken);
	}

	.ghost {
		background: transparent;
		color: var(--ink-muted);
	}
	.ghost:hover:not(:disabled) {
		background: var(--surface-sunken);
		color: var(--ink);
	}

	.danger {
		background: var(--danger);
		color: var(--on-accent);
	}
	.danger:hover:not(:disabled) {
		filter: brightness(0.92);
	}

	/* --------------------------------------------------------- internals */

	.icon {
		display: inline-flex;
		font-size: 1.15em;
	}

	.spinner {
		width: 1em;
		height: 1em;
		border: 2px solid currentcolor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/*
	 * With reduced motion the spinner would freeze mid-rotation and read as a
	 * broken circle, so it becomes a pulse instead — still clearly "busy", with
	 * no rotation.
	 */
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: pulse 1.4s ease-in-out infinite;
			border-top-color: currentcolor;
			opacity: 0.5;
		}
		@keyframes pulse {
			50% {
				opacity: 1;
			}
		}
	}
</style>
