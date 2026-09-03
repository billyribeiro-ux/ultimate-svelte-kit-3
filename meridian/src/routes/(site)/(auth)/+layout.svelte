<script lang="ts">
	let { children } = $props();
</script>

<!-- One centred card for both sign-in and sign-up; the pages own the form. -->
<div class="auth container">
	{@render children()}
</div>

<style>
	.auth {
		display: grid;
		place-items: center;
		padding-block: var(--space-7);
		max-width: 28rem;
	}

	.auth > :global(*) {
		width: 100%;
	}
</style>
