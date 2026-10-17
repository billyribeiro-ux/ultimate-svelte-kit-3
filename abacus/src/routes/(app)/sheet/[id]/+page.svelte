<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { CopyIcon, GlobeIcon, LinkIcon, UsersIcon } from 'phosphor-svelte';
	import type { PageProps } from './$types.js';
	import { messageOf } from '#lib/errors.ts';
	import Workbench from '#lib/grid/Workbench.svelte';
	import { watchSheet } from '#lib/remote/live.remote.ts';
	import { getSheet, publish, setAccess, unpublish } from '#lib/remote/sheets.remote.ts';
	import { LiveSheet } from '#lib/sheet/live.svelte.ts';
	import { Sheet } from '#lib/sheet/sheet.svelte.ts';
	import { toast } from '#lib/toast/toast.ts';

	/**
	 * A STORED SHEET
	 * ==============
	 *
	 * The sheet model, the live connection, and the chrome that only a stored
	 * sheet has: who else is here, whether it is saving, sharing and
	 * publishing. The document arrived through `load`; from here on the live
	 * query is the source of truth for everybody else's changes and `send`
	 * is the outlet for ours.
	 */
	let { data }: PageProps = $props();

	// The first document is read once, at creation, and never again: a later
	// `data` change must not throw away edits. `untrack` reads without subscribing.
	const initial = untrack(() => data);

	const sheet = new Sheet({ locale: initial.locale });
	sheet.load(initial.sheet.doc);

	const live = new LiveSheet(initial.sheet.id, sheet, initial.sheet.version);

	/**
	 * `watchSheet` is a `query.live`. The room's operations are applied by
	 * iterating it (`live.follow`), one loop for as long as the stream lasts.
	 * A dropped connection is not the end of it — SvelteKit reconnects behind
	 * the same iterator, and the loop waits. A stream the server ended or
	 * refused is `done`; `reconnect()` opens a new one, `done` turns false,
	 * and the effect starts a new loop. The cleanup stops the old one.
	 * `current` and `connected` stay for the status chip below.
	 */
	const stream = watchSheet({
		id: initial.sheet.id,
		client: live.client,
		since: initial.sheet.version
	});
	$effect(() => {
		if (stream.done) return;
		const controller = new AbortController();
		// Starting the loop reads the query's latest value. Untracked, so a new
		// message does not re-run this effect and start the loop all over again.
		untrack(() => void live.follow(stream, controller.signal));
		return () => controller.abort();
	});

	// The autofixer asks whether these effects write state that could be
	// derived. They do not: one applies other people's operations as they
	// arrive, the other sends what is queued and lets go of the sheet as the
	// page goes. Both are side effects with a cleanup, which is what `$effect`
	// is for.
	$effect(() => () => live.dispose());

	// Whatever is queued goes before the page is left.
	beforeNavigate(() => void live.flush());

	/*
	 * Absolute addresses to copy, still built by `resolve()`. On the server it
	 * renders a path relative to the page (so the build works under any base
	 * path), which is why the result is resolved against `page.url` rather than
	 * glued to an origin.
	 */
	const shareUrl = $derived(
		new URL(resolve('/(app)/sheet/[id]', { id: initial.sheet.id }), page.url.href).href
	);
	const publishedUrl = $derived(
		new URL(resolve('/(app)/s/[id]', { id: initial.sheet.id }), page.url.href).href
	);

	/**
	 * The sheet's record — access, published or not — read from the query
	 * rather than from `data`. `load` ran the same query, so this resolves at
	 * once from the cache; the difference is what happens next: `publish`,
	 * `unpublish` and `setAccess` call `getSheet(id).refresh()`, and a query
	 * awaited here updates in place, while `data` is a snapshot of what the
	 * load returned.
	 */
	const record = $derived(await getSheet(initial.sheet.id));
	const owner = $derived(record.ownerId === data.me.id);

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast('Copied');
		} catch {
			toast('Could not copy — select the text and copy it by hand', 'error');
		}
	}

	async function togglePublish() {
		try {
			if (record.published) {
				await unpublish(initial.sheet.id);
				toast('No longer published');
			} else {
				const { url } = await publish(initial.sheet.id);
				toast(`Published at ${url}`);
			}
		} catch (e) {
			toast(messageOf(e, 'Could not change publishing'), 'error');
		}
	}

	/**
	 * `stream.current` is undefined until the first message arrives, which
	 * tells "not connected yet" apart from "lost the connection": only the
	 * second deserves a Reconnect button, and a button that appears for a
	 * moment on every load would shift the grid under a finger on a phone.
	 */
	const everConnected = $derived(stream.current !== undefined);
	const statusLabel = $derived.by((): string => {
		switch (live.status.kind) {
			case 'live':
				return stream.connected ? 'Saved' : everConnected ? 'Reconnecting…' : 'Connecting…';
			case 'saving':
				return 'Saving…';
			case 'offline':
				return 'Offline — changes are kept and will be sent';
			case 'refused':
				return 'Not saved';
		}
	});

	/** A failed reconnect leaves `connected` false, and the chip and the button say so. */
	function reconnect() {
		stream.reconnect().catch(() => {});
	}
</script>

<svelte:head>
	<title>{sheet.title} — Abacus</title>
</svelte:head>

<!-- Leaving with unsent changes: the browser asks, because we asked it to. -->
<svelte:window
	onbeforeunload={(event) => {
		if (live.pending) event.preventDefault();
	}}
