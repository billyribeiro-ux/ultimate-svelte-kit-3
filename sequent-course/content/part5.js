/**
 * PART 5 — Talking to the outside (chapters 29–33)
 *
 * A venue whose only client is its own web page is a demo. This part builds the
 * public API an algorithm uses, the keys that authenticate it, the limits that
 * keep one client from ruining everybody's day, and the outbox that tells firms
 * what happened without losing a message when the process dies.
 */

export const part5 = [
	{
		slug: 'a-public-api-worth-using',
		title: 'A public API worth using',
		summary:
			'One error shape, a request id on every response, and the four bugs that curl found in an afternoon.',
		goal: 'Build the plumbing that makes every /api/v1 route behave the same way.',
		blocks: [
			{
				type: 'p',
				text: 'A browser and an algorithm want different things from the same venue, and pretending otherwise gives you an API that is bad at both. A person gets a redirect to a sign-in page; a trading system gets a 401 with a code it can branch on. A person sees a nicely designed error page; a trading system needs to know whether to retry.'
			},
			{
				type: 'why',
				title: 'The most valuable property of an API',
				text: 'It is not speed and it is not breadth. It is that **the failures are as predictable as the successes**. A client that knows exactly what a failure looks like can be written once and left alone. A client that has to guess grows a `catch` block full of string matching, and every copy-edit you make to an error message becomes an outage at somebody else\'s firm.'
			},

			{ type: 'h3', id: 'one-shape', text: 'One error shape' },
			{
				type: 'code',
				lang: 'json',
				code: `
{
	"error": {
		"code": "rate_limited",
		"message": "Too many requests.",
		"requestId": "3f9a2c7e-1b0"
	}
}`
			},
			{
				type: 'ul',
				items: [
					'**`code`** is what a machine reads. It never changes once published — it is as much a part of the contract as the URL itself.',
					'**`message`** is for the human reading a log. It may change freely, which is exactly why nothing should branch on it.',
					'**`requestId`** is in the body *and* in an `X-Request-Id` header, so a support conversation that starts with a screenshot can still find the log line.'
				]
			},
			{
				type: 'code',
				file: 'apps/web/src/lib/server/api.ts',
				lang: 'ts',
				code: `
/**
 * The codes this API will ever return.
 *
 * A closed list, in one place. Every one of these is documented, and adding a
 * sixth means deciding it is worth a client writing a branch for — which is a
 * higher bar than "this felt different from the others at the time".
 */
export type ApiErrorCode =
	| 'unauthenticated'
	| 'forbidden'
	| 'not_found'
	| 'invalid_request'
	| 'rate_limited'
	| 'unavailable'
	| 'internal';

const STATUS_FOR: Record<ApiErrorCode, number> = {
	unauthenticated: 401,
	forbidden: 403,
	not_found: 404,
	invalid_request: 400,
	rate_limited: 429,
	unavailable: 503,
	internal: 500
};`
			},
			{
				type: 'note',
				text: 'Seven codes. Not seventy. Every one of them is something a client would genuinely handle differently: re-authenticate, give up, fix the request, back off, wait, or page somebody. If you cannot name the different action a client takes, it does not need its own code.'
			},

			{ type: 'h3', id: 'not-error', text: 'Why not SvelteKit\'s error()' },
			{
				type: 'code',
				file: 'apps/web/src/lib/server/api.ts',
				lang: 'ts',
				code: `
/**
 * A thrown API failure.
 *
 * Deliberately *not* SvelteKit's \`error()\`. That helper renders the app's HTML
 * error page for a browser, which is precisely the wrong answer here — a
 * trading system parsing \`<!doctype html>\` as JSON gets a \`SyntaxError\` and no
 * idea what actually went wrong.
 */
export class ApiError extends Error {
	readonly code: ApiErrorCode;
	readonly details: Record<string, unknown> | undefined;

	constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
		super(message);
		this.name = 'ApiError';
		this.code = code;
		this.details = details;
	}

	get status(): number {
		return STATUS_FOR[this.code];
	}
}`
			},

			{ type: 'h3', id: 'the-503-bug', text: 'The bug in the reverse map' },
			{
				type: 'p',
				text: 'Authorisation failures and feature-flag pauses are thrown with SvelteKit\'s `error(status, message)` deeper in the stack, so the API layer needs to translate a status back into a code. The first version was an `if` chain:'
			},
			{
				type: 'code',
				lang: 'ts',
				code: `
// The version that had a hole in it.
if (status === 400) return new ApiError('invalid_request', message);
if (status === 403) return new ApiError('forbidden', message);
if (status === 404) return new ApiError('not_found', message);
return new ApiError('internal', 'Something went wrong at our end.');`
			},
			{
				type: 'p',
				text: 'Then we added the venue-pause feature flag, which throws `error(503, \'The venue is not accepting new orders at the moment. Cancels still work.\')`. The chain has no 503 branch, so it fell through to the last line, and pausing the venue told every API client **"something went wrong at our end"** — a 500, which clients treat as a bug to report rather than a state to wait out.'
			},
			{
				type: 'code',
				file: 'apps/web/src/lib/server/api.ts',
				lang: 'ts',
				code: `
/**
 * The reverse map, for translating a thrown \`error(status, …)\` into a code.
 *
 * Derived from \`STATUS_FOR\` rather than written out, so the two cannot drift.
 * Adding a code adds its translation automatically, which is the point — the
 * version with a hand-written \`if\` chain dropped 503 the day it was introduced
 * and turned "the venue is paused" into "something went wrong at our end".
 */
const CODE_FOR: ReadonlyMap<number, ApiErrorCode> = new Map(
	(Object.entries(STATUS_FOR) as Array<[ApiErrorCode, number]>).map(([code, status]) => [
		status,
		code
	])
);`
			},
			{
				type: 'why',
				title: 'Derive, do not duplicate',
				text: 'The `if` chain and the status map held the same knowledge in two shapes, and only one of them got updated. Deriving the second from the first makes the class of bug impossible rather than merely fixed — nobody has to remember, because there is nothing to remember.'
			},

			{ type: 'h3', id: 'handler', text: 'The handler wrapper' },
			{
				type: 'code',
				file: 'apps/web/src/lib/server/api.ts',
				lang: 'ts',
				code: `
export function handler(
	run: (context: ApiContext, event: RequestEvent) => Promise<Response>,
	options: { cost?: number } = {}
): RequestHandler {
	return async (event) => {
		/*
		 * The request id is minted **here**, before anything can fail.
		 *
		 * An earlier version generated it inside \`authenticate\`, which meant every
		 * 401 and every rate-limit refusal came back with \`requestId: "unknown"\` —
		 * exactly the responses somebody is most likely to be holding when they
		 * open a support ticket.
		 */
		const requestId = crypto.randomUUID().slice(0, 12);

		try {
			const context = await authenticate(requestId, options.cost ?? 1);

			const response = await run(context, event);
			for (const [key, value] of Object.entries(context.headers)) {
				response.headers.set(key, value);
			}
			response.headers.set('X-Request-Id', context.requestId);
			return response;
		} catch (thrown) {
			if (thrown instanceof ApiError) {
				const headers = (thrown as ApiError & { headers?: Record<string, string> }).headers ?? {};
				return jsonError(thrown, requestId, headers);
			}

			// The real error goes to the log with the id; the caller gets a sentence
			// that says nothing. An exception message is written for whoever wrote
			// the code, not for whoever is calling.
			console.error(\`[api \${requestId}]\`, thrown);

			return jsonError(new ApiError('internal', 'Something went wrong at our end.'), requestId);
		}
	};
}`
			},
			{
				type: 'p',
				text: 'Every route is `export const GET = handler(async ({ viewer }, { url }) => { … })`. Without the wrapper, each `+server.ts` grows its own try/catch, they drift, and one of them eventually returns a stack trace containing a file path and a SQL statement to whoever asked for it.'
			},

			{ type: 'h3', id: 'curl', text: 'Four bugs an afternoon of curl found' },
			{
				type: 'p',
				text: 'None of these were found by tests. All four were found by calling the API by hand, the way a new client would.'
			},
			{
				type: 'ol',
				items: [
					'**The first order every API key placed was rejected.** The gateway parsed the command *before* stamping the caller\'s identity onto it, so validation ran against an object with no `firmId` and answered `Expected "firmId" but received undefined`. Fixed by stamping first, then parsing.',
					'**An unpinned API key resolved to zero accounts.** `accountsFor()` looked up `account_assignment` by user id — and a key is not a user. Every key without a pinned account could authenticate and then trade nothing. Fixed with `allAccountsOf(client, firmId)`.',
					'**Every 401 and 429 carried `requestId: "unknown"`.** The id was minted after authentication. Fixed above.',
					'**A body-less `DELETE` was refused as a cross-site form submission.** That one got its own chapter in Part 4.'
				]
			},
			{
				type: 'why',
				title: 'Be your own first client',
				text: 'Three of those four are invisible from inside the application, because the web UI takes a different path through the same code — it has a session, not a key, and it sends a body on every request. The single highest-value hour in this project was spent with `curl` and no test framework at all.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can state the fixed error shape and say which field a client is allowed to branch on',
					'You can explain why `error()` is the wrong helper for a JSON API',
					'You can explain why the reverse map is derived rather than written',
					'You can explain why the request id is minted before authentication'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'api-keys',
		title: 'API keys',
		summary: 'Two-part keys, shown once, and why the prefix is not decoration.',
		goal: 'Issue, verify and revoke credentials without ever being able to read one back.',
		blocks: [
			{
				type: 'p',
				text: 'A key looks like this:'
			},
			{
				type: 'terminal',
				code: `
ak_7f2cQe9xKm4t.Zq4mR8sT1vB6nW3yU0pL5hJ2gF7dA9cX1eK4oI8uW2d`
			},
			{
				type: 'p',
				text: 'An identifier, a dot, and a secret. The identifier is stored in clear and the secret is stored as a scrypt hash, exactly like a password.'
			},

			{ type: 'h3', id: 'why-two-parts', text: 'Why two parts' },
			{
				type: 'why',
				title: 'It is what makes verification O(1)',
				text: 'With one opaque blob, verifying a presented key means scrypting it against **every stored hash** to find out whose it is. Scrypt is deliberately slow — that is its entire purpose — so a venue with ten thousand keys would spend more time authenticating a request than answering it. Splitting the key means the identifier is a single indexed lookup, and scrypt runs exactly once, against the one hash it might match.'
			},
			{
				type: 'p',
				text: 'The prefix has a second job that is easy to miss: it is **greppable**. Secret scanners find `ak_`-prefixed strings in a pushed commit precisely because the shape is recognisable. Making credentials *look* like credentials, rather than like random noise, is what lets a scanner catch the leak before a human does.'
			},

			{ type: 'h3', id: 'shown-once', text: 'Shown once, stored never' },
			{
				type: 'code',
				file: 'packages/store/src/keys.ts',
				lang: 'ts',
				code: `
/*
 * 9 bytes of id, 32 of secret, both from \`randomBytes\`.
 *
 * \`randomBytes\` and not \`Math.random()\`. The latter is a fast
 * pseudo-random generator seeded from something guessable, and its output is
 * predictable from a handful of prior values — fine for picking a colour,
 * catastrophic for a credential. This distinction is the single most common
 * way a competent codebase ends up with a forgeable token.
 *
 * 32 bytes is 256 bits. There is no attack on that; guessing is not a threat
 * model, leakage is, which is why the rest of this file is about leakage.
 */
const keyId = \`ak_\${randomBytes(9).toString('base64url')}\`;
const secret = randomBytes(32).toString('base64url');`
			},
			{
				type: 'p',
				text: '`createApiKey` returns the full credential once, and then it is gone. There is no code path anywhere in this repository that can recover it.'
			},
			{
				type: 'note',
				text: 'People find this annoying, and every venue that has softened it has regretted it. A system that can show you your own key can be made to show it to somebody wearing your face — a support agent talked into it, a database backup on a laptop, a subpoena. "Lost it? Here is a new one" costs a member firm ninety seconds and removes the entire category.'
			},

			{ type: 'h3', id: 'scopes', text: 'Scopes and pinning' },
			{
				type: 'code',
				file: 'packages/store/src/keys.ts',
				lang: 'ts',
				code: `
export const SCOPES = ['read', 'trade', 'admin'] as const;

if (input.scopes.length === 0) {
	// A key with no scopes can do nothing and looks like a working key. Making
	// it an error beats letting somebody debug it for an afternoon.
	throw new Error('A key needs at least one scope.');
}`
			},
			{
				type: 'p',
				text: 'A key may also **pin an account**, and pinning is the useful default for an algorithm: a key that can only trade one desk cannot, when it goes wrong at three in the morning, go wrong on all of them.'
			},
			{
				type: 'warn',
				text: 'This is where bug two lived. Pinning was implemented and unpinning was not: `accountsFor()` resolved a key\'s accounts by looking in `account_assignment` **keyed on user id**, and a key has no user. Every unpinned key authenticated perfectly and then found itself with an empty list of accounts it could trade — a 403 on a credential the venue had just accepted.'
			},
			{
				type: 'code',
				file: 'packages/store/src/tenancy.ts',
				lang: 'ts',
				code: `
/** Every active trading account at a firm. */
async function allAccountsOf(client: Client, firmId: string): Promise<string[]> {
	const all = await client.execute({
		sql: 'SELECT account_id FROM trading_account WHERE firm_id = ? AND is_active = 1',
		args: [firmId]
	});
	return all.rows.map((row) => String(row['account_id']));
}`
			},

			{ type: 'h3', id: 'revoke', text: 'Revoke by stamping, not deleting' },
			{
				type: 'p',
				text: 'Revoking sets `revoked_at`. The row stays.'
			},
			{
				type: 'why',
				title: 'The row is the only record the key existed',
				text: 'Delete it and the question "what was this key allowed to do when it made that trade in March?" has no answer — and that is exactly the question asked after an incident. Soft-deleting credentials is one of the few places where the audit argument beats the tidiness argument outright.'
			},
			{
				type: 'code',
				file: 'apps/web/src/lib/server/api.ts',
				lang: 'ts',
				code: `
const resolved = await viewerFromApiKey(db, presented, now);

/*
 * One message for "no such key", "wrong secret" and "revoked".
 *
 * Distinguishing them would let somebody with a list of key ids find out
 * which exist, and a revoked key is exactly as unwelcome as a fictional one.
 */
if (!resolved) throw new ApiError('unauthenticated', 'That API key is not usable.');`
			},
			{
				type: 'p',
				text: 'Same reasoning as the sign-in form in Part 4, applied to a different credential. A leaked key that has been revoked should tell an attacker nothing about whether it was ever real.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why a key is split into an identifier and a secret',
					'You can explain why `randomBytes` and not `Math.random()`',
					'You can explain why the venue cannot show you your own key',
					'You can explain why revocation stamps a column instead of deleting the row'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'rate-limits-and-pagination',
		title: 'Rate limits and pagination',
		summary:
			'A token bucket with no timers, and cursors that do not silently drop rows when the tape moves.',
		goal: 'Protect the venue from one client, and page through a moving list correctly.',
		blocks: [
			{ type: 'h3', id: 'the-simpler-thing', text: 'The simpler thing, and its hole' },
			{
				type: 'p',
				text: 'The obvious limiter is a counter per minute: allow sixty, reset on the minute. Three lines, and you can drive a lorry through it.'
			},
			{
				type: 'p',
				text: 'A client sends sixty requests at 11:00:59 and sixty more at 11:01:00. Two counters, both within limit, **one hundred and twenty requests in one second**. The venue sees exactly the burst the limit existed to prevent, and the "requests per minute" graph says everything is fine.'
			},

			{ type: 'h3', id: 'token-bucket', text: 'The token bucket' },
			{
				type: 'p',
				text: 'A bucket holds tokens. Each request costs one. Tokens refill at a steady rate, and the bucket has a ceiling. That gives you two knobs that mean genuinely different things:'
			},
			{
				type: 'ul',
				items: [
					'**Refill rate** — the sustained throughput you are willing to serve.',
					'**Capacity** — how much burst you tolerate from a client that has been quiet.'
				]
			},
			{
				type: 'why',
				title: 'Why burst tolerance is not generosity',
				text: 'A market maker who sits still for a minute and then cancels forty orders because the market moved is doing something entirely reasonable, and a flat counter punishes them for it. The capacity knob lets you say "sustained twenty a second, but I will forgive a hundred at once from somebody who has been idle" — which is a sentence about how markets actually behave.'
			},

			{ type: 'h3', id: 'no-timers', text: 'No timers' },
			{
				type: 'p',
				text: 'The bucket does not refill on a schedule. It works out how much time has passed since it was last touched and adds that much, at the moment somebody asks.'
			},
			{
				type: 'p',
				text: 'Ten thousand idle keys cost ten thousand small objects and zero scheduled work. With a timer per key they would cost ten thousand wakeups a second to do nothing at all.'
			},
			{
				type: 'code',
				file: 'packages/store/src/ratelimit.ts',
				lang: 'ts',
				code: `
/**
 * Spend a token if there is one.
 *
 * Note that a refused request does **not** consume a token. A limiter that
 * charges for rejections punishes a client that is already backing off, and
 * pushes a misbehaving one into a state it can never leave — every retry
 * resets the clock, so the retries never stop.
 */
take(key: string, config: BucketConfig, now: number, cost = 1): Verdict {
	const bucket = this.#refill(key, config, now);

	if (bucket.tokens < cost) {
		const short = cost - bucket.tokens;
		return {
			allowed: false,
			remaining: Math.floor(bucket.tokens),
			// Rounded **up**: telling a client to wait 0 seconds when it needs 0.4
			// produces a retry that fails again immediately.
			retryAfter: Math.max(1, Math.ceil(short / config.ratePerSecond)),
			resetAt: this.#fullAt(bucket, config, now)
		};
	}

	bucket.tokens -= cost;

	return {
		allowed: true,
		remaining: Math.floor(bucket.tokens),
		retryAfter: 0,
		resetAt: this.#fullAt(bucket, config, now)
	};
}`
			},
			{
				type: 'p',
				text: '`now` is a parameter. The tests drive time by passing numbers rather than by sleeping — a rate-limit suite built on `setTimeout` is slow, flaky on a loaded CI box, and cannot check the interesting cases at all.'
			},

			{ type: 'h3', id: 'ordering', text: 'Authenticate first, then limit' },
			{
				type: 'code',
				file: 'apps/web/src/lib/server/api.ts',
				lang: 'ts',
				code: `
const resolved = await viewerFromApiKey(db, presented, now);
if (!resolved) throw new ApiError('unauthenticated', 'That API key is not usable.');

const config = bucketFor(resolved.ratePerSecond);
const verdict = limiter.take(\`key:\${resolved.keyId}\`, config, now, cost);`
			},
			{
				type: 'p',
				text: 'The bucket is keyed on the **credential**, which means it can only be keyed on something we have already verified. Limit first and unauthenticated traffic all shares one bucket — one broken client then locks every other client out, which is a denial of service the limiter itself provides.'
			},
			{
				type: 'note',
				text: 'The cost of that ordering is that a flood of *invalid* credentials is not limited here. That belongs at the edge, in front of the app, where it can be dropped without a database round trip. Saying so is better than pretending one limiter solves both problems.'
			},
			{
				type: 'warn',
				text: 'This limiter is in-memory and therefore per-process. Two web servers behind a load balancer give a client two buckets. That is a deliberate limit, not an oversight — a shared limiter needs Redis or similar in the request path — but you must know it is true before you rely on the number.'
			},

			{ type: 'h3', id: 'cursors', text: 'Cursors, not offsets' },
			{
				type: 'p',
				text: '`LIMIT 50 OFFSET 100` is correct only if the list does not change between requests. The trade tape changes several times a second.'
			},
			{
				type: 'p',
				text: 'Twenty new trades arrive while a client is on page two, everything shifts down twenty rows, and page three re-serves twenty rows the client already has — or, going the other way, skips twenty it will never see. A reconciliation built on that is quietly wrong, and nothing errors.'
			},
			{
				type: 'p',
				text: 'A cursor encodes **where you actually were**: the sequence number and id of the last row you saw. The next page is "everything after that", which is stable no matter what arrives in between.'
			},
			{
				type: 'code',
				file: 'apps/web/src/routes/api/v1/trades/+server.ts',
				lang: 'ts',
				code: `
let cursor: Cursor | undefined;
const presented = url.searchParams.get('cursor');

if (presented) {
	try {
		cursor = decodeCursor(presented);
	} catch (thrown) {
		// A bad cursor is the client's mistake, and saying so beats silently
		// serving page one — which is how a client ends up in an infinite loop
		// re-reading the same fifty rows and never noticing.
		if (thrown instanceof InvalidCursor) {
			throw new ApiError('invalid_request', 'That cursor is not valid.');
		}
		throw thrown;
	}
}`
			},
			{
				type: 'why',
				title: 'Refuse a bad cursor loudly',
				text: 'The tempting behaviour is to treat an unparseable cursor as "start from the beginning". It never errors, so it looks robust. What it actually does is put a client that corrupted its cursor into an infinite loop, re-reading page one forever and reporting no problem. Silently doing something reasonable is the most expensive kind of forgiveness.'
			},

			{ type: 'h3', id: 'scoping', text: 'Filter in SQL, not in JavaScript' },
			{
				type: 'code',
				file: 'apps/web/src/routes/api/v1/trades/+server.ts',
				lang: 'ts',
				code: `
/*
 * The \`WHERE\` clause names \`buy_firm_id\` and \`sell_firm_id\` explicitly. It
 * would be shorter to fetch the tape and filter in JavaScript, and that is the
 * version that leaks: the \`LIMIT\` applies before the filter, so a firm with one
 * trade on a busy venue gets an empty page and a cursor, over and over, until
 * they give up. Worse, any future maintainer who removes the filter by accident
 * ships every firm's trades to everybody, and no test that only ever has one
 * firm in it will notice.
 */`
			},
			{
				type: 'p',
				text: 'Note also what this endpoint does **not** return: the counterparty. In a centrally cleared market the counterparty is the clearing house, and telling Northgate they just bought from Lowfield hands them information they would pay for and are not entitled to.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain the boundary problem with a per-minute counter',
					'You can explain what refill rate and capacity each control',
					'You can explain why a refused request does not consume a token',
					'You can explain why offset pagination is wrong on a moving list, and why a bad cursor errors'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'the-transactional-outbox',
		title: 'The transactional outbox',
		summary: 'The dual-write problem, which has exactly one solution, and the worker that drains it.',
		goal: 'Tell firms what happened without ever losing a message or inventing one.',
		blocks: [
			{ type: 'h3', id: 'dual-write', text: 'The problem that has no other solution' },
			{
				type: 'p',
				text: 'A trade happens. Two things must follow: the projections update, and the firm\'s webhook fires. The obvious code is:'
			},
			{
				type: 'code',
				lang: 'ts',
				code: `
await database.commit();
await fetch(theirWebhook, { /* … */ });`
			},
			{
				type: 'p',
				text: 'There is no ordering of those two lines that is correct.'
			},
			{
				type: 'ul',
				items: [
					'**Commit first, then send.** The process dies in between. The trade happened and nobody was told, forever. There is no retry, because nothing recorded that a send was owed.',
					'**Send first, then commit.** The commit fails — a constraint, a full disk, a rollback further up. You have told a firm about a trade that did not happen, and you cannot un-tell them.'
				]
			},
			{
				type: 'warn',
				text: 'The trap is that both work perfectly in development, where the process does not die and the commit does not fail. This is a bug you find in production, at 3am, once.'
			},

			{ type: 'h3', id: 'the-outbox', text: 'What the outbox does' },
			{
				type: 'p',
				text: 'Write the **intent to send** into the same database, in the **same transaction** as the fact. Now there is exactly one commit, and it either contains both or neither. A separate process reads the outbox afterwards and does the sending.'
			},
			{
				type: 'p',
				text: 'The dual write has not been eliminated. It has been *moved somewhere it can be retried*, because the row is still there until delivery succeeds.'
			},
			{
				type: 'code',
				file: 'packages/store/src/outbox.ts',
				lang: 'ts',
				code: `
/**
 * Add a message to the outbox, inside a transaction the caller owns.
 *
 * Taking an \`Executor\` rather than a \`Client\` is the entire design, expressed
 * in the type. A function that opened its own transaction could not be atomic
 * with the caller's work, and this signature makes it impossible to use wrongly:
 * there is no way to call it outside a transaction.
 *
 * \`ON CONFLICT DO NOTHING\` on the idempotency key means a projector replaying
 * the same event does not enqueue a second copy. Projectors are idempotent by
 * design and are re-run after any crash, so without this every restart would
 * re-notify every firm about the last batch of trades.
 */
export async function enqueue(tx: Executor, message: OutboxMessage, now: number): Promise<void> {
	await tx.execute({
		sql: \`INSERT INTO outbox (kind, seq, firm_id, idempotency_key, payload, created_at, available_at)
		      VALUES (?, ?, ?, ?, ?, ?, ?)
		      ON CONFLICT (idempotency_key) DO NOTHING\`,
		args: [ /* … */ ]
	});
}`
			},
			{
				type: 'why',
				title: 'At-least-once, and nothing sells you more',
				text: 'This buys **at-least-once** delivery. It does not buy exactly-once, and nothing does: in the moment after a receiver processes a webhook and before its 200 reaches us, the network can drop the response, and we will send again. So every delivery carries a stable id and receivers are told to de-duplicate on it. Anybody promising exactly-once delivery over a network is either wrong or quietly means "at-least-once plus idempotent receivers", which is this.'
			},

			{ type: 'h3', id: 'leases', text: 'Claiming work with a lease' },
			{
				type: 'p',
				text: 'A worker that `SELECT`s a row and then crashes holding a lock blocks the queue until somebody notices. A **lease** is a lock with an expiry written into the row.'
			},
			{
				type: 'code',
				file: 'packages/store/src/outbox.ts',
				lang: 'ts',
				code: `
const result = await client.execute({
	sql: \`UPDATE outbox
	      SET leased_until = ?, leased_by = ?, attempts = attempts + 1
	      WHERE outbox_id IN (
	          SELECT outbox_id FROM outbox
	          WHERE delivered_at IS NULL
	            AND failed_at IS NULL
	            AND available_at <= ?
	            AND (leased_until IS NULL OR leased_until <= ?)
	            \${kind ? 'AND kind = ?' : ''}
	          ORDER BY available_at, outbox_id
	          LIMIT ?
	      )
	      RETURNING outbox_id, kind, seq, firm_id, idempotency_key, payload, attempts, created_at\`,
	args: kind
		? [now + leaseMs, worker, now, now, kind, limit]
		: [now + leaseMs, worker, now, now, limit]
});`
			},
			{
				type: 'p',
				text: 'Claim it until `now + leaseMs`. If the worker dies, the lease runs out and the next worker picks the message up. **Nothing has to detect the crash** — no heartbeat, no health check, no "reap dead workers" job. The recovery is the absence of an update.'
			},
			{
				type: 'note',
				text: 'The `UPDATE … RETURNING` is not a style choice. Selecting candidates and then updating them is two statements, and between them another worker can claim the same rows. One statement means the database\'s own row locking decides who wins, which is the only place that decision can be made without a race.'
			},
			{
				type: 'p',
				text: 'The cost of leases: one that expires while the worker is *still alive* — a long GC pause, a slow receiver — produces a duplicate delivery. Which is fine, because the contract was at-least-once from the start. Choosing the lease length is choosing how often that happens.'
			},

			{ type: 'h3', id: 'jitter', text: 'Backoff, and the line people leave out' },
			{
				type: 'code',
				file: 'packages/store/src/outbox.ts',
				lang: 'ts',
				code: `
export function backoffMs(attempts: number, random: () => number = Math.random): number {
	const ceiling = Math.min(60 * 60_000, 1000 * 2 ** Math.min(attempts, 12));
	return Math.floor(random() * ceiling);
}`
			},
			{
				type: 'why',
				title: 'Jitter is the whole thing',
				text: 'Without it, a receiver that goes down for a minute causes every one of its pending messages to fail at once, back off by exactly the same amount, and retry at exactly the same instant. The receiver comes back up, is hit by the entire backlog in one burst, falls over again, and the cycle repeats — a thundering herd that the retry logic **created** rather than survived. Full jitter (a random point in `[0, backoff]`) spreads the same messages across the whole window. It is one line and it is the difference between a retry policy and an outage amplifier.'
			},
			{
				type: 'p',
				text: 'And giving up is a real state, not an infinite retry with a long delay:'
			},
			{
				type: 'code',
				file: 'packages/store/src/outbox.ts',
				lang: 'ts',
				code: `
if (message.attempts >= maxAttempts) {
	await client.execute({
		sql: \`UPDATE outbox SET failed_at = ?, leased_until = NULL, last_error = ?
		      WHERE outbox_id = ?\`,
		args: [now, reason, message.outboxId]
	});
	return { retrying: false, nextAttemptAt: null };
}`
			},
			{
				type: 'p',
				text: 'A message that has failed eight times is not going to succeed on the ninth — the URL is wrong, or the receiver was decommissioned. A queue that retries it forever spends its budget on a firm that is not listening while the firms that are wait behind it. `failed_at` is set, the row stays, and `last_error` says why. Deleting it would destroy the only evidence.'
			},

			{ type: 'h3', id: 'the-bug', text: 'The disposition that lied' },
			{
				type: 'p',
				text: 'The worker\'s delivery function originally returned `{ retry: boolean }`. A malformed payload — one the worker could not even build a request from — returned `retry: false`, meaning "do not try again".'
			},
			{
				type: 'p',
				text: 'The worker read `retry: false` and called `succeed()`. The message was marked **delivered**. Nothing had been delivered. The queue was clean, the metrics were green, and a firm never heard about a trade.'
			},
			{
				type: 'code',
				file: 'apps/worker/src/deliver.ts',
				lang: 'ts',
				code: `
/**
 * What happened, in three dispositions rather than two.
 *
 * \`retry: false\` on its own means **done** — either delivered, or there was
 * nobody to deliver to, which is equally finished. \`permanent: true\` means it
 * will never succeed and should go straight to the dead letters.
 *
 * The third case is the one a boolean cannot express, and leaving it out is how
 * a message that is broken forever gets marked delivered: \`retry: false\` and
 * the loop calls \`succeed()\`.
 */
export interface DeliveryOutcome {
	readonly delivered: number;
	readonly failed: number;
	/** True if the whole message should be tried again later. */
	readonly retry: boolean;
	/** True if it will never succeed. Dead-letter it now rather than in an hour. */
	readonly permanent?: boolean;
	readonly error?: string;
}`
			},
			{
				type: 'warn',
				text: 'One boolean is not enough for three outcomes. "It worked", "it failed and might work later" and "it failed and never will" are genuinely three states, and collapsing the last two into `retry: false` made the queue report success for a message it had thrown away. Two fields encode all three: `retry` says "try again later", and `permanent` says "dead-letter it now" — distinct from done.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can state the dual-write problem and why neither ordering is correct',
					'You can explain why `enqueue` takes a transaction and not a client',
					'You can explain how a lease recovers from a crashed worker with no detection',
					'You can explain what jitter prevents, and why "give up" is a state rather than a long delay'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'webhooks-that-cannot-be-forged',
		title: 'Webhooks that cannot be forged',
		summary:
			'HMAC signatures with a timestamp, and the SSRF check that let the cloud metadata service through.',
		goal: 'Send a webhook a receiver can trust, to a URL that cannot be turned against you.',
		blocks: [
			{
				type: 'p',
				text: 'A webhook arrives at a firm\'s server as an ordinary HTTP POST from the internet. Two questions the receiver must be able to answer: *did Sequent send this?* and *is it recent?*'
			},

			{ type: 'h3', id: 'signing', text: 'Signing' },
			{
				type: 'code',
				file: 'packages/store/src/webhooks.ts',
				lang: 'ts',
				code: `
export function sign(secret: string, body: string, at: number): Signature {
	const timestamp = Math.floor(at / 1000);
	const digest = createHmac('sha256', secret).update(\`\${timestamp}.\${body}\`).digest('hex');

	return { header: \`t=\${timestamp},v1=\${digest}\`, timestamp };
}`
			},
			{
				type: 'p',
				text: 'The header is `t=1755264000,v1=8f3a…`. Three decisions in five lines:'
			},
			{
				type: 'ul',
				items: [
					'**The timestamp is inside the signed string**, not merely alongside it. Signing only the body means a captured request can be replayed a year later and still verifies perfectly. Signing `timestamp.body` means changing the timestamp breaks the signature, so a replay must carry its original time — and be rejected as old.',
					'**`v1=`** is a version tag. The signing scheme is the hardest thing in the world to change once published, because every receiver has hard-coded it. A version prefix means a future `v2` can be sent alongside `v1` and receivers can migrate at their own pace.',
					'**Seconds on the wire, milliseconds in the code.** JavaScript works in milliseconds and every other webhook signing convention uses seconds. Converting at the boundary — here and in `verify` — beats asking every caller to remember which side is which.'
				]
			},

			{ type: 'h3', id: 'verifying', text: 'Verifying' },
			{
				type: 'code',
				file: 'packages/store/src/webhooks.ts',
				lang: 'ts',
				code: `
// Seconds on the wire, milliseconds in \`now\`. Converted here rather than
// asking every caller to remember which side is which.
if (Math.abs(now - seconds * 1000) > toleranceMs) return false;

const expected = createHmac('sha256', secret).update(\`\${seconds}.\${body}\`).digest('hex');

// Lengths must match before \`timingSafeEqual\`, which throws on a mismatch —
// and a throw is itself a timing signal.
if (presented.length !== expected.length) return false;

return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));`
			},
			{
				type: 'why',
				title: 'Why not ===',
				text: 'String comparison stops at the first differing byte, so it returns faster for a signature that is wrong early than for one wrong late. Measure that difference across enough requests and you can recover a valid signature one byte at a time. `timingSafeEqual` always compares every byte. The length check in front matters too: `timingSafeEqual` **throws** on a length mismatch, and a throw is a timing signal of its own.'
			},
			{
				type: 'note',
				text: 'The five-minute tolerance is a trade-off between replay protection and clock skew. Tighter and receivers with a drifting clock start rejecting valid deliveries; looser and a captured request stays useful for longer.'
			},

			{ type: 'h3', id: 'ssrf', text: 'Where you are allowed to send it' },
			{
				type: 'p',
				text: 'A firm types a URL into the admin form and we make an HTTP request to it. That is server-side request forgery waiting to happen: the URL is attacker-controlled, and the request comes from **inside** our network.'
			},
			{
				type: 'code',
				file: 'packages/store/src/webhooks.ts',
				lang: 'ts',
				code: `
if (parsed.protocol !== 'https:' && !(allowInsecure && parsed.protocol === 'http:')) {
	throw new InvalidEndpointUrl(url, 'must be https');
}

// Credentials in a URL end up in logs, in error messages, and in the browser
// history of whoever pasted it into the admin form.
if (parsed.username || parsed.password) {
	throw new InvalidEndpointUrl(url, 'must not contain credentials');
}`
			},

			{ type: 'h3', id: 'ipv6', text: 'The check that looked complete' },
			{
				type: 'p',
				text: 'The first version of the private-address check tested things like `host === \'::1\'`. It never fired. Here is why:'
			},
			{
				type: 'terminal',
				code: `
$ node -e "console.log(new URL('https://[::1]/').hostname)"
[::1]`
			},
			{
				type: 'p',
				text: '`URL.hostname` keeps the brackets. `\'[::1]\' === \'::1\'` is false, so every IPv6 loopback and link-local address sailed straight through a check that looked thorough. One line fixed it:'
			},
			{
				type: 'code',
				file: 'packages/store/src/webhooks.ts',
				lang: 'ts',
				code: `
const host = parsed.hostname.toLowerCase().replace(/^\\[|\\]$/g, '');`
			},
			{
				type: 'p',
				text: 'And then a second, nastier one. IPv4-mapped IPv6 addresses are **normalised by the URL parser**:'
			},
			{
				type: 'terminal',
				code: `
$ node -e "console.log(new URL('https://[::ffff:127.0.0.1]/').hostname)"
[::ffff:7f00:1]`
			},
			{
				type: 'p',
				text: 'The dotted quad is gone by the time we see it. A string check for `127.` finds nothing. The only way to notice is to reassemble the address from the hex:'
			},
			{
				type: 'code',
				file: 'packages/store/src/webhooks.ts',
				lang: 'ts',
				code: `
if (host.startsWith('::ffff:')) {
	const rest = host.slice('::ffff:'.length);
	if (rest.includes('.')) return isPrivateHost(rest);

	const groups = rest.split(':');
	if (groups.length === 2) {
		const high = Number.parseInt(groups[0]!, 16);
		const low = Number.parseInt(groups[1]!, 16);

		if (Number.isFinite(high) && Number.isFinite(low)) {
			return isPrivateHost(\`\${high >> 8}.\${high & 0xff}.\${low >> 8}.\${low & 0xff}\`);
		}
	}
}`
			},
			{
				type: 'warn',
				text: '`0x7f00` and `0x0001` become `127.0` and `0.1`. Two shifts and two masks. The lesson is not "remember IPv4-mapped addresses" — it is that **normalisation happens before your check runs**, so a blocklist written against the string a person typed is testing something that no longer exists.'
			},

			{ type: 'h3', id: 'metadata', text: 'The escape hatch that opened the worst door' },
			{
				type: 'p',
				text: '`allowInsecure` exists so a student can point a webhook at `http://localhost:3000` and watch a delivery arrive. It was implemented as "skip the private-address check".'
			},
			{
				type: 'p',
				text: 'A browser test found what that also permitted: `http://169.254.169.254/latest/meta-data/iam/security-credentials/`. The cloud metadata service. The single most valuable SSRF target there is, accepted by the admin form without complaint, because the dev server had the flag on.'
			},
			{
				type: 'code',
				file: 'packages/store/src/webhooks.ts',
				lang: 'ts',
				code: `
/*
 * Link-local is refused **even in development**, and that is the one carve-out
 * \`allowInsecure\` does not get.
 *
 * …
 *
 * Nobody has ever needed to send a webhook to a link-local address. Making
 * the escape hatch narrower than "turn the check off" costs one branch and
 * removes the worst thing the flag could do.
 */
if (isLinkLocal(host)) {
	throw new InvalidEndpointUrl(url, 'link-local address');
}

if (isPrivateHost(host) && !allowInsecure) {
	throw new InvalidEndpointUrl(url, 'private address');
}`
			},
			{
				type: 'why',
				title: 'Make the escape hatch the right shape',
				text: 'Every development convenience flag is a security control with an off switch. The question is never "should this flag exist?" — it is "what is the *smallest* thing it can turn off and still be useful?". `allowInsecure` needed to permit `localhost`. It did not need to permit the metadata service, and the difference between those two is one branch.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why the timestamp goes inside the signed string',
					'You can explain why `timingSafeEqual` needs a length check in front of it',
					'You can explain why `new URL(…).hostname` broke the IPv6 check twice, for two different reasons',
					'You can explain why link-local is refused even when the insecure flag is on'
				]
			}
		]
	}
];
