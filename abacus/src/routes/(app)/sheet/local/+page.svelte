<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { CloudArrowUpIcon } from 'phosphor-svelte';
	import Workbench from '#lib/grid/Workbench.svelte';
	import { whoAmI } from '#lib/remote/auth.remote.ts';
	import { create, getPublished } from '#lib/remote/sheets.remote.ts';
	import { emptyDocument } from '#lib/sheet/document.ts';
	import { loadLocal, openTabChannel, saveLocal, tabId } from '#lib/sheet/local.ts';
	import { Sheet } from '#lib/sheet/sheet.svelte.ts';
	import { TEMPLATES, templateDocument } from '#lib/sheet/templates.ts';
	import { toast } from '#lib/toast/toast.ts';

	/**
	 * THE LOCAL SHEET
	 * ===============
	 *
	 * No account, no server: the document lives in this browser's private file
	 * system and every change is written there. Two tabs on it stay in step
	 * over a `BroadcastChannel`. Signing in offers to save it to an account,
	 * which posts the whole document through the `create` form.
	 *
	 * `?template=budget` starts from a template; `?from=<id>` starts from a
	 * published sheet — both are "make me a copy of this" without an account.
	 */
	const sheet = new Sheet();
	let storage = $state<'opfs' | 'storage' | 'none' | null>(null);
	let ready = $state(false);

	const tab = tabId();
	const channel = openTabChannel(tab);

	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	function scheduleSave() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			saveTimer = null;
			storage = await saveLocal(sheet.toDocument());
			if (storage !== 'none') sheet.markSaved();
		}, 400);
	}

	sheet.onop = (op) => {
		channel.post(op);
		scheduleSave();
	};

	onMount(() => {
		sheet.locale = navigator.language;

		const template = page.url.searchParams.get('template');
		const from = page.url.searchParams.get('from');

		void (async () => {
			try {
				if (template && template in TEMPLATES) {
					sheet.load(templateDocument(template));
					scheduleSave();
				} else if (from) {
					const published = await getPublished(from);
					sheet.load({ ...published.doc, title: `Copy of ${published.title}` });
					scheduleSave();
				} else {
					const saved = await loadLocal();
					sheet.load(saved ?? emptyDocument('My sheet'));
				}
			} catch (e) {
				toast((e as Error).message, 'error');
				sheet.load(emptyDocument('My sheet'));
			}
			ready = true;
		})();

		const stop = channel.listen(({ op }) => {
			sheet.applyRemote(op);
			scheduleSave();
		});
		return () => {
			stop();
			channel.close();
		};
	});

	/** The document as JSON for the "save to account" form, current with every edit. */
	const json = $derived.by(() => {
		void sheet.version;
		return JSON.stringify(sheet.toDocument());
	});

	const storageLabel = $derived(
		storage === 'opfs'
			? 'Saved in this browser'
			: storage === 'storage'
				? 'Saved in this browser (local storage)'
				: storage === 'none'
					? 'Could not save in this browser'
					: ready
						? 'Kept in this browser'
						: 'Loading…'
	);
</script>

<svelte:head>
	<title>{sheet.title} — Abacus</title>
</svelte:head>

<div class="page sheetpage">
	<header class="sheetpage__head no-print">
		<h1
			class="title"
			contenteditable="plaintext-only"
			spellcheck="false"
			aria-label="Sheet title"
			bind:textContent={() => sheet.title, (text) => sheet.rename(text)}
		></h1>
		<span class="chip" role="status">{storageLabel}</span>
	</header>

	<Workbench {sheet}>
		{#snippet extra()}
			<svelte:boundary>
				{const me = $derived(await whoAmI())}
				{#if me}
					<form {...create} class="cluster">
						<input {...create.fields.title.as('hidden', sheet.title)} />
						<input {...create.fields._doc.as('hidden', json)} />
						<button class="btn btn--sm btn--primary" disabled={!!create.pending}>
							<CloudArrowUpIcon size={16} /> Save to my account
						</button>
					</form>
				{:else}
					<a class="btn btn--sm" href="/signin?next=/sheet/local">Sign in to save it</a>
				{/if}
				{#snippet pending()}
					<span class="chip">…</span>
				{/snippet}
			</svelte:boundary>
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
</style>