/>

<div class="page sheetpage">
	<header class="sheetpage__head no-print">
		<!-- The title is the sheet's; typing here renames it for everybody. -->
		<h1
			class="title"
			contenteditable="plaintext-only"
			spellcheck="false"
			aria-label="Sheet title"
			bind:textContent={() => sheet.title, (text) => sheet.rename(text)}
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					event.currentTarget.blur();
				}
			}}
		></h1>

		<div class="cluster">
			<span
				class={[
					'chip',
					{
						'chip--on': live.status.kind === 'live' && stream.connected,
						'chip--refused': live.status.kind === 'refused'
					}
				]}
				role="status"
			>
				{statusLabel}
			</span>
			{#if live.status.kind === 'refused'}
				<!--
					A full reload, not a refresh of the queries: the sheet model was built
					once from `data` and holds edits the server turned down, so the honest
					way back is to build it again from what the server kept.
				-->
				<button type="button" class="btn btn--sm btn--primary" onclick={() => location.reload()}
					>Reload</button
				>
			{:else if !stream.connected && everConnected}
				<button type="button" class="btn btn--sm btn--ghost" onclick={reconnect}>Reconnect</button>
			{/if}
			{#each live.present as who (who.client)}
				<span class="chip chip--on" title={who.cell ? `at ${who.cell}` : 'here'}>
					<UsersIcon size={12} />
					{who.name}
				</span>
			{/each}
		</div>
		{#if live.status.kind === 'refused'}
			<p class="issue refused" role="alert">
				{live.status.message} — your last changes were not saved. Reload to carry on from what the server
				kept.
			</p>
		{/if}
	</header>

	<Workbench
		{sheet}
		cursors={live.present}
		exportHref={resolve('/api/sheets/[id]/export.csv', { id: initial.sheet.id })}
		onactivate={(cell) => live.cursor(cell)}
	>
		{#snippet extra()}
			<button type="button" class="btn btn--sm" popovertarget="share-menu">
				<LinkIcon size={16} /> Share
			</button>
			<div id="share-menu" class="share" popover="auto">
				<h2 class="share__title">Share</h2>
				{#if owner}
					<!--
						A form for the access setting, because a setting that survives a
						page with no JavaScript is a setting that survives anything. With
						JavaScript a choice submits itself; without it, the button inside
						<noscript> is the way to send it — Svelte renders that content on
						the server and leaves the element empty in the browser.
					-->
					<form {...setAccess} class="stack">
						<input {...setAccess.fields.id.as('hidden', initial.sheet.id)} />
						<label class="check">
							<input
								{...setAccess.fields.access.as('radio', 'private')}
								checked={record.access === 'private'}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							/>
							Only me
						</label>
						<label class="check">
							<input
								{...setAccess.fields.access.as('radio', 'link')}
								checked={record.access === 'link'}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							/>
							Anyone signed in with the link can edit
						</label>
						<noscript>
							<button class="btn btn--sm">Save sharing</button>
						</noscript>
					</form>
				{:else}
					<p class="hint">Shared with you by its owner.</p>
				{/if}
				<div class="linkrow">
					<input class="input mono" readonly value={shareUrl} aria-label="Link to this sheet" />
					<button
						type="button"
						class="btn btn--icon"
						aria-label="Copy link"
						onclick={() => copy(shareUrl)}
					>
						<CopyIcon size={16} />
					</button>
				</div>

				{#if owner}
					<h2 class="share__title">Publish</h2>
					<p class="hint">
						A read-only copy at a public address, frozen as it is now. Publish again to update it.
					</p>
					<div class="cluster">
						<button
							type="button"
							class={['btn btn--sm', { 'btn--primary': !record.published }]}
							onclick={togglePublish}
						>
							<GlobeIcon size={16} />
							{record.published ? 'Unpublish' : 'Publish'}
						</button>
						{#if record.published}
							<a class="btn btn--sm" href={resolve('/(app)/s/[id]', { id: initial.sheet.id })}
								>View</a
							>
							<button
								type="button"
								class="btn btn--sm btn--ghost"
								onclick={() => copy(publishedUrl)}>Copy public link</button
							>
						{/if}
					</div>
				{/if}
			</div>
		{/snippet}
	</Workbench>
</div>

<style>
	.sheetpage {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		height: calc(100dvh - var(--topbar));
		padding-block: var(--space-3) var(--space-2);
	}

	.sheetpage__head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.title {
		flex: 1 1 14rem;
		min-width: 6ch;
		font-size: var(--fs-lg);
		padding: 0 var(--space-1);
		border-radius: var(--radius-sm);
		outline: none;
	}

	.title:focus {
		background: var(--surface-active);
	}

	.chip--refused {
		border-color: var(--danger);
		color: var(--danger);
		background: var(--danger-soft);
	}

	/* The reason takes a line of its own, under the title and the chips. */
	.refused {
		flex-basis: 100%;
	}

	.share {
		position: fixed;
		inset: auto;
		width: min(28rem, 92vw);
		margin: 0;
		padding: var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--surface-raised);
		color: var(--text);
		box-shadow: var(--shadow-lg);
	}

	.share:popover-open {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.share__title {
		font-size: var(--fs-md);
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--fs-sm);
	}

	.linkrow {
		display: flex;
		gap: var(--space-2);
	}
</style>
