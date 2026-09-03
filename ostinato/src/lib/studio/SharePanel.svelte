<script lang="ts">
	import { fork, type Fork } from 'svelte';
	import { page } from '$app/state';
	import * as v from 'valibot';
	import { CopyIcon, DownloadSimpleIcon, PauseIcon, PlayIcon } from 'phosphor-svelte';
	import { getStudio } from '#lib/audio/context.ts';
	import { bufferToWav, renderPattern } from '#lib/audio/render.ts';
	import { HandleSchema } from '#lib/handle.ts';
	import { toDto } from '#lib/pattern/dto.ts';
	import { whoAmI } from '#lib/remote/artist.remote.ts';
	import { publish } from '#lib/remote/patterns.remote.ts';
	import { toast } from '#lib/toast/toast.ts';
	import type { Session } from './session.svelte.ts';

	/**
	 * SHARE
	 * =====
	 *
	 * Three ways out of the studio: a link that *is* the pattern, a WAV file,
	 * and publishing to the gallery. Each is a small lesson in something
	 * Svelte does — and the panel is opened by a hover, which is the fourth.
	 */
	let { session }: { session: Session } = $props();

	const { samples } = getStudio();

	/* ---------------------------------------------------------------- */
	/* The link                                                          */
	/* ---------------------------------------------------------------- */

	const link = $derived.by(() => {
		const url = new URL('/studio', page.url.origin);
		url.searchParams.set('p', session.encoded);
		return url.href;
	});

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast('Copied');
		} catch {
			toast('Could not copy — select the text and copy it by hand', 'error');
		}
	}

	/* ---------------------------------------------------------------- */
	/* The WAV                                                           */
	/* ---------------------------------------------------------------- */

	let bars = $state(2);
	let wanted = $state(false);

	/**
	 * FORK: START THE WORK BEFORE THE CLICK
	 * -------------------------------------
	 * Rendering two bars takes a few hundred milliseconds. `fork` runs a state
	 * change — `wanted = true` — *speculatively*: the `await` it unlocks in the
	 * markup below starts immediately, but nothing is shown until the fork is
	 * committed. Hover or focus the button and the render begins; click and it
	 * is already half done; leave and it is discarded, which it must be, or
	 * the work leaks.
	 */
	let pending: Fork | null = null;

	function preload() {
		pending ??= fork(() => {
			wanted = true;
		});
	}

	function discard() {
		pending?.discard();
		pending = null;
	}

	function commit() {
		pending?.commit();
		pending = null;
		wanted = true;
	}

	let objectUrl: string | null = null;

	async function render(count: number): Promise<{ url: string; kilobytes: number }> {
		const buffer = await renderPattern(session.snapshot(), {
			bars: count,
			samples: (id) => samples.get(id)
		});
		const blob = bufferToWav(buffer);
		if (objectUrl) URL.revokeObjectURL(objectUrl);
		objectUrl = URL.createObjectURL(blob);
		return { url: objectUrl, kilobytes: Math.round(blob.size / 1024) };
	}

	$effect(() => () => {
		if (objectUrl) URL.revokeObjectURL(objectUrl);
	});

	/* `bind:paused`, `bind:currentTime`, `bind:duration` on the <audio> below. */
	let paused = $state(true);
	let currentTime = $state(0);
	let duration = $state(0);

	const clock = (seconds: number) =>
		`${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

	/* ---------------------------------------------------------------- */
	/* Publishing                                                        */
	/* ---------------------------------------------------------------- */

	/**
	 * The pattern travels as JSON in a hidden field. Deriving the value keeps
	 * the field current with every edit, so a submission with JavaScript off
	 * still sends what is on screen.
	 */
	const json = $derived(JSON.stringify(toDto(session.snapshot())));

	/**
	 * Preflight: the two fields a person types, checked in the browser before
	 * anything is sent. The server checks everything again; this is what makes
	 * "three to twenty characters" appear on the keystroke instead of after a
	 * round trip.
	 */
	const preflight = v.object({
		handle: HandleSchema,
		title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Give it a title'), v.maxLength(60)),
		// The rest of the form's fields, typed but not checked: a preflight
		// schema describes the whole input, and these are the server's to judge.
		_pattern: v.string(),
		remixOf: v.optional(v.string()),
		action: v.picklist(['stay', 'open'])
	});

	const form = publish.preflight(preflight).enhance(async (f) => {
		try {
			// `submit()` resolves `true` on success; the handler's return value is
			// then on `publish.result`, where the template reads it too.
			if (await f.submit()) {
				session.markSaved();
				toast(`Published as ${publish.result?.url ?? 'a new pattern'}`);
			}
		} catch {
			toast('Publishing failed — try again in a moment', 'error');
		}
	});
</script>

<div class="share stack">
	<section class="stack">
		<h3>Link</h3>
		<p class="hint">
			The whole pattern is in the address. Anyone who opens it gets a copy to play with.
		</p>
		<div class="linkrow">
			<input
				class="input mono"
				readonly
				value={link}
				aria-label="Share link"
				onfocus={(e) => e.currentTarget.select()}
			/>
			<button type="button" class="btn btn--icon" aria-label="Copy link" onclick={() => copy(link)}>
				<CopyIcon size={18} />
			</button>
		</div>
	</section>

	<section class="stack">
		<h3>Export</h3>
		<label class="field">
			<span class="field__label">Bars</span>
			<!--
				`defaultValue` on a select (Svelte 5.57): the value it starts at and
				returns to on reset, with the element otherwise uncontrolled. The
				change handler is the only thing that reads it.
			-->
			<select
				class="input"
				defaultValue="2"
				onchange={(e) => (bars = Number(e.currentTarget.value))}
			>
				<option value="1">1 bar</option>
				<option value="2">2 bars</option>
				<option value="4">4 bars</option>
			</select>
		</label>

		{#if !wanted}
			<button
				type="button"
				class="btn"
				onpointerenter={preload}
				onpointerleave={discard}
				onfocusin={preload}
				onfocusout={discard}
				onclick={commit}
			>
				<DownloadSimpleIcon size={16} /> Render to WAV
			</button>
		{:else}
			<svelte:boundary>
				{const rendered = $derived(await render(bars))}

				<!--
					`$effect.pending()` counts the `await`s in flight in this boundary
					*after* the first render — changing the bar count re-renders, and
					this is what says so while it happens.
				-->
				{#if $effect.pending()}
					<p class="hint" role="status">Re-rendering {bars} bars…</p>
				{/if}

				<div class="player">
					<audio src={rendered.url} bind:paused bind:currentTime bind:duration preload="metadata"
					></audio>
					<button
						type="button"
						class="btn btn--icon"
						aria-label={paused ? 'Play' : 'Pause'}
						onclick={() => (paused = !paused)}
					>
						{#if paused}<PlayIcon size={18} weight="fill" />{:else}<PauseIcon
								size={18}
								weight="fill"
							/>{/if}
					</button>
					<span class="mono">{clock(currentTime)} / {clock(duration)}</span>
					<a class="btn btn--primary" href={rendered.url} download="{session.pattern.title}.wav">
						<DownloadSimpleIcon size={16} /> Download ({rendered.kilobytes} KB)
					</a>
				</div>

				{#snippet pending()}
					<p class="hint" role="status">Rendering {bars} bars…</p>
				{/snippet}

				{#snippet failed(error, reset)}
					<p class="issue">Rendering failed: {(error as Error).message}</p>
					<button type="button" class="btn btn--sm" onclick={reset}>Try again</button>
				{/snippet}
			</svelte:boundary>
		{/if}
	</section>

	<section class="stack">
		<h3>Publish</h3>
		<p class="hint">
			Choose a handle once; this browser keeps it. There is no password — the first browser to claim
			a handle owns it.
		</p>

		<!--
			Validate on every keystroke *and* on blur. SvelteKit only reports issues
			for fields a person has finished with — it marks a field touched on
			`focusout` — so the blur is what turns "three to twenty characters"
			from a rule into a message under the field.
		-->
		<form
			{...form}
			class="stack"
			oninput={() => publish.validate()}
			onfocusout={() => publish.validate()}
		>
			<label class="field">
				<span class="field__label">Handle</span>
				<!-- The handle this browser already has, if any, as the field's starting value. -->
				<svelte:boundary>
					{const me = $derived(await whoAmI())}
					<input
						class="input"
						{...publish.fields.handle.as('text', me?.handle ?? '')}
						placeholder="yourname"
						autocomplete="username"
					/>
					{#snippet pending()}
						<input class="input" placeholder="yourname" disabled />
					{/snippet}
				</svelte:boundary>
				{#each publish.fields.handle.issues() ?? [] as issue (issue.message)}
					<p class="issue">{issue.message}</p>
				{/each}
			</label>

			<label class="field">
				<span class="field__label">Title</span>
				<input class="input" {...publish.fields.title.as('text', session.pattern.title)} />
				{#each publish.fields.title.issues() ?? [] as issue (issue.message)}
					<p class="issue">{issue.message}</p>
				{/each}
			</label>

			<input {...publish.fields._pattern.as('hidden', json)} />
			{#if session.remixOf}
				<input {...publish.fields.remixOf.as('hidden', session.remixOf)} />
				<p class="hint">Published as a remix of <code>{session.remixOf}</code>.</p>
			{/if}

			{#each publish.fields.allIssues() ?? [] as issue (issue.message)}
				{#if !issue.path?.length}
					<p class="issue">{issue.message}</p>
				{/if}
			{/each}

			<div class="cluster">
				<button
					class="btn btn--primary"
					{...publish.fields.action.as('submit', 'stay')}
					disabled={!!publish.pending}
				>
					Publish
				</button>
				<button
					class="btn"
					{...publish.fields.action.as('submit', 'open')}
					disabled={!!publish.pending}
				>
					Publish and open
				</button>
			</div>
		</form>

		{#if publish.result}
			<div class="stack published">
				<p>
					Live at <a href={publish.result.url}>{publish.result.url}</a>
					<button
						type="button"
						class="btn btn--sm btn--ghost"
						onclick={() => copy(new URL(publish.result!.url, page.url.origin).href)}
					>
						Copy
					</button>
				</p>
				<img
					class="card-preview"
					src="/p/{publish.result.id}/card.svg"
					alt="Share card for {session.pattern.title}"
				/>
			</div>
		{/if}
	</section>
</div>

<style>
	h3 {
		font-size: var(--fs-md);
	}

	.linkrow {
		display: flex;
		gap: var(--space-2);
	}

	.player {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.card-preview {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
</style>
