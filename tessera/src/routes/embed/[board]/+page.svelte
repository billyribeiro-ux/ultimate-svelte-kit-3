<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	/**
	 * The embed host page.
	 *
	 * Its whole job is to define the custom element and put one on the page, so
	 * that `<iframe src="/embed/…">` works for hosts that cannot run a script, and
	 * so the element itself has somewhere to be exercised in the end-to-end tests.
	 *
	 * The import is dynamic and inside `onMount` for a reason: a Svelte custom
	 * element calls `customElements.define` at module scope, and `customElements`
	 * does not exist during server rendering. A static import crashes the SSR pass
	 * with `customElements is not defined`, which is a confusing error to get from
	 * a component you never rendered.
	 */
	let ready = $state(false);

	onMount(async () => {
		await import('#lib/embed/TesseraBoard.svelte');
		ready = true;
	});
</script>

<svelte:head>
	<title>Board embed</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if ready}
	<!--
		The element is used exactly as a host page would use it: an unknown tag with
		plain attributes. Svelte has no idea what this is, which is the point.
	-->
	<tessera-board board={page.params.board} height="420"></tessera-board>
{/if}

<style>
	:global(body) {
		margin: 0;
		background: transparent;
	}
</style>
