<!--
	ERROR PAGE

	SvelteKit renders the nearest `+error.svelte` whenever a load function, a
	component or a remote form submission throws, and for every URL that matches no
	route. This one sits at the root, so it is the nearest for the whole site — and
	it renders INSIDE the root layout, so the header, footer and skip link stay and
	the visitor always has a way forward.

	`error` arrives as a prop. It is an `App.Error` — `{ status, message }` — that has
	already been through the `handleError` hook. For an error the code threw on
	purpose, `error(404, 'No article found at …')`, the message is the sentence the
	code wrote. For anything unexpected, SvelteKit's default hook has replaced the
	message with 'Internal Error', so a stack trace or a file path can never reach
	this page. That makes `error.message` safe to show as it stands.
-->

<script lang="ts">
	import { resolve } from '$app/paths';
	import { site } from '#lib/data/site.ts';
	import Button from '#lib/components/ui/Button.svelte';
	import type { ErrorProps } from './$types';

	let { error }: ErrorProps = $props();

	const notFound = $derived(error.status === 404);
	const heading = $derived(notFound ? 'We can’t find that page' : 'Something went wrong');
</script>

<!--
	No <Seo> here: an error page has no canonical URL to claim and nothing to say
	to a social card. It only needs a title, and to stay out of the index.
-->
<svelte:head>
	<title>{heading} | {site.titleSuffix}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="error-page">
	<div class="container container--narrow">
		<p class="eyebrow">Error {error.status}</p>
		<h1 class="error-page__title">{heading}</h1>
		<p class="lede">{error.message}</p>

		<div class="error-page__actions">
			<Button href={resolve('/')}>Back to the home page</Button>
			<Button href={resolve('/guide')} variant="secondary">Get the free guide</Button>
		</div>
	</div>
</section>

<style>
	.error-page {
		padding-block: calc(var(--header-height) + var(--space-12)) var(--section-y);
		min-height: 60svh;
	}

	.error-page__title {
		margin-block: var(--space-3) var(--space-4);
		font-size: var(--fs-2xl);
	}

	.error-page__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-block-start: var(--space-8);
	}
</style>
