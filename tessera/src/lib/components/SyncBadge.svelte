<script lang="ts">
	import type { SyncClient } from '#lib/sync/client.svelte.ts';
	import { requireMessages } from '#lib/i18n/context.ts';

	interface Props {
		sync: SyncClient;
	}

	let { sync }: Props = $props();

	const catalogue = requireMessages();
	const t = $derived(catalogue());

	/**
	 * Say what is true, not what is reassuring.
	 *
	 * A sync indicator that shows a tick whenever the last request succeeded is
	 * worse than none: people calibrate their trust against it, and the one time
	 * it matters — the tab that has been offline for an hour — it will still be
	 * showing the tick. `saving` and `offline` are distinct states here because
	 * they mean genuinely different things to somebody deciding whether to close
	 * their laptop.
	 */
	const label = $derived.by(() => {
		switch (sync.status) {
			case 'live':
				return t.sync.live;
			case 'saving':
				return t.sync.pending(sync.queued);
			case 'connecting':
				return t.sync.connecting;
			case 'offline':
				return sync.queued > 0 ? t.sync.pending(sync.queued) : t.sync.offline;
			case 'refused':
				return sync.refusal ?? t.sync.refused;
		}
	});
</script>

<!--
	`role="status"` and `aria-live="polite"`.

	The state changes on its own, without anybody acting, which is exactly the
	case a live region exists for. Polite rather than assertive: going offline is
	worth knowing and is not worth interrupting somebody mid-sentence.
-->
<p class="sync sync--{sync.status}" role="status" aria-live="polite">
	<span class="sync__dot" aria-hidden="true"></span>
	<span class="sync__label">{label}</span>
</p>

<style>
	.sync {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--fs-sm);
		color: var(--text-muted);
		min-width: 0;
	}

	.sync__label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sync__dot {
		width: 7px;
		height: 7px;
		border-radius: var(--radius-full);
		background: var(--text-faint);
		flex: none;
	}

	.sync--live .sync__dot {
		background: var(--good);
	}

	.sync--saving .sync__dot,
	.sync--connecting .sync__dot {
		background: var(--warn);
		animation: pulse 1.4s var(--ease-out) infinite;
	}

	.sync--offline .sync__dot {
		background: var(--text-faint);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--text-faint) 25%, transparent);
	}

	.sync--refused {
		color: var(--danger);
	}

	.sync--refused .sync__dot {
		background: var(--danger);
	}

	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}
</style>
