<script lang="ts">
	import { messages } from '#lib/i18n/index.ts';
	import { reveal } from '#lib/motion/index.ts';
	import Logo from '#lib/components/Logo.svelte';
	import Button from '#lib/components/Button.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const t = $derived(messages(data.locale));
	const prefix = $derived(data.locale === 'en' ? '' : `/${data.locale}`);
</script>

<svelte:head>
	<title>{t.app.name} — {t.app.tagline}</title>
	<meta name="description" content={t.app.tagline} />
</svelte:head>

<section class="hero container" {@attach reveal({ stagger: 0.08 })}>
	<Logo size={44} />
	<h1>{t.app.tagline}</h1>
	<p class="hero__lede">
		A diagram everybody can edit at once, that keeps working when the network does not, and that
		cannot lose a change to a race between two people typing.
	</p>
	<div class="hero__actions">
		<Button variant="primary" href="{prefix}/boards">
			{data.user ? t.nav.boards : t.board.create}
		</Button>
		{#if !data.user}
			<Button href="{prefix}/sign-in">{t.nav.signIn}</Button>
		{/if}
	</div>
</section>

<section class="points container" {@attach reveal({ stagger: 0.06, delay: 0.2 })}>
	<article>
		<h2>Offline is a state, not an error</h2>
		<p>
			Every edit lands locally first and queues on your device. Close the laptop mid-sentence, open
			it on a train, and the work is still there and still on its way.
		</p>
	</article>
	<article>
		<h2>Concurrent edits merge, they do not race</h2>
		<p>
			Two people moving the same box have a definite winner on every machine. Two people typing in
			the same label get both sentences, interleaved the way they meant.
		</p>
	</article>
	<article>
		<h2>Keyboard first, genuinely</h2>
		<p>
			Every shape is reachable, nameable and movable without a pointer, and the board has a real
			outline a screen reader can walk.
		</p>
	</article>
</section>

<style>
	.hero {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-4);
		padding-block: var(--space-8) var(--space-7);
	}

	.hero__lede {
		font-size: var(--fs-md);
		color: var(--text-muted);
		max-width: 46ch;
	}

	.hero__actions {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.points {
		display: grid;
		gap: var(--space-5);
		padding-block: var(--space-6) var(--space-9);
	}

	.points h2 {
		font-size: var(--fs-lg);
		margin-bottom: var(--space-2);
	}

	.points p {
		color: var(--text-muted);
		max-width: 44ch;
	}

	@media (min-width: 48rem) {
		.points {
			grid-template-columns: repeat(3, 1fr);
			gap: var(--space-6);
		}
	}
</style>
