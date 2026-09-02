<script lang="ts">
	import { ArrowRightIcon, CheckIcon, LockSimpleIcon } from 'phosphor-svelte';

	import Seo from '#lib/seo/Seo.svelte';
	import { breadcrumbSchema } from '#lib/seo/schema.ts';
	import { absoluteUrl } from '#lib/data/site.ts';
	import { getPerson } from '#lib/data/team.ts';
	import { resolve } from '$app/paths';

	import { requestGuide } from './guide.remote.ts';
	import { reveal, revealGroup } from '#lib/motion/index.ts';

	const pageUrl = absoluteUrl('/guide');
	const author = getPerson('priya-raman');

	const chapters = [
		'The options tape: what actually gets reported, and what never does',
		'Sweeps, blocks, splits and crosses — reading execution style',
		'Finding the aggressor: why fill price against the quote is everything',
		'Volume against open interest, and why fixed thresholds mislead you',
		'Multi-leg positions and how single-leg scanners misrepresent them',
		'Dealer gamma: the mechanics behind pinning and squeezes',
		'Dark pool prints and how they pair with the options tape',
		'A checklist for evaluating any flow alert in under sixty seconds'
	];

	const experienceOptions = [
		{ value: 'new', label: 'New to options' },
		{ value: 'some', label: 'I trade options occasionally' },
		{ value: 'experienced', label: 'I trade options regularly' },
		{ value: 'professional', label: 'I trade professionally' }
	];
</script>

<Seo
	title="Free guide — How to read options flow"
	description="A free primer on reading the options tape: sweeps and blocks, aggressor side, volume vs open interest, dealer gamma and dark pool prints. Eight chapters, no card required."
	schema={[
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'Free guide', path: '/guide' }
		])
	]}
/>

