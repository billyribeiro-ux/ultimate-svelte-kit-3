<script lang="ts">
	import type { PageProps } from './$types.js';
	import SheetTable from '#lib/components/SheetTable.svelte';
	import { create } from '#lib/remote/sheets.remote.ts';
	import { whoAmI } from '#lib/remote/auth.remote.ts';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.template.title} — Abacus templates</title>
	<meta name="description" content={data.template.summary} />
</svelte:head>

<article class="page template">
	<header class="template__head">
		<div>
			<p class="eyebrow">Template</p>
			<h1>{data.template.title}</h1>
			<p class="hint">{data.template.summary}</p>
		</div>
		<div class="cluster">
			<a class="btn btn--primary" href="/sheet/local?template={data.template.slug}"
				>Open a copy — no account</a
			>
			<svelte:boundary>
				{const me = $derived(await whoAmI())}
				{#if me}
					<form {...create}>
						<input {...create.fields.title.as('hidden', data.template.title)} />
						<input {...create.fields.template.as('hidden', data.template.slug)} />
						<button class="btn" disabled={!!create.pending}>Save to my account</button>
					</form>
				{/if}
				{#snippet pending()}{/snippet}
			</svelte:boundary>
		</div>
	</header>

	<SheetTable rendered={data.rendered} caption={data.template.title} />
</article>

<style>
	.template {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding-block: var(--space-5) var(--space-8);
	}

	.template__head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-end;
		gap: var(--space-3);
	}

	.eyebrow {
		color: var(--accent);
		font-size: var(--fs-xs);
		font-weight: var(--weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
</style>
