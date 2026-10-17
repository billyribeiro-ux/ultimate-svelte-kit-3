<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';

	let { message, tone = 'info' }: { message: string; tone?: 'info' | 'error' } = $props();

	// Svelte transitions run on the Web Animations API, which the stylesheet's
	// reduced-motion rule cannot reach; this one asks for itself.
	const duration = $derived(prefersReducedMotion.current ? 0 : 240);
</script>

<!--
	`role="status"` is announced by a screen reader without stealing focus,
	which is what a toast is: news, not a question.
-->
<div class={['toast', `toast--${tone}`]} role="status" transition:fly={{ y: 24, duration }}>
	{message}
</div>

<style>
	.toast {
		position: fixed;
		inset-inline: var(--space-4);
		bottom: calc(var(--space-4) + var(--safe-bottom));
		z-index: var(--z-toast);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--surface-raised);
		box-shadow: var(--shadow-lg);
		font-size: var(--fs-sm);
	}

	.toast--error {
		border-color: var(--danger);
	}

	@media (min-width: 40rem) {
		.toast {
			inset-inline: auto;
			right: var(--space-5);
			max-width: 24rem;
		}
	}
</style>
