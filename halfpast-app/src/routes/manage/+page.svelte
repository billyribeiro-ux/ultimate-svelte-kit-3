<script lang="ts">
	import { resolve } from '$app/paths';
	import Alert from '#lib/components/Alert.svelte';
	import { reveal } from '#lib/motion/index.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Your studios — Halfpast</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container-narrow wrap" {@attach reveal({ y: 12 })}>
	<h1>Your studios</h1>

	{#if data.memberships.length === 0}
		<Alert tone="info" title="No studio yet">
			<p>
				Your account is not linked to a studio. If you were expecting one, ask whoever invited you
				to check they used this email address.
			</p>
		</Alert>
	{:else}
		<ul class="list" role="list">
			{#each data.memberships as entry (entry.slug)}
				<li>
					<a href={resolve('/manage/[slug]', { slug: entry.slug })}>
						<span class="name">{entry.name}</span>
						<span class="role">{entry.role === 'owner' ? 'Owner' : 'Staff'}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.wrap {
		padding-block: var(--space-7);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	h1 {
		font-size: var(--text-xl);
	}

	.list {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.list li + li {
		margin: 0;
	}

	.list a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-4);
		background: var(--surface);
		border: var(--border) solid var(--line);
		border-radius: var(--radius-lg);
		text-decoration: none;
		color: var(--ink);
	}

	.list a:hover {
		border-color: var(--accent-line);
		box-shadow: var(--shadow-md);
	}

	.name {
		font-family: var(--font-display);
		font-weight: var(--weight-semibold);
	}

	.role {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--ink-muted);
	}
</style>
