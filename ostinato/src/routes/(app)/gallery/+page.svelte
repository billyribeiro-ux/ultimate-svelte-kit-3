<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { prefersReducedMotion } from 'svelte/motion';
	import { crossfade, fade } from 'svelte/transition';
	import { innerWidth } from 'svelte/reactivity/window';
	import { goto, preloadData } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { messageOf } from '#lib/errors.ts';
	import { whoAmI } from '#lib/remote/artist.remote.ts';
	import {
		getCounts,
		getMine,
		getPattern,
		getPatterns,
		remove
	} from '#lib/remote/patterns.remote.ts';
	import type { Sort } from '#lib/server/patterns.ts';
	import MiniGrid from '#lib/components/MiniGrid.svelte';
	import PatternCard from '#lib/components/PatternCard.svelte';
	import PatternView from '#lib/components/PatternView.svelte';
	import Section from '#lib/components/Section.svelte';
	import { toast } from '#lib/toast/toast.ts';

	const sorts: { value: Sort; label: string }[] = [
		{ value: 'new', label: 'Newest' },
		{ value: 'loved', label: 'Most loved' },
		{ value: 'played', label: 'Most played' }
	];

	/** The sort lives in the URL, so a sorted gallery is a link. */
	const sort = $derived(
		sorts.find((s) => s.value === page.url.searchParams.get('sort'))?.value ?? 'new'
	);

	/**
	 * CROSSFADE
	 * =========
	 * `crossfade` returns a pair of transitions. An element leaving with
	 * `out:send` and another entering with `in:receive` under the same key are
	 * animated as one thing moving between two places — here, a card's picture
	 * travelling into the preview dialog. When there is no partner (the dialog
	 * closed by the back button before the card re-rendered), `fallback` runs.
	 *
	 * The durations are functions, asked when a transition starts. Svelte plays
	 * its transitions with the Web Animations API, which the stylesheet's
	 * reduced-motion rule cannot reach, so each one has to ask for itself.
	 */
	const [send, receive] = crossfade({
		duration: () => (prefersReducedMotion.current ? 0 : 320),
		fallback: (node) => fade(node, { duration: prefersReducedMotion.current ? 0 : 160 })
	});
	const fadeDuration = $derived(prefersReducedMotion.current ? 0 : 160);

	/**
	 * PREVIEW WITHOUT LEAVING
	 * =======================
	 * On a wide screen, clicking a card opens it in a dialog rather than
	 * navigating away. `preloadData` runs the pattern page's `load` — which
	 * warms the `getPattern` cache — and a *shallow* `goto` then changes the URL
	 * to the pattern's address with `{ preview }` in the history state, *without*
	 * rendering the pattern page. Reload, and the real page appears at that
	 * URL; press back, and the dialog closes. On a phone, the link is a link.
	 *
	 * `goto(href, { shallow: true, state })` is SvelteKit 3's spelling of what
	 * used to be `pushState(href, state)`, and the change is more than a name.
	 * A shallow navigation runs the navigation hooks, so the root layout sees
	 * it — and declines to cross-fade it. And `page.url` keeps describing the
	 * page that is *rendered*, this one, while `page.shallow.url` describes the
	 * one in the address bar; the sort chips above, which read `page.url`, stay
	 * right while the dialog is open.
	 */
	async function open(event: MouseEvent, id: string) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || (innerWidth.current ?? 0) < 640) return;
		event.preventDefault();

		const href = resolve('/(app)/p/[id]', { id });
		const result = await preloadData(href);
		if (result.type === 'loaded' && result.status === 200) {
			await goto(href, { shallow: true, state: { preview: id } });
		} else {
			await goto(href);
		}
	}

	/** Closing is going back: the preview is a history entry, and back removes it. */
	function close() {
		if (page.state.preview) history.back();
	}

	/**
	 * A REAL MODAL
	 * ============
	 * `showModal()` is what makes a `<dialog>` modal: the browser puts it in the
	 * top layer, makes everything behind it inert — so Tab cannot wander onto
	 * the gallery underneath — moves focus inside, closes it on Escape, and
	 * gives focus back to the card that opened it when it closes. A `<div
	 * role="dialog">` has to fake each of those, and this one used to fake none.
	 *
	 * An attachment, because "call a method on the element once it exists, and
	 * undo it when it goes" is exactly what one is. The teardown runs after the
	 * fade-out, so the dialog stays modal until it has gone.
	 */
	const modal: Attachment<HTMLDialogElement> = (dialog) => {
		dialog.showModal();
		return () => dialog.close();
	};
</script>

<svelte:head>
	<title>Gallery — Ostinato</title>
	<meta name="description" content="Published grooves: play them, love them, remix them." />
</svelte:head>

