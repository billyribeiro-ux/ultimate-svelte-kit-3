<!--
	FAQ ACCORDION

	Built on native <details>/<summary>. No JavaScript, no ARIA, no state.

	This is worth defending, because "build an accordion" is a classic interview
	question and the hand-rolled answer is always worse. <details> gives you, for free
	and correctly:

	  - keyboard operation (Enter and Space)
	  - the correct `button` role and expanded/collapsed state announced
	  - working before hydration, and working if JavaScript fails entirely
	  - Ctrl+F "find in page" auto-expanding a closed section to reveal a match

	That last one is the killer. A div-based accordion hides its content from browser
	search, so a user searching your FAQ finds nothing. Users don't report that as a
	bug — they just leave.

	`name` on the group makes it exclusive (opening one closes the others), which
	used to require JavaScript and is now a one-word HTML attribute.
-->

<script lang="ts">
	import { CaretDownIcon } from 'phosphor-svelte';
	import type { FaqItem } from '#lib/data/faq.ts';

	interface Props {
		items: readonly FaqItem[];
		/**
		 * Shared name for exclusive accordion behaviour. Pass a unique string if two
		 * accordions ever appear on one page, or they'll close each other.
		 */
		group?: string;
	}

	let { items, group = 'faq' }: Props = $props();
</script>

<div class="faq">
	{#each items as item (item.id)}
		<details class="faq__item" name={group} id={item.id}>
			<summary class="faq__summary">
				<span class="faq__question">{item.question}</span>
				<span class="faq__marker" aria-hidden="true">
					<CaretDownIcon size={18} weight="bold" />
				</span>
			</summary>
			<div class="faq__answer">
				<p>{item.answer}</p>
			</div>
		</details>
	{/each}
</div>

<style>
	.faq {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.faq__item {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background-color: var(--surface);
		overflow: hidden;
	}

	.faq__item[open] {
		border-color: var(--border-strong);
	}

	.faq__summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-5);
		cursor: pointer;
		min-height: 3.25rem;
		/* Removes the default disclosure triangle. `list-style` handles Firefox;
		   the ::-webkit-details-marker rule below handles older Safari. */
		list-style: none;
		font-family: var(--font-heading);
		font-weight: var(--weight-semibold);
		color: var(--text-primary);
	}

	.faq__summary::-webkit-details-marker {
		display: none;
	}

	@media (hover: hover) {
		.faq__summary:hover {
			background-color: var(--surface-raised);
		}
	}

	.faq__question {
		font-size: var(--fs-base);
	}

	.faq__marker {
		display: inline-flex;
		flex-shrink: 0;
		color: var(--text-muted);
		transition: transform var(--dur-base) var(--ease-out);
	}

	.faq__item[open] .faq__marker {
		transform: rotate(180deg);
		color: var(--brand-400);
	}

	.faq__answer {
		padding: 0 var(--space-5) var(--space-5);
	}

	.faq__answer p {
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		max-width: 72ch;
	}
</style>