<section class="guide-hero">
	<div class="container container--wide">
		<div class="guide-hero__grid">
			<!-- ---------- Left: the pitch ---------- -->
			<div class="guide-hero__copy">
				<p class="eyebrow">Free download &middot; 8 chapters &middot; PDF</p>

				<h1 class="guide-hero__title">How to read options flow without fooling yourself</h1>

				<p class="lede">
					Most flow guides teach you to spot a big number and get excited. This one teaches you what
					the tape genuinely reports, what it cannot tell you, and the four checks that separate a
					meaningful print from noise.
				</p>

				<ul class="guide-hero__points" role="list">
					<li>
						<CheckIcon size={18} weight="bold" aria-hidden="true" />
						<span>Written by our head of research, not a copywriter</span>
					</li>
					<li>
						<CheckIcon size={18} weight="bold" aria-hidden="true" />
						<span>No upsell, no card, no webinar funnel</span>
					</li>
					<li>
						<CheckIcon size={18} weight="bold" aria-hidden="true" />
						<span>Unsubscribe in one click, and we mean it</span>
					</li>
				</ul>

				{#if author}
					<div class="guide-hero__author">
						<span class="guide-hero__avatar" aria-hidden="true">{author.initials}</span>
						<p>
							<strong
								>{author.name}{#if author.credentials}, {author.credentials}{/if}</strong
							><br />
							{author.role} — {author.bio}
						</p>
					</div>
				{/if}
			</div>

			<!-- ---------- Right: the form ---------- -->
			<div
				class="guide-hero__form-wrap"
				data-reveal
				{@attach reveal({ from: 'right', delay: 0.15, scale: true })}
			>
				<!--
					THE FORM.

					`{...requestGuide}` spreads the remote form's `action`, `method` and
					enhancement handler onto the element. Without JavaScript this is an
					ordinary POST that works; with JavaScript it submits in the background.
					You write it once and get both.
				-->
				<form {...requestGuide} class="signup" aria-labelledby="signup-heading">
					<h2 id="signup-heading" class="signup__title">Get the guide</h2>
					<p class="signup__sub">Enter your email and we'll send you straight to the download.</p>

					<!-- Email -->
					<div class="field">
						<label class="field__label" for="guide-email">Email address</label>
						<input
							id="guide-email"
							class="field__input"
							placeholder="you@example.com"
							autocomplete="email"
							{...requestGuide.fields.email.as('email')}
							aria-describedby={requestGuide.fields.email.issues()
								? 'guide-email-error'
								: undefined}
						/>
						{#if requestGuide.fields.email.issues()}
							<!--
								`role="alert"` makes a screen reader announce the message the
								moment it appears, rather than only when the user happens to
								navigate onto it.
							-->
							<p class="field__error" id="guide-email-error" role="alert">
								{#each requestGuide.fields.email.issues() ?? [] as issue (issue.message)}
									{issue.message}
								{/each}
							</p>
						{/if}
					</div>

					<!-- Experience -->
					<div class="field">
						<label class="field__label" for="guide-experience">Which best describes you?</label>
						<!--
							`defaultValue=""` says what a reset goes back to.

							This form resets after a successful submission, and the placeholder
							is what it must return to — otherwise the next person starts on a
							real answer they never gave.

							The `<option value="" disabled selected>` this replaced also worked:
							a literal `selected` attribute *is* `defaultSelected`, which is what
							a reset restores. What changed is where the fact lives. The value
							comes from `fields.as('select')`, which sets the select's value
							property and marks no option at all, so the reset target was an
							attribute on one option that had to stay in step with a value set
							somewhere else. `defaultValue`, added to `<select>` in Svelte 5.57,
							puts it next to the value — one place, one thing to be wrong.
						-->
						<select
							id="guide-experience"
							class="field__input field__select"
							{...requestGuide.fields.experience.as('select')}
							defaultValue=""
							aria-describedby={requestGuide.fields.experience.issues()
								? 'guide-experience-error'
								: undefined}
						>
							<option value="" disabled>Choose one…</option>
							{#each experienceOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						{#if requestGuide.fields.experience.issues()}
							<p class="field__error" id="guide-experience-error" role="alert">
								{#each requestGuide.fields.experience.issues() ?? [] as issue (issue.message)}
									{issue.message}
								{/each}
							</p>
						{/if}
					</div>

					<!-- Consent -->
					<div class="field field--checkbox">
						<input
							id="guide-consent"
							class="field__checkbox"
							{...requestGuide.fields.consent.as('checkbox')}
							aria-describedby={requestGuide.fields.consent.issues()
								? 'guide-consent-error'
								: undefined}
						/>
						<label class="field__consent-label" for="guide-consent">
							Email me the guide and occasional research notes. I can unsubscribe at any time.
						</label>
					</div>
					{#if requestGuide.fields.consent.issues()}
						<p class="field__error" id="guide-consent-error" role="alert">
							{#each requestGuide.fields.consent.issues() ?? [] as issue (issue.message)}
								{issue.message}
							{/each}
						</p>
					{/if}

					<!--
						HONEYPOT.

						Hidden three ways on purpose:
						  - `.honeypot` moves it off-screen (NOT `display:none` — some bots
						    skip fields that are display:none, which defeats the trap)
						  - `tabindex="-1"` keeps keyboard users from ever landing on it
						  - `aria-hidden="true"` keeps screen readers from announcing it
						  - `autocomplete="off"` stops a password manager filling it in and
						    accidentally flagging a real person as a bot

						That last one is the detail people miss, and it silently rejects
						genuine signups.
					-->
					<div class="honeypot" aria-hidden="true">
						<label for="guide-company">Company (leave this empty)</label>
						<input
							id="guide-company"
							tabindex="-1"
							autocomplete="off"
							{...requestGuide.fields._company.as('text')}
						/>
					</div>

					<!--
						`requestGuide.pending` is a counter of in-flight submissions. Disabling
						while it's non-zero prevents the double-submit you get from an impatient
						double-click on a slow connection.
					-->
					<button class="signup__submit" type="submit" disabled={requestGuide.pending > 0}>
						{#if requestGuide.pending > 0}
							Sending…
						{:else}
							Send me the guide
							<ArrowRightIcon size={18} aria-hidden="true" />
						{/if}
					</button>

					<p class="signup__privacy">
						<LockSimpleIcon size={14} aria-hidden="true" />
						<span>
							We never sell or share your address. See our
							<a href={resolve('/legal/privacy')}>privacy policy</a>.
						</span>
					</p>
				</form>
			</div>
		</div>
	</div>
</section>

<section class="section contents" aria-labelledby="contents-heading">
	<div class="container container--narrow">
		<h2 id="contents-heading">What's inside</h2>
		<ol class="contents__list" {@attach revealGroup('.contents__item', { staggerAmount: 0.05 })}>
			{#each chapters as chapter, index (chapter)}
				<li class="contents__item">
					<span class="contents__number tabular" aria-hidden="true">
						{String(index + 1).padStart(2, '0')}
					</span>
					<span>{chapter}</span>
				</li>
			{/each}
		</ol>
	</div>
</section>

<style>
	.guide-hero {
		padding-block: calc(var(--header-height) + var(--space-10)) var(--section-y);
		background:
			radial-gradient(
				70% 60% at 80% -10%,
				color-mix(in srgb, var(--brand-500) 16%, transparent),
				transparent 70%
			),
			var(--bg-root);
	}

	.guide-hero__grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-10);
	}

	.guide-hero__title {
		font-size: var(--fs-3xl);
		margin-block: var(--space-4);
		max-width: 18ch;
	}

	.guide-hero__points {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-block-start: var(--space-6);
	}

	.guide-hero__points li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		font-size: var(--fs-sm);
		color: var(--text-secondary);
		margin: 0;
		max-width: none;
	}

	.guide-hero__points :global(svg) {
		color: var(--bull);
		flex-shrink: 0;
		margin-block-start: 0.15em;
	}

	.guide-hero__author {
		display: flex;
		gap: var(--space-4);
		margin-block-start: var(--space-8);
		padding-block-start: var(--space-6);
		border-top: 1px solid var(--border);
	}

	.guide-hero__avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background-color: color-mix(in srgb, var(--brand-500) 18%, transparent);
		color: var(--brand-300);
		font-family: var(--font-heading);
		font-weight: var(--weight-bold);
		font-size: var(--fs-xs);
	}

	.guide-hero__author p {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		line-height: var(--lh-normal);
	}

	/* ---------------------------------------------------------------
	 * FORM
	 * --------------------------------------------------------------- */
	.signup {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-6);
		border: 1px solid var(--border-brand);
		border-radius: var(--radius-xl);
		background-color: var(--surface-raised);
		box-shadow: var(--shadow-lg);
	}

	.signup__title {
		font-size: var(--fs-xl);
	}

	.signup__sub {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-block-start: calc(var(--space-3) * -1);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.field__label {
		font-family: var(--font-heading);
		font-size: var(--fs-sm);
		font-weight: var(--weight-semibold);
		color: var(--text-primary);
	}

	.field__input {
		width: 100%;
		/* 3rem tall — comfortably above the 44px touch minimum. */
		min-height: 3rem;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background-color: var(--surface-inset);
		color: var(--text-primary);
		/*
		 * 16px minimum on mobile.
		 *
		 * iOS Safari automatically zooms the page when you focus an input whose
		 * font-size is under 16px, and it does not zoom back out. Users experience
		 * this as the site "breaking" when they tap a field. `--fs-base` is 1rem,
		 * which clears the threshold.
		 */
		font-size: var(--fs-base);
		transition:
			border-color var(--dur-fast) var(--ease-out),
			background-color var(--dur-fast) var(--ease-out);
	}

	.field__input::placeholder {
		color: var(--text-muted);
	}

	.field__input:focus {
		border-color: var(--accent);
		background-color: var(--surface);
	}

	/* `aria-invalid` is set for us by `field.as(...)`, so the error styling is
	   driven by the same attribute assistive tech reads. One source of truth. */
	.field__input[aria-invalid='true'] {
		border-color: var(--bear);
	}

	.field__select {
		appearance: none;
		/* Room for the custom arrow drawn by the background gradient below. */
		padding-inline-end: var(--space-10);
		background-image:
			linear-gradient(45deg, transparent 50%, var(--text-muted) 50%),
			linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);
		background-position:
			calc(100% - 1.15rem) calc(50% + 2px),
			calc(100% - 0.8rem) calc(50% + 2px);
		background-size:
			6px 6px,
			6px 6px;
		background-repeat: no-repeat;
	}

	.field--checkbox {
		flex-direction: row;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.field__checkbox {
		/* Fixed size — a checkbox that inherits font-size ends up tiny and unhittable. */
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
		margin-block-start: 0.15rem;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.field__consent-label {
		font-size: var(--fs-sm);
		color: var(--text-secondary);
		line-height: var(--lh-normal);
		cursor: pointer;
	}

	.field__error {
		font-size: var(--fs-sm);
		color: var(--bear-400);
		max-width: none;
	}

	/*
	 * The honeypot.
	 *
	 * Positioned off-screen rather than `display: none`. Sophisticated bots skip
	 * fields that are display:none precisely because they know it's a trap; moving
	 * it out of the viewport is far less detectable.
	 */
	.honeypot {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}

	.signup__submit {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: 3.25rem;
		margin-block-start: var(--space-2);
		padding: var(--space-4) var(--space-6);
		border-radius: var(--radius-md);
		background-color: var(--accent);
		color: var(--accent-contrast);
		font-family: var(--font-heading);
		font-size: var(--fs-base);
		font-weight: var(--weight-semibold);
		transition: background-color var(--dur-fast) var(--ease-out);
	}

	@media (hover: hover) {
		.signup__submit:hover:not(:disabled) {
			background-color: var(--accent-hover);
		}
	}

	.signup__submit:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.signup__privacy {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		font-size: var(--fs-xs);
		color: var(--text-muted);
		max-width: none;
	}

	.signup__privacy :global(svg) {
		flex-shrink: 0;
		margin-block-start: 0.15em;
	}

	/* ---------------------------------------------------------------
	 * CONTENTS
	 * --------------------------------------------------------------- */
	.contents {
		border-top: 1px solid var(--border);
	}

	.contents__list {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin-block-start: var(--space-8);
		padding: 0;
		list-style: none;
	}

	.contents__item {
		display: flex;
		gap: var(--space-4);
		padding-block-end: var(--space-4);
		border-bottom: 1px solid var(--border);
		color: var(--text-secondary);
		margin: 0;
		max-width: none;
	}

	.contents__number {
		font-family: var(--font-heading);
		font-weight: var(--weight-bold);
		color: var(--brand-400);
		flex-shrink: 0;
	}

	@media (min-width: 48em) {
		.signup {
			padding: var(--space-8);
		}
	}

	@media (min-width: 64em) {
		.guide-hero__grid {
			flex-direction: row;
			align-items: flex-start;
			gap: var(--space-16);
		}

		.guide-hero__copy {
			flex: 1 1 52%;
		}

		.guide-hero__form-wrap {
			flex: 1 1 48%;
			/* Keeps the form in view while the user reads the long pitch beside it. */
			position: sticky;
			top: calc(var(--header-height) + var(--space-6));
		}
	}
</style>
