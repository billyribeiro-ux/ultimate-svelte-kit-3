<script lang="ts">
	import { resolve } from '$app/paths';
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
			<a
				class="btn btn--primary"
				href={resolve(`/(app)/sheet/local?template=${data.template.slug}`)}
				>Open a copy — no account</a
			>
			<!--
				THE SAVE BUTTON ARRIVES WITH JAVASCRIPT
				This page is prerendered: built once, for nobody in particular, so
				there is no person to ask about at build time. The empty `pending`
				snippet is what says so. On the server, a boundary with `pending`
				renders that snippet and skips its content, so the build neither
				awaits `whoAmI()` nor bakes a stranger's answer into the file; in the
				browser the content renders once the answer arrives, and only for
				somebody signed in. The link before it is the way in that needs no
				script and no account. `failed` is empty for the same reason: if
				nobody can be asked, the page still offers that link.
			-->
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
				{#snippet failed()}{/snippet}
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
