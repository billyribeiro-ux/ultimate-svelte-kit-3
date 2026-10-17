<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { MapPinIcon } from 'phosphor-svelte';

	/**
	 * NOTHING HERE YET
	 * ================
	 *
	 * One empty state for the whole product: an icon drawn thin, a title in
	 * the display face, a sentence, and — when there is one obvious thing to
	 * do — the button that does it. The dashed border is the only dashed
	 * border in the app, and it means exactly this: a place where something
	 * will go.
	 */
	interface Props {
		/** A Phosphor icon component; typed the way `kinds.ts` types them. */
		icon: typeof MapPinIcon;
		title: string;
		body?: string;
		/** The one action, if any: a button or a link rendered by the caller. */
		action?: Snippet;
	}

	let { icon: Icon, title, body, action }: Props = $props();
</script>

<div class="empty card">
	<Icon size={40} weight="thin" aria-hidden="true" />
	<!-- A paragraph, not a heading: "No expenses yet." must not be a second heading called Expenses. -->
	<p class="empty__title">{title}</p>
	{#if body}
		<p class="empty__body">{body}</p>
	{/if}
	{#if action}
		<div class="empty__action">{@render action()}</div>
	{/if}
</div>

<style>
	/*
	 * Left-aligned in the page, like the heading above it, and centred
	 * inside: a card floating in the middle of a left-aligned page read as
	 * a dialog that had lost its way.
	 */
	.empty {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		max-width: 28rem;
		margin-inline: 0;
		padding: var(--space-7) var(--space-5);
		text-align: center;
		border-style: dashed;
		border-color: var(--line-2);
		box-shadow: none;
		color: var(--ink-3);
	}

	.empty__title {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 500;
		line-height: var(--leading-snug);
		color: var(--ink);
	}

	.empty__body {
		color: var(--ink-2);
		font-size: var(--text-sm);
		max-inline-size: 34ch;
	}

	.empty__action {
		margin-block-start: var(--space-2);
	}
</style>
