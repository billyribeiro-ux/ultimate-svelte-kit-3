<script lang="ts">
	import type { PageProps } from './$types.js';
	import SheetTable from '#lib/components/SheetTable.svelte';

	/**
	 * THE EMBED
	 * =========
	 *
	 * `+page@.svelte` resets this page to the root layout: no header, no
	 * navigation, just the table and a line saying where it came from. It is
	 * the one route `hooks.server.ts` allows inside an iframe — see the
	 * `frame-ancestors` note there — because being framed is its purpose.
	 */
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.published.title}</title>
</svelte:head>

<div class="embed">
	<SheetTable rendered={data.rendered} caption={data.published.title} />
	<p class="embed__foot hint">
		<a href="/s/{data.published.id}" target="_blank" rel="noopener">{data.published.title}</a> · by {data
			.published.owner} · made with Abacus
	</p>
</div>

<style>
	.embed {
		padding: var(--space-2);
	}

	.embed__foot {
		margin-top: var(--space-2);
	}
</style>