<div class="page">
	<Section eyebrow="Gallery" title="Published grooves">
		<nav class="cluster" aria-label="Sort">
			{#each sorts as option (option.value)}
				<a
					class="chip"
					href={resolve(`/(app)/gallery?sort=${option.value}`)}
					aria-current={sort === option.value ? 'true' : undefined}
				>
					{option.label}
				</a>
			{/each}
		</nav>

		<svelte:boundary>
			<ul class="cards">
				{#each await getPatterns({ sort }) as published (published.id)}
					<li>
						<PatternCard
							{published}
							counts={await getCounts(published.id)}
							onopen={(e) => open(e, published.id)}
						>
							{#snippet grid(pattern)}
								{#if page.state.preview !== published.id}
									<div out:send={{ key: published.id }} in:receive={{ key: published.id }}>
										<MiniGrid {pattern} />
									</div>
								{/if}
							{/snippet}
						</PatternCard>
					</li>
				{:else}
					<li class="hint">Nothing published yet.</li>
				{/each}
			</ul>

			{#snippet pending()}
				<p class="hint">Loading the gallery…</p>
			{/snippet}
			{#snippet failed(error, reset)}
				<p class="issue">The gallery could not be loaded: {(error as App.Error).message}</p>
				<button type="button" class="btn" onclick={reset}>Try again</button>
			{/snippet}
		</svelte:boundary>
	</Section>

	<!--
		ONE BOUNDARY, NOT TWO
		A second boundary inside this one, around the list, is the natural place
		for a "Loading yours…" line — and there was one. On a full page load
		(Svelte 5.57.2) it hydrated its markup and never ran its effects: no
		attachments, so the delete forms were never enhanced and Delete fell
		back to a plain POST. That still deletes, which is why nothing noticed;
		a refusal became an error page instead of a toast. Removing either the
		inner boundary or the batched `await getCounts` inside it was enough, so
		the inner boundary went — this one already waits for everything in it.
		There is no upstream issue yet: it needs reducing to a page without this
		app around it first. Until then the condition for putting the inner
		boundary back is the two-tab test in `e2e/gallery.e2e.ts` passing with
		it in place.
	-->
	<svelte:boundary>
		{const me = $derived(await whoAmI())}
		{#if me}
			<Section eyebrow="@{me.handle}" title="Yours">
				<ul class="cards" id="yours">
					{#each await getMine() as mine (mine.id)}
						<!--
							A plain declaration, worked out once per row, and that is right
							here: the row is keyed by `mine.id`, so its id never changes, and
							`remove.for(id)` hands back the same form instance every time.
						-->
						{const del = remove.for(mine.id)}
						<li>
							<PatternCard published={mine} counts={await getCounts(mine.id)}>
								{#snippet actions()}
									<!--
										One form per card, isolated by `remove.for(id)`, so a pending
										delete disables *its* button and no other. The optimistic
										override removes the card before the server has answered;
										a refusal puts it back, and the toast says what the server
										said — "Not yours, or not there" for a card another tab has
										already deleted.
									-->
									<form
										{...del.enhance(async (f) => {
											try {
												await f
													.submit()
													.updates(
														getMine().withOverride((list) => list.filter((p) => p.id !== mine.id))
													);
												toast('Deleted');
											} catch (e) {
												toast(messageOf(e, 'Could not delete that'), 'error');
											}
										})}
									>
										<input {...del.fields.id.as('hidden', mine.id)} />
										<button class="btn btn--sm btn--danger" disabled={!!del.pending}>Delete</button>
									</form>
								{/snippet}
							</PatternCard>
						</li>
					{:else}
						<li class="hint">You have not published anything from this browser yet.</li>
					{/each}
				</ul>
			</Section>
		{/if}
	</svelte:boundary>
</div>

{#if page.state.preview}
	<!--
		`$derived`. The `{#if}` asks only whether there is a preview, so
		nothing ties this block's life to which one: a plain declaration would
		be right only as long as nothing ever changed the id without closing
		the dialog first, and a derived makes that a question nobody has to ask.
	-->
	{const id = $derived(page.state.preview)}
	<!--
		Escape closes a modal dialog by itself; `onclose` turns that into the
		history step the preview is. A click whose target is the dialog element
		itself landed on the backdrop — everything inside is in `.preview__body`.
	-->
	<dialog
		class="preview"
		aria-label="Pattern preview"
		{@attach modal}
		onclose={close}
		onclick={(event) => {
			if (event.target === event.currentTarget) close();
		}}
		transition:fade={{ duration: fadeDuration }}
	>
		<div class="preview__body">
			<svelte:boundary>
				{const published = $derived(await getPattern(id))}
				<div class="preview__picture" in:receive={{ key: id }} out:send={{ key: id }}>
					<MiniGrid pattern={published.pattern} />
				</div>
				<PatternView {published} compact />
				<p class="cluster">
					<!--
						A plain link to the address already in the bar. Since SvelteKit 3
						that is a real navigation, not a no-op: it leaves shallow routing,
						replaces the preview's history entry with the page, and refreshes.
					-->
					<a class="btn btn--ghost" href={resolve('/(app)/p/[id]', { id })}>Open the full page</a>
					<button type="button" class="btn btn--ghost" onclick={close}>Close</button>
				</p>
				{#snippet pending()}
					<p class="hint">Opening…</p>
				{/snippet}
			</svelte:boundary>
		</div>
	</dialog>
{/if}

<style>
	.cards {
		display: grid;
		gap: var(--space-4);
		list-style: none;
		padding: 0;
	}

	/* The top layer needs no z-index; the browser draws `::backdrop` under it. */
	.preview {
		width: min(56rem, 100% - 2 * var(--gutter));
		max-width: none;
		max-height: 90vh;
		margin: 5vh auto auto;
		padding: 0;
		overflow-y: auto;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--surface-raised);
		color: inherit;
		box-shadow: var(--shadow-lg);
	}

	.preview::backdrop {
		background: rgb(0 0 0 / 0.5);
	}

	.preview__body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-5);
	}

	.preview__picture {
		max-width: 16rem;
	}

	@media (min-width: 40rem) {
		.cards {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 64rem) {
		.cards {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
