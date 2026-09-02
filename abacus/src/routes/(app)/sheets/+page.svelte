<script lang="ts">
	import * as v from 'valibot';
	import { PlusIcon, TrashIcon } from 'phosphor-svelte';
	import Section from '#lib/components/Section.svelte';
	import { create, getMine, remove, rename } from '#lib/remote/sheets.remote.ts';
	import { TEMPLATES } from '#lib/sheet/templates.ts';
	import { toast } from '#lib/toast/toast.ts';

	/**
	 * THE WORKSPACE
	 * =============
	 *
	 * Every sheet this person owns, and the forms to make, rename and delete
	 * one. `remove.for(id)` gives each card its own form instance, so a
	 * pending delete disables its own button and no other; the optimistic
	 * override takes the card off the screen before the server has answered,
	 * and a failure puts it back.
	 */
	const newSheet = create
		.preflight(
			v.object({
				title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Give it a title'), v.maxLength(120)),
				template: v.optional(v.string()),
				_doc: v.optional(v.string())
			})
		)
		.enhance(async (form) => {
			try {
				await form.submit();
			} catch (e) {
				toast((e as Error).message, 'error');
			}
		});

	const when = (ms: number) =>
		new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(ms)
		);
</script>

<svelte:head>
	<title>Your sheets — Abacus</title>
</svelte:head>

<div class="page">
	<Section eyebrow="Workspace" title="Your sheets">
		<form
			{...newSheet}
			class="newsheet card"
			oninput={() => create.validate()}
			onfocusout={() => create.validate()}
		>
			<label class="field">
				<span class="field__label">Title</span>
				<input class="input" {...create.fields.title.as('text')} placeholder="Untitled sheet" />
				{#each create.fields.title.issues() ?? [] as issue (issue.message)}
					<p class="issue">{issue.message}</p>
				{/each}
			</label>
			<label class="field">
				<span class="field__label">Start from</span>
				<select class="input" {...create.fields.template.as('select')}>
					<option value="">An empty sheet</option>
					{#each Object.values(TEMPLATES) as template (template.slug)}
						<option value={template.slug}>{template.title}</option>
					{/each}
				</select>
			</label>
			<button class="btn btn--primary" disabled={!!create.pending}>
				<PlusIcon size={16} /> New sheet
			</button>
		</form>

		<svelte:boundary>
			<ul class="cards">
				{#each await getMine() as sheet (sheet.id)}
					{@const del = remove.for(sheet.id)}
					{@const ren = rename.for(sheet.id)}
					<li class="card sheetcard">
						<a class="sheetcard__link" href="/sheet/{sheet.id}">
							<h3>{sheet.title}</h3>
							<p class="hint">
								{sheet.cellCount.toLocaleString()} cells · edited {when(sheet.updatedAt)}
								{#if sheet.published}· <span class="chip chip--on">published</span>{/if}
								{#if sheet.access === 'link'}· shared by link{/if}
							</p>
						</a>
						<div class="sheetcard__actions">
							<form {...ren} class="cluster">
								<input {...ren.fields.id.as('hidden', sheet.id)} />
								<input
									class="input input--sm"
									{...ren.fields.title.as('text', sheet.title)}
									aria-label="Rename {sheet.title}"
								/>
								<button class="btn btn--sm" disabled={!!ren.pending}>Rename</button>
							</form>
							<form
								{...del.enhance(async (f) => {
									if (!confirm(`Delete "${sheet.title}"? This cannot be undone.`)) return;
									try {
										await f
											.submit()
											.updates(
												getMine().withOverride((list) => list.filter((s) => s.id !== sheet.id))
											);
										toast('Deleted');
									} catch {
										toast('Could not delete that', 'error');
									}
								})}
							>
								<input {...del.fields.id.as('hidden', sheet.id)} />
								<button
									class="btn btn--sm btn--danger btn--icon"
									aria-label="Delete {sheet.title}"
									disabled={!!del.pending}
								>
									<TrashIcon size={16} />
								</button>
							</form>
						</div>
					</li>
				{:else}
					<li class="hint">
						No sheets yet. Make one above, or <a href="/sheet/local">start without saving</a>.
					</li>
				{/each}
			</ul>
			{#snippet pending()}
				<p class="hint">Loading your sheets…</p>
			{/snippet}
			{#snippet failed(error, reset)}
				<p class="issue">{(error as Error).message}</p>
				<button type="button" class="btn btn--sm" onclick={reset}>Try again</button>
			{/snippet}
		</svelte:boundary>
	</Section>
</div>

<style>
	.newsheet {
		display: grid;
		gap: var(--space-3);
		align-items: end;
	}

	.cards {
		display: grid;
		gap: var(--space-3);
		list-style: none;
		padding: 0;
	}

	.sheetcard {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.sheetcard__link {
		color: inherit;
		text-decoration: none;
	}

	.sheetcard__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}

	.input--sm {
		min-height: 2.25rem;
		max-width: 16rem;
	}

	@media (min-width: 40rem) {
		.newsheet {
			grid-template-columns: 1fr 1fr auto;
		}
		.cards {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
