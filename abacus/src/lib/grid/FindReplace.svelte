<script lang="ts">
	import { XIcon } from 'phosphor-svelte';
	import { toA1 } from '#lib/sheet/address.ts';
	import type { Sheet } from '#lib/sheet/sheet.svelte.ts';

	/**
	 * Find and replace. `find` reads inputs and displayed text; `replace`
	 * rewrites inputs as one undo step. The matches are a `$derived` of the
	 * query and the sheet version, so they follow every edit.
	 */
	let { sheet, onclose }: { sheet: Sheet; onclose: () => void } = $props();

	let query = $state('');
	let replacement = $state('');
	let matchCase = $state(false);
	let regex = $state(false);
	const matches = $derived.by(() => {
		void sheet.version;
		return sheet.find(query, { matchCase, regex });
	});

	// The match being shown. Assigned by Next and Previous; back to the first
	// whenever the matches change, because a reassigned `$derived` holds only
	// until its dependencies do.
	let index = $derived.by(() => {
		void matches;
		return 0;
	});

	function go(step: number) {
		if (matches.length === 0) return;
		index = (index + step + matches.length) % matches.length;
		sheet.select(matches[index]!);
	}

	function replaceAll() {
		const n = sheet.replace(query, replacement, { matchCase, regex });
		onclose();
		return n;
	}

	const focus = (node: HTMLInputElement) => {
		node.focus();
	};
</script>

<div class="find" role="search" aria-label="Find and replace">
	<label class="field">
		<span class="visually-hidden">Find</span>
		<input
			class="input"
			placeholder="Find"
			bind:value={query}
			onkeydown={(e) => {
				if (e.key === 'Enter') go(e.shiftKey ? -1 : 1);
				if (e.key === 'Escape') onclose();
			}}
			{@attach focus}
		/>
	</label>
	<label class="field">
		<span class="visually-hidden">Replace with</span>
		<input class="input" placeholder="Replace with" bind:value={replacement} />
	</label>
	<label class="check"><input type="checkbox" bind:checked={matchCase} /> Match case</label>
	<label class="check"><input type="checkbox" bind:checked={regex} /> Regex</label>
	<span class="hint" role="status">
		{#if query}
			{matches.length === 0
				? 'No matches'
				: `${index + 1} of ${matches.length} · ${toA1(matches[index]!)}`}
		{/if}
	</span>
	<button type="button" class="btn btn--sm" onclick={() => go(1)} disabled={matches.length === 0}
		>Next</button
	>
	<button type="button" class="btn btn--sm" onclick={replaceAll} disabled={matches.length === 0}
		>Replace all</button
	>
	<button
		type="button"
		class="btn btn--sm btn--icon btn--ghost"
		aria-label="Close"
		onclick={onclose}
	>
		<XIcon size={16} />
	</button>
</div>

<style>
	.find {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	.find .field {
		flex: 1 1 10rem;
	}

	.find .input {
		min-height: 2.25rem;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--fs-sm);
	}
</style>
