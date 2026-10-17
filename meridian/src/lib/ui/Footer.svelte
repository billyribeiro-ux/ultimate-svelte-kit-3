<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import { version } from '$app/env';
</script>

<!--
	Product copy, not a build log. The version a deployment is running is on
	the diagnostics page, and here only as `data-version` — there for whoever
	opens the inspector, invisible to everybody else.
-->
<footer class="footer" data-version={version}>
	<div class="container cluster cluster--between">
		<p class="muted">{m.footer_made()}</p>
		<nav class="cluster footer__links" aria-label="Meta">
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

	/* The cluster's gap, not a tight 8px: two links that close read as one. */
	.footer__links {
		gap: var(--space-4);
	}
</style>
