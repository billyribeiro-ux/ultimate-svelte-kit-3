<script lang="ts">
	import { resolve } from '$app/paths';
	import Section from '#lib/components/Section.svelte';
	import { TEMPLATES } from '#lib/sheet/templates.ts';
</script>

<svelte:head>
	<title>Templates — Abacus</title>
	<meta
		name="description"
		content="Three sheets that already work: a budget, a loan schedule and a grade book."
	/>
</svelte:head>

<div class="page">
	<Section eyebrow="Templates" title="Start from something that works">
		<ul class="cards">
			{#each Object.values(TEMPLATES) as template (template.slug)}
				<li class="card stack">
					<h3>
						<a href={resolve('/(app)/templates/[slug]', { slug: template.slug })}
							>{template.title}</a
						>
					</h3>
					<p class="hint">{template.summary}</p>
					<div class="cluster">
						<a
							class="btn btn--sm btn--primary"
							href={resolve(`/(app)/sheet/local?template=${template.slug}`)}>Open a copy</a
						>
						<a
							class="btn btn--sm"
							href={resolve('/(app)/templates/[slug]', { slug: template.slug })}>Preview</a
						>
					</div>
				</li>
			{/each}
		</ul>
	</Section>
</div>

<style>
	.cards {
		display: grid;
		gap: var(--space-4);
		list-style: none;
		padding: 0;
	}

	@media (min-width: 40rem) {
		.cards {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
