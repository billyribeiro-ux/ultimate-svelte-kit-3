<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import { MediaQuery } from 'svelte/reactivity';
	import { prefersReducedMotion } from 'svelte/motion';
	import { XIcon } from 'phosphor-svelte';
	import type { Attachment } from 'svelte/attachments';

	/**
	 * A PANEL THAT KNOWS WHAT SCREEN IT IS ON
	 * =======================================
	 *
	 * On a phone it is a bottom sheet that slides up; on a desktop it is a
	 * side panel that slides in from the right. Same content, same props, and
	 * the difference is one `MediaQuery` — a reactive wrapper around
	 * `matchMedia` — deciding which axis the `fly` transition uses.
	 *
	 * It is *not* modal. The grid stays usable behind it, because a sound
	 * panel you have to close before you can hear the change is a panel nobody
	 * leaves open.
	 */
	let {
		title,
		onclose,
		children
	}: {
		title: string;
		onclose: () => void;
		children: Snippet;
	} = $props();

	const desktop = new MediaQuery('min-width: 64rem');
	const duration = $derived(prefersReducedMotion.current ? 0 : 260);

	/** Move focus in when the sheet opens, and back to where it was when it closes. */
	const focusIn: Attachment<HTMLElement> = (node) => {
		const previous = document.activeElement as HTMLElement | null;
		node.querySelector<HTMLElement>('[data-close]')?.focus();
		return () => previous?.focus();
	};

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={keydown} />

<div
	class={['sheet', { 'sheet--side': desktop.current }]}
	role="dialog"
	aria-label={title}
	transition:fly={desktop.current ? { x: 320, duration } : { y: 320, duration }}
	{@attach focusIn}
>
	<header class="sheet__head">
		<h2 class="sheet__title">{title}</h2>
		<button
			type="button"
			class="btn btn--ghost btn--icon"
			aria-label="Close"
			data-close
			onclick={onclose}
		>
			<XIcon size={18} />
		</button>
	</header>
	<div class="sheet__body">
		{@render children()}
	</div>
</div>

<style>
	.sheet {
		position: fixed;
		z-index: var(--z-sheet);
		inset-inline: 0;
		bottom: 0;
		max-height: 80dvh;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--border-strong);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		background: var(--surface-raised);
		box-shadow: var(--shadow-lg);
		padding-bottom: var(--safe-bottom);
	}

	.sheet--side {
		inset-inline: auto 0;
		top: 3.5rem;
		bottom: 0;
		width: min(26rem, 100%);
		max-height: none;
		border-top: 0;
		border-inline-start: 1px solid var(--border-strong);
		border-radius: 0;
	}

	.sheet__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border);
	}

	.sheet__title {
		font-size: var(--fs-md);
	}

	.sheet__body {
		overflow-y: auto;
		padding: var(--space-4);
	}
</style>
