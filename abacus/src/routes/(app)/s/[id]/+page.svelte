<script lang="ts">
	import type { PageProps } from './$types.js';
	import SheetTable from '#lib/components/SheetTable.svelte';

	let { data }: PageProps = $props();
	// `data` can change when the page is re-rendered with another sheet, so the
	// date is derived from it rather than computed once.
	const when = $derived(
		new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(
			new Date(data.published.publishedAt)
		)
	);
</script>

<svelte:head>
	<title>{data.published.title} — Abacus</title>
	<meta
		name="description"
		content="{data.published.title}, a sheet by {data.published.owner}, published {when}."
	/>
</svelte:head>

<article class="page published">
	<header class="published__head">
		<div>
			<p class="eyebrow">Published sheet</p>
			<h1>{data.published.title}</h1>
			<p class="hint">
				By {data.published.owner} · published {when} · {data.published.doc.cells.length.toLocaleString()}
				cells
			</p>
		</div>
		<div class="cluster no-print">
			<a class="btn btn--primary" href="/sheet/local?from={data.published.id}"
				>Make a copy to edit</a
			>
			<a class="btn" href="/api/sheets/{data.published.id}/export.csv">Download CSV</a>
			<a class="btn btn--ghost" href="/embed/{data.published.id}">Embed</a>
		</div>
	</header>

	<SheetTable rendered={data.rendered} caption={data.published.title} />
</article>

<style>
	.published {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding-block: var(--space-5) var(--space-8);
	}

	.published__head {
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
