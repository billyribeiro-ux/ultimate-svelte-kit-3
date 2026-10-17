<script lang="ts">
	import { goto } from '$app/navigation';
	import { match, resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { ResolvedPathname } from '$app/types';
	import { FingerprintIcon, KeyIcon } from 'phosphor-svelte';
	import Section from '#lib/components/Section.svelte';
	import {
		explain,
		passkeysSupported,
		registerPasskey,
		signInWithPasskey
	} from '#lib/auth/passkey.ts';
	import { toast } from '#lib/toast/toast.ts';

	/**
	 * SIGN IN
	 * =======
	 *
	 * Two buttons and a name field. There is no password to type, remember
	 * or reset; the passkey is the account. Both ceremonies run in the
	 * browser's own credential prompt — the sheet-shaped dialog on a phone,
	 * the Touch ID prompt on a Mac — and this page only starts them and
	 * reads the result.
	 */
	let name = $state('');
	let busy = $state<'register' | 'signin' | null>(null);

	/** Where to go afterwards: a path on this site, never somewhere else. */
	const next = $derived.by(() => {
		const wanted = page.url.searchParams.get('next') ?? '/sheets';
		return wanted.startsWith('/') && !wanted.startsWith('//') ? wanted : '/sheets';
	});

	/**
	 * `?next=` is a string somebody else wrote. SvelteKit 3's `goto` rejects a
	 * URL that is not one of this app's routes — right for a typo in code,
	 * wrong for a stale bookmark, which should land somewhere rather than in a
	 * rejected promise. `match()` asks the router (the server, under
	 * `resolution: 'server'`) whether `next` is a route. If it is, `next` *is*
	 * a `ResolvedPathname` — a pathname of this app, base path included —
	 * and the cast states what `match` just established, which is also the
	 * type eslint-plugin-svelte's `no-navigation-without-resolve` accepts.
	 * If not, the workspace is the sensible place to arrive.
	 */
	async function leave() {
		const target = (await match(next)) ? (next as ResolvedPathname) : resolve('/(app)/sheets');
		await goto(target);
	}

	async function register(event: SubmitEvent) {
		event.preventDefault();
		busy = 'register';
		try {
			const user = await registerPasskey(name);
			toast(`Welcome, ${user.name}`);
			await leave();
		} catch (e) {
			toast(explain(e), 'error');
		} finally {
			busy = null;
		}
	}

	async function signIn() {
		busy = 'signin';
		try {
			const user = await signInWithPasskey();
			toast(`Welcome back, ${user.name}`);
			await leave();
		} catch (e) {
			toast(explain(e), 'error');
		} finally {
			busy = null;
		}
	}
</script>

<svelte:head>
	<title>Sign in — Abacus</title>
</svelte:head>

<div class="page">
	<Section eyebrow="Passkeys" title="Sign in without a password">
		<div class="panels">
			<div class="card stack">
				<h3>Already have a passkey here?</h3>
				<p class="hint">Your browser will show the accounts it knows for this site.</p>
				<button
					type="button"
					class="btn btn--primary btn--lg"
					onclick={signIn}
					disabled={busy !== null}
				>
					<FingerprintIcon size={20} />
					{busy === 'signin' ? 'Waiting for your device…' : 'Sign in with a passkey'}
				</button>
			</div>

			<form class="card stack" onsubmit={register}>
				<h3>New here?</h3>
				<label class="field">
					<span class="field__label">What should we call you?</span>
					<input
						class="input"
						bind:value={name}
						minlength="2"
						maxlength="40"
						required
						autocomplete="name"
						placeholder="Ada"
					/>
				</label>
				<button class="btn btn--lg" disabled={busy !== null || name.trim().length < 2}>
					<KeyIcon size={20} />
					{busy === 'register' ? 'Waiting for your device…' : 'Create a passkey'}
				</button>
				<p class="hint">
					A passkey is a key pair your device keeps. The private half never leaves it; we store only
					the public half. Losing every device means losing the account — add a second passkey in
					settings.
				</p>
			</form>
		</div>

		{#if !passkeysSupported()}
			<p class="issue">
				This browser does not support passkeys. Try a current Chrome, Safari, Edge or Firefox.
			</p>
		{/if}
	</Section>
</div>

<style>
	.panels {
		display: grid;
		gap: var(--space-4);
	}

	@media (min-width: 40rem) {
		.panels {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
