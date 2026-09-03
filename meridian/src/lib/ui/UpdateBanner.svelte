<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
</script>

<!--
	Shown when `updated.current` is true: a new build has been deployed since
	this page loaded. The link is a plain reload; there is nothing to save
	that the server does not already have.
-->
<div class="update" role="status">
	<span>{m.update_available()}</span>
	<button class="btn btn--sm btn--primary" type="button" onclick={() => location.reload()}>
		{m.update_reload()}
	</button>
</div>

<style>
	.update {
		position: fixed;
		inset-inline: var(--space-4);
		bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
		z-index: 40;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		background: var(--ink);
		color: var(--paper);
		box-shadow: var(--shadow-3);
		font-size: var(--text-sm);
	}

	@media (min-width: 40em) {
		.update {
			inset-inline: auto;
			right: var(--space-5);
			max-width: 26rem;
		}
	}
</style>
