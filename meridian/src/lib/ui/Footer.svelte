<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import { version } from '$app/env';
</script>

<footer class="footer">
	<div class="container cluster cluster--between">
		<p class="muted">{m.footer_made()} <code class="muted">{version}</code></p>
		<nav class="cluster" aria-label="Meta">
			<a class="muted" href={href('/guides')}>{m.nav_guides()}</a>
			<a class="muted" href={href('/(site)/(app)/diagnostics')}>{m.footer_diagnostics()}</a>
		</nav>
	</div>
</footer>

<style>
	.footer {
		margin-block-start: auto;
		padding-block: var(--space-6);
		border-top: 1px solid var(--line);
	}

	/* Footer links are 44px rows on a phone: the smallest text on the page gets the biggest target. */
	.footer a {
		display: inline-flex;
		align-items: center;
		min-height: var(--control);
		text-decoration: none;
	}

	.footer a:hover {
		color: var(--ink);
	}
</style>
