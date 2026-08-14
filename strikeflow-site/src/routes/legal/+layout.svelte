<!--
	LEGAL LAYOUT

	A nested layout. It wraps only the routes under `/legal`, inheriting the root
	layout above it — so the header and footer come from there, and this adds the
	prose styling shared by all three documents.

	Nested layouts are one of SvelteKit's better ideas: shared structure lives in one
	place, and it's obvious from the directory tree which pages it applies to.
-->

<script lang="ts">
	let { children } = $props();
</script>

<div class="legal">
	<div class="container container--narrow">
		{@render children()}
	</div>
</div>

<style>
	.legal {
		padding-block: calc(var(--header-height) + var(--space-10)) var(--section-y);
	}

	/*
	 * `:global` inside a scoped block.
	 *
	 * Svelte scopes styles by adding a hash class to elements it can see in THIS
	 * component's markup. The headings and paragraphs here come from the child page,
	 * so they never get that class and a normal selector would not reach them.
	 *
	 * `.legal :global(h2)` reads as: scope the `.legal` part, but let the `h2` part
	 * match anything inside. That's the correct escape hatch for styling slotted or
	 * child-rendered content — much better than reaching for `!important` or making
	 * the whole stylesheet global.
	 */
	.legal :global(h1) {
		font-size: var(--fs-3xl);
		margin-block-end: var(--space-4);
	}

	.legal :global(.legal-updated) {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		padding-block-end: var(--space-6);
		border-bottom: 1px solid var(--border);
		margin-block-end: var(--space-8);
	}

	.legal :global(h2) {
		font-size: var(--fs-xl);
		margin-block: var(--space-10) var(--space-4);
		scroll-margin-top: calc(var(--header-height) + var(--space-6));
	}

	.legal :global(h3) {
		font-size: var(--fs-lg);
		margin-block: var(--space-6) var(--space-3);
	}

	.legal :global(p) {
		margin-block-end: var(--space-4);
		line-height: var(--lh-relaxed);
	}

	.legal :global(ul),
	.legal :global(ol) {
		margin-block-end: var(--space-5);
		padding-inline-start: var(--space-6);
	}

	.legal :global(li) {
		margin-block-end: var(--space-2);
	}

	.legal :global(.legal-callout) {
		padding: var(--space-5);
		margin-block: var(--space-6);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background-color: var(--surface);
	}

	.legal :global(.legal-callout p:last-child) {
		margin-block-end: 0;
	}

	.legal :global(.legal-note) {
		margin-block-start: var(--space-10);
		padding-block-start: var(--space-6);
		border-top: 1px solid var(--border);
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
</style>
