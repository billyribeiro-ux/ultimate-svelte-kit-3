/**
 * PART 6 — Motion, testing and shipping (chapters 30–35)
 *
 * The last third: making it feel good, proving it works, checking nobody can
 * take anything they should not, and getting it onto a server.
 */

export const part6 = [
	{
		slug: 'motion-with-a-job',
		title: 'Motion with a job',
		summary:
			'GSAP loaded on demand, gated on reduced motion, and used only where movement carries information.',
		goal: 'Animation that makes the app easier to follow, and disappears entirely for anyone who asked it to.',
		blocks: [
			{
				type: 'p',
				text: 'There are two kinds of animation in software. One tells you what happened. The other tells you somebody had a budget for animation.'
			},
			{
				type: 'p',
				text: 'Halfpast has four, and each answers a question a person would otherwise have to ask out loud.'
			},
			{
				type: 'ul',
				items: [
					'**The details form sliding in** — "something happened when I picked a time".',
					'**Slots moving in the grid (FLIP)** — "that time is gone; the others have shifted".',
					'**A new appointment easing into the diary** — "this one is new since you last looked".',
					'**Page content settling on arrival** — "the page is ready, start reading here".'
				]
			},

			{ type: 'h3', id: 'gate', text: 'The gate comes first' },
			{
				type: 'code',
				file: 'src/lib/motion/gsap.ts',
				lang: 'ts',
				code: `
/** Whether the visitor has asked for less movement. Re-read, never cached. */
export function prefersReducedMotion(): boolean {
	if (!browser) return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let pending: Promise<Motion | null> | null = null;

export function loadMotion(): Promise<Motion | null> {
	if (!browser || prefersReducedMotion()) return Promise.resolve(null);

	// Memoised, so twenty components mounting at once produce one network
	// request rather than twenty.
	pending ??= (async () => {
		try {
			const [{ gsap }, { Flip }] = await Promise.all([import('gsap'), import('gsap/Flip')]);

			gsap.registerPlugin(Flip);

			// GSAP's default is a gentle ease-out over half a second: reasonable for
			// a marketing page, too slow for a tool somebody uses forty times a day.
			// These match the CSS tokens so a GSAP transition and a CSS one feel
			// like the same system.
			gsap.defaults({ duration: 0.35, ease: 'power3.out' });

			return { gsap, Flip };
		} catch (thrown) {
			// A blocked or failed chunk must not take the page with it.
			console.warn('[motion] GSAP failed to load; continuing without animation', thrown);
			return null;
		}
	})();

	return pending;
}`
			},
			{
				type: 'p',
				text: 'Four things are happening. Somebody who has asked for reduced motion gets no animation **and never downloads the library**, because the dynamic `import()` sits behind the guard. The `import()` is also what tells the bundler to split GSAP into its own chunk, so first paint never waits for an animation library. The promise is memoised. And a failed chunk resolves to `null` rather than throwing, so a script blocker leaves the page still rather than broken.'
			},
			{
				type: 'warn',
				text: 'Reduced motion is not a preference for "less fun". For people with vestibular disorders, motion on a screen causes genuine nausea and dizziness. Treating it as a decorative toggle is the same category of mistake as treating a wheelchair ramp as a design feature.'
			},

			{ type: 'h3', id: 'attachments', text: 'Attachments, not actions' },
			{
				type: 'code',
				file: 'src/lib/motion/attachments.ts',
				lang: 'ts',
				code: `
export function reveal(options: RevealOptions = {}): Attachment<HTMLElement> {
	const { y = 16, duration = 0.55, delay = 0, threshold = 0.15 } = options;

	return (node) => {
		let cancelled = false;
		let observer: IntersectionObserver | undefined;

		void loadMotion().then((motion) => {
			if (!motion || cancelled) return;

			const { gsap } = motion;

			// \`from\` rather than \`fromTo\`: the element's real state is the end state,
			// so GSAP animates *towards* the DOM rather than towards a value we
			// wrote down. If this tween never runs, the element is already correct.
			const play = () => {
				gsap.from(node, {
					opacity: 0,
					y,
					duration,
					delay,
					ease: 'power3.out',
					// Removes the inline transform when finished, so the element goes
					// back to being laid out by CSS rather than pinned by a matrix.
					clearProps: 'transform,opacity'
				});
			};

			observer = new IntersectionObserver(/* … play once, then disconnect … */);
			observer.observe(node);
		});

		return () => {
			// The element may be removed while GSAP is still loading.
			cancelled = true;
			observer?.disconnect();
		};
	};
}`
			},
			{
				type: 'code',
				file: 'using it',
				lang: 'svelte',
				code: `
<section class="details" {@attach reveal({ y: 16 })}>`
			},
			{
				type: 'p',
				text: '`{@attach}` replaces `use:`. The difference that matters here: an attachment is a plain function you can compose, parameterise and return from another function, and its teardown is just the returned closure.'
			},
			{
				type: 'p',
				text: 'Two details in that code are the difference between an animation and a bug. `gsap.from` animates **towards** the DOM\'s real state, so if the tween never runs — blocked script, failed chunk, reduced motion — the element is already where it belongs. The opposite pattern (hide it in CSS, reveal it with JavaScript) means a failed script leaves a blank page. And `clearProps` hands layout back to CSS at the end, rather than leaving the element pinned by an inline matrix that a later resize cannot move.'
			},

			{ type: 'h3', id: 'restraint', text: 'What is deliberately not animated' },
			{
				type: 'ul',
				items: [
					'**Page transitions.** A crossfade between routes delays every navigation by 300ms to say nothing. The dashboard is used forty times a day.',
					'**Buttons.** A press has instant visual feedback from `:active`. Animating it makes the app feel *slower*, because the feedback arrives after the tap.',
					'**Numbers counting up.** The diary shows how many appointments there are today. Rolling that number from zero is a small lie about when we knew.'
				]
			},
			{
				type: 'why',
				title: 'The test for whether an animation earns its place',
				text: 'Take it away. If nobody can tell what changed, the animation was carrying information and should stay. If the app just feels a bit flatter, it was decoration, and decoration on a screen somebody uses forty times a day is a tax.'
			},

			{
				type: 'checkpoint',
				text: 'With reduced motion enabled in your OS, nothing animates and the network tab shows no GSAP request. With it off, booking a slot in a second window makes the first window\'s grid slide rather than snap.'
			}
		]
	},

	{
		slug: 'mobile-first-for-real',
		title: 'Mobile first, for real',
		summary:
			'Breakpoints that come from the content, tap targets that fit a thumb, and the viewport units that actually work.',
		goal: 'Every screen usable one-handed on a phone, and tested on one.',
		blocks: [
			{
				type: 'p',
				text: '"Mobile first" is usually a claim rather than a practice. The practical test: **write no `min-width` media query until the layout visibly needs one.** If your CSS starts with a desktop layout and undoes it below 768px, that is desktop-first with extra steps.'
			},

			{ type: 'h3', id: 'no-breakpoints', text: 'Most layouts need no breakpoint at all' },
			{
				type: 'code',
				file: 'the grid of times',
				lang: 'css',
				code: `
.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
	gap: var(--space-2);
}`
			},
			{
				type: 'code',
				file: 'the service list',
				lang: 'css',
				code: `
.services {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
	gap: var(--space-4);
}`
			},
			{
				type: 'p',
				text: 'Both are fully responsive with no media query. `min(100%, 18rem)` is the detail worth stealing: without it, a card with an 18rem minimum overflows a 375px phone, because `minmax` honours the minimum even when there is not room. Capping it at 100% lets it shrink when it must.'
			},

			{ type: 'h3', id: 'breakpoints', text: 'And when you do need one' },
			{
				type: 'code',
				file: 'src/lib/styles/tokens.css',
				lang: 'css',
				code: `
/* utilities.css — the only min-width query in the app. */
@media (min-width: 48rem) {
	.split {
		grid-template-columns: 1fr 1fr;
	}
}

/* DateStrip.svelte — the only max-width one: below 26rem the day
   labels stop fitting and shorten to their first two letters. */
@media (max-width: 26rem) {
	.day .name {
		font-size: var(--text-xs);
	}
}`
			},
			{
				type: 'p',
				text: 'Two media queries in the entire application, and neither came from a table of phone sizes — both were written at the width where the content visibly stopped fitting. That is the whole method: resize the window slowly, and add a query at the point where you wince.'
			},

			{ type: 'h3', id: 'touch', text: 'Thumbs, not cursors' },
			{
				type: 'ul',
				items: [
					'**44px minimum** on anything tappable — `min-block-size: 2.75rem`. The slot grid, the day strip, every icon button.',
					'**Spacing between targets**, not just size. Two 44px buttons touching are one 88px button as far as a thumb is concerned.',
					'**Primary actions at the bottom** on a phone. The top of a 6.7-inch screen needs a hand shuffle.',
					'**`inputmode` and `autocomplete`** on every field. `autocomplete="email"` plus `inputmode="email"` is the difference between two taps and thirty.'
				]
			},

			{ type: 'h3', id: 'dvh', text: 'The viewport unit that does not lie' },
			{
				type: 'code',
				file: 'css',
				lang: 'css',
				code: `
.screen {
	/* Not 100vh. */
	min-block-size: 100dvh;
}`
			},
			{
				type: 'p',
				text: '`100vh` on mobile Safari is the height of the viewport **with the address bar hidden**, which is not the height you have when the page loads. The bottom of a `100vh` element sits underneath the browser chrome, and that is where people put submit buttons. `dvh` is the dynamic viewport height and is correct at every moment.'
			},

			{ type: 'h3', id: 'testing', text: 'Testing it on a phone, in CI' },
			{
				type: 'code',
				file: 'playwright.config.ts',
				lang: 'ts',
				code: `
projects: [
	{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
	{ name: 'mobile', use: { ...devices['Pixel 7'] } }
]`
			},
			{
				type: 'p',
				text: 'Every test in the suite runs twice, and the mobile project uses a real touch-enabled emulation — viewport, device pixel ratio, user agent and pointer type. A `:hover`-only affordance passes on desktop and fails here, which is the entire point.'
			},
			{
				type: 'note',
				text: '`workers: 1`. The suite shares one database and re-seeds before every test; running two workers means two tests booking into the same diary and blaming the application for it.'
			},

			{
				type: 'checkpoint',
				text: '`pnpm test:e2e` passes on both projects, and the whole booking flow can be completed one-handed on a 375px-wide screen without horizontal scrolling.'
			}
		]
	},

	{
		slug: 'unit-tests-that-earn-their-keep',
		title: 'Unit tests that earn their keep',
		summary:
			'What to test, what not to, and the concurrency test that is the most valuable one in the project.',
		goal: '118 tests that run in two seconds and would catch every bug this project actually had.',
		blocks: [
			{
				type: 'p',
				text: 'A useful rule for what deserves a unit test: **would getting this wrong be invisible?** Time arithmetic, availability, the concurrency guard — all invisible until somebody is standing in a doorway. A component that renders a name is not.'
			},

			{ type: 'h3', id: 'shape', text: 'The shape of a good test' },
			{
				type: 'code',
				file: 'src/lib/time/availability.spec.ts',
				lang: 'ts',
				code: `
it('does not offer a slot whose tidy-up time runs past closing', () => {
	const slots = availableSlots({
		timeZone: LONDON,
		from: '2026-08-17',
		to: '2026-08-17',
		rules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60 }],
		service: {
			durationMinutes: 45,
			bufferBeforeMinutes: 0,
			bufferAfterMinutes: 10,
			slotIntervalMinutes: 15
		},
		occupied: new Set(),
		now: wallClockToInstant('2026-08-17', 0, LONDON),
		minNoticeMinutes: 0,
		maxAdvanceDays: 30
	});

	const last = slots.at(-1)!;

	// 45 + 10 = 55 minutes of window needed, so the last start is 16:05.
	expect(instantToMinuteOfDay(last.start, LONDON)).toBe(16 * 60 + 5);
});`
			},
			{
				type: 'p',
				text: 'The name states the rule. The comment states the arithmetic. The assertion states the answer. Somebody reading this in a year learns the business rule from the test rather than having to reconstruct it from the implementation.'
			},

			{ type: 'h3', id: 'concurrency', text: 'The most valuable test in the project' },
			{
				type: 'code',
				file: 'src/lib/server/scheduling.spec.ts',
				lang: 'ts',
				code: `
it('lets exactly one of ten simultaneous requests win', async () => {
	const attempts = Array.from({ length: 10 }, (_, index) =>
		createBooking({ ...base, customerName: \`Racer \${index}\` })
	);

	const results = await Promise.allSettled(attempts);

	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

	for (const failure of results.filter((r) => r.status === 'rejected')) {
		expect((failure.reason as BookingError).code).toBe('slot_taken');
	}

	// Nothing half-written survived the nine rollbacks.
	const bookings = await db.select().from(booking);
	const claims = await db.select().from(slotClaim);

	expect(bookings).toHaveLength(1);
	expect(new Set(claims.map((c) => c.bookingId))).toEqual(new Set([bookings[0]!.id]));
});`
			},
			{
				type: 'p',
				text: '`Promise.allSettled`, not `Promise.all` — we *expect* nine rejections and want to inspect them, not to have the first one abandon the test.'
			},
			{
				type: 'p',
				text: 'The last two assertions are the ones people leave out. "Exactly one winner" can be true while the database is full of orphaned claims from the rolled-back transactions. Checking that every claim belongs to the surviving booking is what proves the rollback rolled back.'
			},

			{ type: 'h3', id: 'when-wrong', text: 'When the test is the thing that is wrong' },
			{
				type: 'p',
				text: 'A test in this project asserted that two rapid publishes produced two yields from `watchDiary`. It failed. The instinct is to fix the code.'
			},
			{
				type: 'p',
				text: 'The code was right: coalescing is deliberate, because five bookings landing in one second should cause **one** re-read, not five. The test was encoding an assumption nobody had made. It now asserts the coalescing explicitly, which is a better test — it documents the design instead of accidentally contradicting it.'
			},
			{
				type: 'note',
				text: 'When a test fails, the first question is "which of these two is wrong?", not "how do I make the code match the test?". Getting that backwards is how a codebase acquires behaviour nobody chose.'
			},

			{ type: 'h3', id: 'intl', text: 'A trap: asserting on Intl output' },
			{
				type: 'code',
				file: 'don’t',
				lang: 'ts',
				code: `
expect(formatCompactMoney(5600)).toBe('£5.60K');`
			},
			{
				type: 'code',
				file: 'do',
				lang: 'ts',
				code: `
expect(formatCompactMoney(5600)).toMatch(/^£5\\.60?K$/);`
			},
			{
				type: 'p',
				text: '`Intl` output depends on the runtime\'s ICU version. Between ICU 78.2 and 78.3 — the difference between two Node releases — compact currency changed from `£5.60K` to `£5.6K`. A byte-exact assertion turns a routine Node upgrade into a failing build with no bug behind it.'
			},
			{
				type: 'p',
				text: 'Assert the shape, or assert on the *inputs* to formatting. Never on a locale-dependent string you did not construct yourself.'
			},

			{ type: 'h3', id: 'require', text: 'One config flag worth turning on' },
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `
test: {
	// A test with no assertions is a test that passes by accident.
	expect: { requireAssertions: true }
}`
			},
			{
				type: 'p',
				text: 'It has already caught one real problem here: a test whose assertions were inside a callback that never ran. It was green for a week and testing nothing.'
			},

			{
				type: 'checkpoint',
				text: '`pnpm test:unit -- --run` reports 118 passing in about two seconds, and every one of them would fail if you deleted the behaviour it describes.'
			}
		]
	},

	{
		slug: 'end-to-end-tests',
		title: 'End-to-end tests',
		summary:
			'Playwright against a real build, with fixtures that make every test independent — and selectors that break for the right reasons.',
		goal: 'A suite you trust enough to deploy on, running on desktop and mobile.',
		blocks: [
			{
				type: 'p',
				text: 'Unit tests prove the availability engine is right. End-to-end tests prove somebody can actually book an appointment. They answer different questions and you need both.'
			},

			{ type: 'h3', id: 'real-build', text: 'Against a production build, not the dev server' },
			{
				type: 'code',
				file: 'playwright.config.ts',
				lang: 'ts',
				code: `
webServer: {
	command: 'npm run build && node build/index.js',
	port: 4173,
	reuseExistingServer: !process.env.CI
},
workers: 1`
			},
			{
				type: 'p',
				text: 'The dev server and the built app differ in ways that matter: bundling, SSR, environment substitution, and how modules are externalised. Two of the worst bugs in this project — the missing libSQL native module and the CSRF origin mismatch — **only exist in the build**. A suite that runs against `vite dev` would have shipped both.'
			},

			{ type: 'h3', id: 'fixtures', text: 'A fixture that cannot be forgotten' },
			{
				type: 'code',
				file: 'e2e/fixtures.ts',
				lang: 'ts',
				code: `
export const test = base.extend<{ emptyDiary: void; reportBrowserErrors: void }>({
	emptyDiary: [
		async ({}, use) => {
			// A full re-seed, not just a diary wipe. The dashboard tests change
			// prices, hide services and rewrite shifts, so the studio itself has
			// to go back to its known shape.
			execFileSync('node', ['scripts/seed.ts'], {
				stdio: 'ignore',
				env: { ...process.env, DATABASE_URL: 'file:e2e.db' }
			});
			await use();
		},
		{ auto: true }
	]
});`
			},
			{
				type: 'p',
				text: '`auto: true` means every test gets this whether it asks for it or not, which is what makes the guarantee unconditional — a test **cannot** forget to reset.'
			},
			{
				type: 'p',
				text: 'Without it the tests are order-dependent in a genuinely nasty way. Each one books something, so "the first free time on Thursday" means something different by the fifth test. The suite passes, then fails, then passes again as tests are added or reordered, and every failure looks like an application bug.'
			},
			{
				type: 'note',
				text: 'The seed keeps the same business row rather than dropping and recreating it. Deleting it produced an intermittent 500 in whichever test ran next — a live query still streaming to a page the previous test had only just closed would find its business missing.'
			},

			{ type: 'h3', id: 'browser-errors', text: 'The fixture that finds bugs on its own' },
			{
				type: 'code',
				file: 'e2e/fixtures.ts',
				lang: 'ts',
				code: `
reportBrowserErrors: [
	async ({ page }, use) => {
		page.on('pageerror', (error) => console.error('[browser] uncaught:', error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') console.error('[browser]', message.text());
		});

		// 4xx responses are expected — several tests assert on them. A 5xx never is.
		page.on('response', (response) => {
			if (response.status() < 500) return;
			void response
				.text()
				.then((body) => console.error('[http]', response.status(), response.url(), body.slice(0, 300)))
				.catch(() => {});
		});

		await use();
	},
	{ auto: true }
]`
			},
			{
				type: 'p',
				text: 'A remote query that rejects during a client-side navigation renders the error page and writes **nothing** to the server log — the server was never involved. Without this, such a failure appears as "expected a button, found a page saying 500" and the actual message sits in a browser console nobody is reading.'
			},
			{
				type: 'p',
				text: 'This fixture found the sign-in `redirectTo` bug the first time it ran, and it is what turned "the hours page mysteriously fails" into "Cannot read properties of undefined (reading \'weekday\') at hours/+page.svelte:122".'
			},

			{ type: 'h3', id: 'selectors', text: 'Selectors that break for the right reasons' },
			{
				type: 'code',
				file: 'e2e/dashboard.e2e.ts',
				lang: 'ts',
				code: `
await page.getByRole('button', { name: /Cancel Doomed Dora/ }).click();
await expect(nav.getByRole('link', { name: 'Diary' })).toBeVisible();
await expect(page.getByText('Nothing booked. Enjoy it.')).toBeVisible();`
			},
			{
				type: 'p',
				text: 'Roles and accessible names, not CSS classes. A test written against `.btn-cancel` breaks when somebody renames a class and passes when somebody removes the button\'s label — exactly backwards. These break when the interface becomes unusable, which is when you want to hear about it.'
			},
			{
				type: 'warn',
				text: 'One gotcha: `getByLabel` matches by **substring**. `getByLabel(\'Day\')` on the hours page matched fifteen elements, because every "Remove Tuesday 09:00…" button contains the letters d-a-y. Scope to a container — `page.locator(\'.adder\').getByLabel(\'Day\')` — rather than reaching for a test id.'
			},

			{ type: 'h3', id: 'security-tests', text: 'Testing the guard, not the button' },
			{
				type: 'code',
				file: 'e2e/dashboard.e2e.ts',
				lang: 'ts',
				code: `
for (const section of ['services', 'team', 'settings']) {
	test(\`is refused /\${section} even by typing the URL\`, async ({ page }) => {
		const response = await page.goto(\`\${MANAGE}/\${section}\`);
		expect(response?.status()).toBe(403);
		await expect(page.getByText(/only an owner/i)).toBeVisible();
	});
}

test('cannot see another studio s diary', async ({ page }) => {
	// A 404, not a 403. Confirming that /manage/other-studio exists but is not
	// yours leaks the platform's customer list one guess at a time.
	const response = await page.goto('/manage/some-other-studio');
	expect(response?.status()).toBe(404);
});`
			},
			{
				type: 'p',
				text: 'These are the tests worth having. A hidden link is easy to test and proves nothing; typing the URL is what an attacker does, and asserting the *status code* is what pins the 403/404 distinction in place so a future refactor cannot quietly lose it.'
			},
			{
				type: 'p',
				text: 'The same principle drives the two tests that fight the browser: one strips `step="5"` before submitting 47 minutes, the other injects an option into the time-zone select. Both exist because a client-side constraint is not a control, and the only way to know the server check is load-bearing is to remove the client one and watch the server refuse.'
			},

			{
				type: 'checkpoint',
				text: '`pnpm test:e2e` runs 80 tests across desktop and Pixel 7 and passes. Run it twice in a row and it passes twice — the second run is the one that catches shared state.'
			}
		]
	},

	{
		slug: 'a-security-pass',
		title: 'A security pass',
		summary:
			'Walking the app the way somebody hostile would, with a checklist rather than a vibe.',
		goal: 'Every input validated, every object-level check in place, and nothing secret in the bundle.',
		blocks: [
			{
				type: 'p',
				text: 'Not a penetration test — a walk through the eight categories that actually cause incidents in applications shaped like this one. Two of them found something real in this project.'
			},

			{ type: 'h3', id: 'bola', text: '1. Object-level authorisation' },
			{
				type: 'p',
				text: 'The number one entry in the OWASP API list, and the one this app is most exposed to: every URL contains somebody else\'s identifier.'
			},
			{
				type: 'ul',
				items: [
					'`/manage/[slug]` → `requireStaff(slug)` checks membership, not just sign-in.',
					'`removeHours({ ruleId })` → loads the rule, checks its staff member belongs to **this** business, then checks the viewer may manage that person. Three checks, because a rule id alone proves nothing.',
					'`setStaffService` → `requireOwner`, and the staff and service ids are both re-scoped to the owner\'s business.',
					'`/booking/[token]` → the token *is* the credential; nothing else is trusted.'
				]
			},
			{
				type: 'warn',
				text: 'The pattern to look for in your own code: any handler that takes an id and trusts it. "The client sent us this id, so the client must be allowed to have it" is the whole bug, and it reads as perfectly reasonable code.'
			},

			{ type: 'h3', id: 'inputs', text: '2. Every input, at the boundary' },
			{
				type: 'p',
				text: 'Every remote function has a schema. Not one takes a bare string. The check worth running on your own project:'
			},
			{
				type: 'terminal',
				code: `grep -rn "export const .* = \\(query\\|command\\|form\\)(" src/ | wc -l
grep -rn "export const .* = \\(query\\|command\\|form\\)(v\\.\\|export const .* = \\(query\\|command\\|form\\)([a-zA-Z]*Schema" src/ | wc -l`
			},
			{
				type: 'p',
				text: 'If those two numbers differ, something takes an unvalidated argument.'
			},

			{ type: 'h3', id: 'enumeration', text: '3. What the errors give away' },
			{
				type: 'ul',
				items: [
					'Wrong password and unknown email produce the **identical** message. Distinguishing them turns the sign-in form into a tool for discovering which of your customers have accounts. Two end-to-end tests assert this.',
					'"You do not work here" is a 404, so `/manage/<guess>` cannot be used to enumerate the platform\'s businesses.',
					'A malformed manage token is rejected on shape before it becomes a query — no timing difference between "badly formed" and "not found".'
				]
			},

			{ type: 'h3', id: 'redirects', text: '4. The open redirect' },
			{
				type: 'code',
				file: 'src/routes/sign-in/auth.remote.ts',
				lang: 'ts',
				code: `
const SAFE_REDIRECT = /^\\/(?!\\/)[^\\s]{0,512}$/;

redirectTo: v.optional(
	v.pipe(
		v.string(),
		v.transform((value) => (SAFE_REDIRECT.test(value) ? value : HOME))
	),
	HOME
)`
			},
			{
				type: 'p',
				text: 'One leading slash, and only one. `//evil.example` is the case that catches people out: it begins with a slash, passes a naive `startsWith(\'/\')` check, and is a protocol-relative URL that leaves your site — moments after somebody typed their password, from a link that genuinely began with your domain.'
			},
			{
				type: 'note',
				text: 'We **sanitise** rather than reject. Rejecting is equally safe but worse to be on the end of: the value lives in a hidden field the person cannot see or correct, so a crafted link would leave them unable to sign in at all.'
			},

			{ type: 'h3', id: 'secrets', text: '5. Nothing secret in the bundle' },
			{
				type: 'terminal',
				code: `pnpm run build
grep -rn "BETTER_AUTH_SECRET\\|DATABASE_AUTH_TOKEN" .svelte-kit/output/client/ || echo "clean"`
			},
			{
				type: 'p',
				text: 'SvelteKit\'s env system makes this hard to get wrong — `public: true` is something you have to type — but running the grep costs five seconds and the failure mode is a credential in a JavaScript file served to the internet.'
			},

			{ type: 'h3', id: 'demo-creds', text: '6. What the pages themselves give away' },
			{
				type: 'p',
				text: 'Running that grep on this project turns up exactly one hit: the string `halfpast-demo-2026`, which is the seeded demo password printed helpfully next to the sign-in form.'
			},
			{
				type: 'p',
				text: 'That is a teaching convenience and a block of working owner credentials on a public page. Both are true, so it has to go — and the first attempt at removing it is instructive, because it does not work.'
			},
			{
				type: 'code',
				file: 'the obvious fix, which is not one',
				lang: 'svelte',
				code: `
{#if dev}
	<div class="demo">
		<p><code>ada@willowlane.test</code> — owner</p>
		<p>Password <code>halfpast-demo-2026</code></p>
	</div>
{/if}`
			},
			{
				type: 'p',
				text: '`dev` from `$app/env` is `false` in a production build, so the block never renders. Run the grep again anyway.'
			},
			{
				type: 'terminal',
				code: `$ grep -rl "halfpast-demo-2026" .svelte-kit/output/client/
.svelte-kit/output/client/_app/immutable/nodes/3.CEdgLdeS.js
.svelte-kit/output/client/_app/immutable/nodes/12.NvAhVVEo.js`
			},
			{
				type: 'warn',
				text: 'Still there, in both files. Svelte hoists a component\'s markup into **module-level template strings**, so the literal survives even though the branch it belongs to never runs. `{#if dev}` hid the credentials from the screen and left them in a JavaScript file anybody can open. Hidden is not removed — and the only reason we know is that we ran the grep instead of trusting the reasoning.'
			},
			{
				type: 'p',
				text: 'So the credentials move to the one place that cannot be deployed by accident: the output of the seed script. Anybody who can run `pnpm run db:seed` can read them; no deployed copy of the page carries a working owner password.'
			},
			{
				type: 'note',
				text: 'The general lesson is bigger than this one string. **A conditional that hides content is not a conditional that removes it.** If something must not ship, it has to be absent from the source that gets compiled — not guarded, not hidden, not behind a flag. And the way you find out which of the two you built is by grepping the build output.'
			},

			{ type: 'h3', id: 'headers', text: '7. Headers and the transport' },
			{
				type: 'code',
				file: 'src/hooks.server.ts',
				lang: 'ts',
				code: `
const response = await resolve(event);

// Never let a browser guess a response is HTML when we said it was not.
response.headers.set('X-Content-Type-Options', 'nosniff');
// Do not leak the path a customer came from to another site.
response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
// We use none of these. Saying so is free.
response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

return response;`
			},
			{
				type: 'ul',
				items: [
					'`referrer-policy` matters more than usual here: without it, a manage link\'s **token** travels in the `Referer` header to any external site the page links to.',
					'CSRF is handled by SvelteKit via `paths.origin` — which is why getting that setting right in chapter 15 was a security fix, not only a bug fix.',
					'Cookies are `httpOnly`, `sameSite: \'lax\'` and `secure` in production, all from Better Auth\'s defaults. Verify them rather than assuming them.'
				]
			},

			{ type: 'h3', id: 'rate', text: '8. What we deliberately did not build' },
			{
				type: 'p',
				text: 'There is no rate limiting on the booking endpoint. For a single-salon deployment behind a host that already does connection-level limiting, that is a defensible choice — and stating it is the point. An unwritten decision is indistinguishable from an oversight.'
			},
			{
				type: 'p',
				text: 'If Halfpast became multi-tenant and public, the list to work through would be: per-IP limits on booking and sign-in, email verification before a booking holds a slot, and an audit log on the owner screens.'
			},

			{
				type: 'checkpoint',
				text: 'You have walked all eight categories against your own code, and written down the ones you decided not to address and why.'
			}
		]
	},

	{
		slug: 'shipping-it',
		title: 'Shipping it',
		summary:
			'The build, the environment, the one adapter setting that ruins your day, and what to check afterwards.',
		goal: 'A deployed app that survives a restart, a clock change and a Node upgrade.',
		blocks: [
			{
				type: 'p',
				text: 'Everything green locally. Four things stand between that and a URL somebody can use.'
			},

			{ type: 'h3', id: 'checks', text: '1. The gate' },
			{
				type: 'code',
				file: 'package.json',
				lang: 'json',
				code: `
"scripts": {
	"check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
	"lint": "prettier --check . && eslint .",
	"test:unit": "vitest",
	"test:e2e": "node scripts/prepare-e2e-db.js && playwright test",
	"verify": "pnpm run check && pnpm run lint && pnpm run test:unit -- --run && pnpm run build && pnpm run test:e2e"
}`
			},
			{
				type: 'p',
				text: 'One command. If `pnpm run verify` is green, the thing is deployable; if it is not, nothing else matters. Put it in CI and make it required.'
			},

			{ type: 'h3', id: 'origin', text: '2. The adapter setting that ruins your day' },
			{
				type: 'warn',
				text: '`@sveltejs/adapter-node` v6 no longer reads an `ORIGIN` environment variable at runtime. The trusted origin is baked in at **build time** from `kit.paths.origin`, and the header fallback assumes `https`. Deploy behind a proxy that terminates TLS and forwards plain HTTP without the right headers, and every form post returns 403 "Cross-site remote requests are forbidden" — with a perfectly healthy-looking app behind it.'
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `
sveltekit({
	paths: { origin: env.PUBLIC_ORIGIN }
})`
			},
			{
				type: 'p',
				text: 'Because it is baked in at build time, `PUBLIC_ORIGIN` must be correct **when you build**, not when you start. That catches people whose CI builds an artefact and whose deploy step sets the environment.'
			},

			{ type: 'h3', id: 'deps', text: '3. Dependencies versus devDependencies' },
			{
				type: 'p',
				text: 'Vite bundles `devDependencies` into the server build. `@libsql/client` loads a native binary at runtime and cannot be bundled.'
			},
			{
				type: 'code',
				file: 'package.json',
				lang: 'json',
				code: `
"dependencies": {
	"@libsql/client": "^0.17.4",
	"better-auth": "^1.7.2",
	"drizzle-orm": "^0.45.2"
}`
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `
ssr: { external: ['@libsql/client', 'libsql'] }`
			},
			{
				type: 'p',
				text: 'Both are needed. Get it wrong and the app builds, deploys, starts, and dies on the first request with `Cannot find module \'@libsql/linux-x64-gnu\'`.'
			},

			{ type: 'h3', id: 'node', text: '4. Pin the runtime' },
			{
				type: 'code',
				file: 'package.json',
				lang: 'json',
				code: `
"engines": { "node": ">=24.0.0" },
"packageManager": "pnpm@11.24.0"`
			},
			{
				type: 'code',
				file: '.nvmrc',
				lang: 'text',
				code: '24.20.0'
			},
			{
				type: 'p',
				text: 'This app depends on the runtime\'s time zone database and on `Intl`, so "whatever Node the host feels like" is a real risk. Pinning also makes the ICU-version problem from chapter 32 a decision you make rather than one that happens to you.'
			},

			{ type: 'h3', id: 'migrations', text: 'Migrations on deploy' },
			{
				type: 'terminal',
				code: 'pnpm exec drizzle-kit migrate && node build/index.js'
			},
			{
				type: 'p',
				text: 'Migrations run before the server starts, and they run from the checked-in SQL — never from `drizzle-kit push`, which compares your schema file to the live database and decides what to do about the difference. That is a fine command for your laptop and a terrible one to point at production.'
			},

			{ type: 'h3', id: 'afterwards', text: 'What to check once it is up' },
			{
				type: 'ol',
				items: [
					'**View source on the booking page.** The studio name and services should be in the HTML. If you see "Loading…", a `pending` snippet has escaped onto a page-level boundary.',
					'**Book something.** Then book the same slot from a second browser and confirm the refusal is polite.',
					'**Check the diary updates live** in a window you have left open.',
					'**Set your phone to another time zone** and load the booking page. The times should move; the studio\'s zone should be named.',
					'**Restart the process.** Everything should still be there — and `PRAGMA journal_mode` should still say `wal`.'
				]
			},

			{ type: 'h3', id: 'end', text: 'What you built' },
			{
				type: 'p',
				text: 'A booking platform that tells the truth about time, cannot double-book, updates itself, works without JavaScript, and is tested well enough that you would deploy it on a Friday.'
			},
			{
				type: 'p',
				text: 'The three ideas worth carrying to the next thing you build, none of which are about SvelteKit:'
			},
			{
				type: 'ol',
				items: [
					'**Know which layer is the guarantee.** Halfpast has three defences against double-booking and exactly one of them is load-bearing. Being able to say which is the difference between a system you trust and one you hope about.',
					'**Make the invisible testable.** `now` is an argument, the availability engine is pure, and both daylight-saving transitions run in a fifth of a second. Nothing else about this project would have been provable otherwise.',
					'**A client-side check is a courtesy; a server-side check is a control.** Build both, and write the test that removes the courtesy.'
				]
			},

			{
				type: 'checkpoint',
				text: '`pnpm run verify` is green, the app is deployed, and all five post-deploy checks pass.'
			}
		]
	}
];
