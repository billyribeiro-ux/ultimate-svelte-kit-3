<script lang="ts">
	import '../app.css';
	import { messages } from '#lib/i18n/index.ts';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();

	/**
	 * The catalogue, resolved once at the root and passed down.
	 *
	 * Not a context and not a store. It is a plain value that changes only when
	 * the URL's language segment does, so `$derived` on the layout's data is the
	 * whole mechanism — and every component that needs it takes it as a prop,
	 * which means a component test can render one without a provider.
	 */
	const t = $derived(messages(data.locale));
</script>

{@render children()}

<!--
	The visually-hidden live region every page shares.

	One per application, at the root, because two live regions competing to
	announce different things is how a screen reader ends up reading neither.
-->
<div class="visually-hidden" role="status" aria-live="polite" data-announcer>
	{t.app.name}
</div>
