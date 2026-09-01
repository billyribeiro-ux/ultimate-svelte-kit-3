<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The one button.
	 *
	 * `<svelte:element>` rather than two components or an `{#if}` around two
	 * near-identical blocks: a button that navigates must be an `<a>`, and one
	 * that acts must be a `<button>`, and everything else about them is the same.
	 */
	interface Props {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md';
		href?: string;
		type?: 'button' | 'submit';
		disabled?: boolean;
		/** Required when the button's content is an icon with no text. */
		label?: string;
		pressed?: boolean;
		title?: string;
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
		icon?: Snippet;
	}

	let {
		variant = 'secondary',
		size = 'md',
		href,
		type = 'button',
		disabled = false,
		label,
		pressed,
		title,
		onclick,
		children,
		icon
	}: Props = $props();

	const tag = $derived(href ? 'a' : 'button');
</script>

<svelte:element
	this={tag}
	class="btn btn--{variant} btn--{size}"
	class:btn--icon={!children}
	class:btn--pressed={pressed}
	href={disabled ? undefined : href}
	type={href ? undefined : type}
	disabled={href ? undefined : disabled}
	aria-label={label}
	aria-pressed={pressed}
	{title}
	role={href ? undefined : 'button'}
	aria-disabled={href && disabled ? 'true' : undefined}
	tabindex={href && disabled ? -1 : undefined}
	{onclick}
>
	{#if icon}
		<span class="btn__icon">{@render icon()}</span>
	{/if}
	{#if children}{@render children()}{/if}
</svelte:element>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		font-weight: var(--weight-medium);
		text-decoration: none;
		white-space: nowrap;
		/*
			Forty-four pixels, on every button, including the small ones.

			It is the smallest target most people can hit reliably on a phone without
			looking. The visual size is controlled by padding and font size; the
			touch size is not negotiable, which is why this is a min-height rather
			than a height.
		*/
		min-height: 44px;
		padding-inline: var(--space-4);
		/* Stops a double-tap being interpreted as a zoom on iOS, which otherwise
		   swallows the second tap of a quick double-press. */
		touch-action: manipulation;
		transition:
			background-color var(--fast) var(--ease-out),
			border-color var(--fast) var(--ease-out),
			color var(--fast) var(--ease-out);
	}

	.btn--sm {
		min-height: 32px;
		padding-inline: var(--space-3);
		font-size: var(--fs-sm);
	}

	.btn--icon {
		padding-inline: 0;
		width: 44px;
	}

	.btn--sm.btn--icon {
		width: 32px;
	}

	.btn--primary {
		background: var(--accent);
		color: var(--accent-text);
	}

	.btn--primary:hover:not(:disabled) {
		background: var(--accent-strong);
	}

	.btn--secondary {
		background: var(--surface-raised);
		border-color: var(--border);
		color: var(--text);
	}

	.btn--secondary:hover:not(:disabled) {
		background: var(--surface-hover);
		border-color: var(--border-strong);
	}

	.btn--ghost {
		color: var(--text-muted);
	}

	.btn--ghost:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text);
	}

	.btn--danger {
		background: transparent;
		border-color: var(--border);
		color: var(--danger);
	}

	.btn--danger:hover:not(:disabled) {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
	}

	.btn--pressed {
		background: var(--accent-wash);
		color: var(--accent);
	}

	.btn:disabled,
	.btn[aria-disabled='true'] {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn__icon {
		display: inline-flex;
		/*
			NOTE: no `transform` here, and none on `:hover` anywhere in this file.

			Exactly one system owns `transform` on interactive elements, and it is the
			motion layer. Two owners means the hover state fights whatever the
			animation is doing, and the element jitters at the moment somebody is
			trying to click it.
		*/
	}
</style>
