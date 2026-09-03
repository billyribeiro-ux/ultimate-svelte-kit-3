<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';
	import { version } from '$app/env';
</script>

<footer class="footer">
	<div class="container cluster cluster--between">
		<p class="muted">{m.footer_made()} <code class="muted">{version}</code></p>
		<nav class="cluster" aria-label="Meta">
			<a class="muted" href={localizeHref('/guides')}>{m.nav_guides()}</a>
			<a class="muted" href={localizeHref('/diagnostics')}>{m.footer_diagnostics()}</a>
		</nav>
	</div>
</footer>

<style>
	.footer {
		margin-block-start: auto;
		padding-block: var(--space-6);
		border-top: 1px solid var(--line);
	}

	.footer a {
		text-decoration: none;
	}

	.footer a:hover {
		color: var(--ink);
	}
</style>
