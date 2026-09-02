<script lang="ts">
	import * as v from 'valibot';
	import { KeyIcon, SignOutIcon, TrashIcon } from 'phosphor-svelte';
	import Section from '#lib/components/Section.svelte';
	import { explain, registerPasskey } from '#lib/auth/passkey.ts';
	import {
		getProfile,
		listPasskeys,
		removePasskey,
		signOut,
		updateProfile
	} from '#lib/remote/auth.remote.ts';
	import { toast } from '#lib/toast/toast.ts';

	/**
	 * SETTINGS
	 * ========
	 *
	 * The profile — name and locale — and the passkeys. Locale is the one
	 * that changes what the sheets show: `de-DE` and the same numbers are
	 * written `1.234,56`. Every write here is a form; `preflight` says
	 * "two characters at least" on the keystroke.
	 */
	const profile = updateProfile
		.preflight(
			v.object({
				name: v.pipe(
					v.string(),
					v.trim(),
					v.minLength(2, 'Two characters at least'),
					v.maxLength(40)
				),
				locale: v.pipe(
					v.string(),
					v.regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?(-[A-Z]{2})?$/, 'A locale like en-US or de-DE')
				)
			})
		)
		.enhance(async (form) => {
			try {
				if (await form.submit()) toast('Saved');
			} catch (e) {
				toast((e as Error).message, 'error');
			}
		});

	let adding = $state(false);
	async function addPasskey(name: string) {
		adding = true;
		try {
			await registerPasskey(name);
			toast('Passkey added');
		} catch (e) {
			toast(explain(e), 'error');
		} finally {
			adding = false;
		}
	}

	const locales = [
		'en-US',
		'en-GB',
		'de-DE',
		'fr-FR',
		'es-ES',
		'pt-BR',
		'ja-JP',
		'de-CH',
		'nl-NL',
		'sv-SE'
	];
	const when = (ms: number | null) =>
		ms === null
			? 'never'
			: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(ms));
</script>

<svelte:head>
	<title>Settings — Abacus</title>
</svelte:head>

<div class="page">
	<svelte:boundary>
		{const me = $derived(await getProfile())}
		{#if me}
			<Section eyebrow="Profile" title={me.name}>
				<form
					{...profile}
					class="card stack"
					oninput={() => updateProfile.validate()}
					onfocusout={() => updateProfile.validate()}
				>
					<label class="field">
						<span class="field__label">Name</span>
						<input
							class="input"
							{...updateProfile.fields.name.as('text', me.name)}
							autocomplete="name"
						/>
						{#each updateProfile.fields.name.issues() ?? [] as issue (issue.message)}
							<p class="issue">{issue.message}</p>
						{/each}
					</label>
					<label class="field">
						<span class="field__label">Numbers and dates as in</span>
						<select class="input" {...updateProfile.fields.locale.as('select')} value={me.locale}>
							{#each locales as locale (locale)}
								<option value={locale}
									>{locale} — {new Intl.NumberFormat(locale).format(1234567.89)}</option
								>
							{/each}
						</select>
						{#each updateProfile.fields.locale.issues() ?? [] as issue (issue.message)}
							<p class="issue">{issue.message}</p>
						{/each}
					</label>
					<div class="cluster">
						<button class="btn btn--primary" disabled={!!updateProfile.pending}>Save</button>
					</div>
				</form>
			</Section>

			<Section eyebrow="Passkeys" title="Your passkeys">
				<svelte:boundary>
					<ul class="keys">
						{#each await listPasskeys() as passkey (passkey.id)}
							{@const del = removePasskey.for(passkey.id)}
							<li class="card key">
								<KeyIcon size={20} />
								<div class="key__body">
									<strong>{passkey.label}</strong>
									<span class="hint">
										{passkey.deviceType === 'multiDevice' ? 'Synced passkey' : 'This device only'}
										{passkey.backedUp ? '· backed up' : ''} · added {when(passkey.createdAt)} · last used
										{when(passkey.lastUsedAt)}
									</span>
								</div>
								<form
									{...del.enhance(async (f) => {
										try {
											await f.submit();
											toast('Passkey removed');
										} catch (e) {
											toast((e as Error).message, 'error');
										}
									})}
								>
									<input {...del.fields.id.as('hidden', passkey.id)} />
									<button
										class="btn btn--sm btn--icon btn--danger"
										aria-label="Remove {passkey.label}"
										disabled={!!del.pending}
									>
										<TrashIcon size={16} />
									</button>
								</form>
							</li>
						{/each}
					</ul>
					{#snippet pending()}
						<p class="hint">Loading…</p>
					{/snippet}
				</svelte:boundary>
				<div class="cluster">
					<button type="button" class="btn" onclick={() => addPasskey(me.name)} disabled={adding}>
						<KeyIcon size={16} />
						{adding ? 'Waiting for your device…' : 'Add a passkey on this device'}
					</button>
					<form {...signOut}>
						<button class="btn btn--ghost" disabled={!!signOut.pending}
							><SignOutIcon size={16} /> Sign out</button
						>
					</form>
				</div>
			</Section>
		{/if}
		{#snippet pending()}
			<p class="hint">Loading…</p>
		{/snippet}
	</svelte:boundary>
</div>

<style>
	.keys {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		list-style: none;
		padding: 0;
	}

	.key {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.key__body {
		display: flex;
		flex: 1;
		flex-direction: column;
	}
</style>
