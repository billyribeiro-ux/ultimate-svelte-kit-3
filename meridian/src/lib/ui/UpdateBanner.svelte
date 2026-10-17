<script lang="ts">
	import { ArrowsClockwiseIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<!--
	Shown when `updated.current` is true: a new build has been deployed since
	this page loaded. The link is a plain reload; there is nothing to save
	that the server does not already have.

	It sits at the top on a phone — under the header, where the toasts also
	go (the root layout moves them down by this height) — and never at the
	bottom, where the stop sheet opens. It arrives once, rising 16px, and has
	no exit: pressing the button reloads the page.
-->
<div class="update" role="status">
	<ArrowsClockwiseIcon size={18} aria-hidden="true" />
	<span class="update__text">{m.update_available()}</span>
	<button class="btn btn--sm update__button" type="button" onclick={() => location.reload()}>
		{m.update_reload()}
	</button>
</div>

<style>
	.update {
		position: fixed;
		inset-inline: var(--gutter);
		top: calc(var(--header-h) + var(--space-2));
		z-index: var(--z-banner);
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		background: var(--ink);
		color: var(--paper);
		box-shadow: var(--shadow-3);
		font-size: var(--text-sm);
		animation: arrive var(--dur-4) var(--ease-out) both;
	}

	.update__text {
		flex: 1 1 auto;
	}

	/* Inverted: paper on ink, so the one button on the banner reads as the banner's own. */
	.update__button {
		background: var(--paper);
		border-color: var(--paper);
		color: var(--ink);
	}

	@keyframes arrive {
		from {
			opacity: 0;
			translate: 0 16px;
		}
	}

	@media (min-width: 48em) {
		.update {
			inset-inline: auto;
			top: auto;
			right: var(--space-5);
			bottom: var(--space-5);
			max-width: 26rem;
		}
	}
</style>
