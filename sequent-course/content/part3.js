/**
 * PART 3 — Projections, the ledger, and reading (chapters 18–22)
 *
 * The engine decides what happened. This part writes it down in shapes a screen
 * can read quickly — and every one of those shapes is a cache that can be
 * deleted and rebuilt.
 */

export const part3 = [
	{
		slug: 'projections-are-caches',
		title: 'Projections are caches',
		summary:
			'Turning events into queryable tables, and the discipline that lets you delete all of them.',
		goal: 'Build the projector, and understand why "rebuild" is the migration strategy.',
		blocks: [
			{
				type: 'p',
				text: 'The event log answers every question and answers none of them quickly. "What is the current book?" means replaying a million events. So we maintain **projections**: ordinary tables, derived from the log, shaped for the queries a screen actually makes.'
			},
			{
				type: 'ul',
				items: [
					'`trade` — the tape, every trade in order',
					'`order_record` — a participant\'s durable view of their own orders, including finished ones',
					'`position` — net position per account per instrument, with cost basis',
					'`ledger_*` — double-entry bookkeeping, which is the next chapter'
				]
			},
			{
				type: 'why',
				title: 'The rule that makes them safe',
				text: 'Every one of these is a **cache**. Drop all of them and `rebuild()` puts them back from the log. Nothing here is the only copy of anything. When a projection disagrees with the log, the log wins — that is not a policy, it is the definition.'
			},
			{
				type: 'p',
				text: 'That rule has a very practical payoff: changing the shape of a read model is a **truncate and replay**, not an `ALTER TABLE` plus a backfill script that has to be right first time. You want a new column on `trade`? Add it, drop the table, rebuild. Ten seconds and no migration to review.'
			},

			{ type: 'h3', id: 'idempotent', text: 'Every write is idempotent' },
			{
				type: 'p',
				text: 'A projector will be fed the same event twice — that is the normal recovery path, not an exceptional one. So every write has to be safe to repeat.'
			},
			{
				type: 'code',
				file: 'packages/store/src/projections.ts',
				lang: 'ts',
				code: `
case 'order_cancelled': {
	/*
	 * \`filled\` is set from the event's own numbers rather than incremented.
	 *
	 * The event carries what was *remaining*, so the filled quantity is
	 * \`quantity - remaining\` — a value the event fully determines. An
	 * increment would be correct exactly once and wrong on every replay.
	 */
	await tx.execute({
		sql: \`UPDATE order_record
			SET status = CASE WHEN ? = 0 THEN 'filled' ELSE 'cancelled' END,
				cancel_reason = ?,
				filled = quantity - ?,
				updated_at = ?
			WHERE order_id = ?\`,
		args: [event.remainingQuantity, event.reason, event.remainingQuantity, record.at, event.orderId]
	});
	break;
}`
			},

			{ type: 'h3', id: 'guard', text: 'The one place an increment is unavoidable' },
			{
				type: 'p',
				text: 'A trade needs to increment two orders\' `filled`, and there is no "remaining" in the trade event to compute it from. So we guard the whole block behind an idempotency check:'
			},
			{
				type: 'code',
				file: 'packages/store/src/projections.ts',
				lang: 'ts',
				code: `
case 'traded': {
	await tx.execute({
		sql: 'INSERT INTO trade (...) VALUES (...) ON CONFLICT (trade_id) DO NOTHING',
		args: [/* ... */]
	});

	/*
	 * The trade is the idempotency key for everything downstream of it.
	 *
	 * If the ledger already has a transaction under this trade id, this trade has
	 * already been projected — so the position updates and fill increments below
	 * must not run again. Without this check a replayed batch would move every
	 * position twice and the ledger would still balance, which is the worst kind
	 * of wrong: internally consistent and completely false.
	 */
	const alreadySeen = await tx.execute({
		sql: 'SELECT COUNT(*) AS n FROM ledger_transaction WHERE transaction_id = ?',
		args: [event.tradeId]
	});
	if (Number(alreadySeen.rows[0]?.['n'] ?? 0) > 0) break;

	// Everything below runs at most once per trade.
	await applyToPosition(tx, { /* buyer */ });
	await applyToPosition(tx, { /* seller */ });
	await markFilled(tx, event);
	await postTrade(tx, record, event);
	break;
}`
			},

			{ type: 'h3', id: 'bug', text: 'Bug found: a crossed book on the screen' },
			{
				type: 'p',
					text: 'The venue was running. Sign in, look at the terminal, and the depth ladder showed this:'
			},
			{
				type: 'terminal',
				code: `bid levels: [ '£45.51', '£45.505', '£45.50' ]
ask levels: [ '£45.49', '£45.505', '£45.51' ]`
			},
			{
				type: 'p',
				text: 'A best bid of £45.51 above a best ask of £45.49. A crossed book — the thing an entire property test exists to make impossible.'
			},
			{
				type: 'p',
				text: 'The engine was fine. Every invariant held; the property tests were green. The bug was in the **projection**: the `traded` branch updated positions and posted to the ledger, and never marked the orders as filled. Only `order_cancelled` set `status`.'
			},
			{
				type: 'p',
				text: 'So an order that filled **completely** — which produces trades and no cancellation — stayed `status = "working", filled = 0` forever. And the depth ladder, which is derived from working orders, kept showing liquidity that had already been consumed.'
			},
			{
				type: 'code',
				file: 'packages/store/src/projections.ts',
				lang: 'ts',
				code: `
/*
 * Mark both sides as filled.
 *
 * This was missing, and the symptom was excellent: the depth ladder showed a
 * **crossed** book. The engine was right the whole time. Only the read model
 * was lying, which is precisely the failure mode projections have — nothing
 * throws, the numbers are just wrong in a way that looks like a matching bug.
 */
for (const orderId of [event.buyOrderId, event.sellOrderId]) {
	await tx.execute({
		sql: \`UPDATE order_record
			SET filled = filled + ?,
				status = CASE WHEN filled + ? >= quantity THEN 'filled' ELSE status END,
				updated_at = ?
			WHERE order_id = ?\`,
		args: [event.quantity, event.quantity, record.at, orderId]
	});
}`
			},
			{
				type: 'why',
				title: 'What this teaches about testing',
				text: 'Every test in the project was green. The engine tests passed because the engine was right. The projection tests passed because they checked the things somebody thought to check. What found it was **pointing a browser at the running venue and looking at the screen** — and this class of bug can only be found that way, because the failure is that the read model disagrees with the truth, and every layer is internally consistent.'
			},

			{ type: 'h3', id: 'rebuild', text: 'Rebuild, and the one argument that matters' },
			{
				type: 'code',
				file: 'packages/store/src/projections.ts',
				lang: 'ts',
				code: `
export async function rebuild(client: Client): Promise<number> {
	await withTransaction(client, async (tx) => {
		for (const table of ['ledger_posting', 'ledger_transaction', 'ledger_account',
		                     'position', 'trade', 'order_record']) {
			await tx.execute(\`DELETE FROM \${table}\`);
		}
		await tx.execute({
			sql: 'DELETE FROM consumer_checkpoint WHERE consumer = ?',
			args: [PROJECTOR_CONSUMER]
		});
	});

	return catchUp(client, 500, { notify: false });
	//                            ^^^^^^^^^^^^^^^
}`
			},
			{
				type: 'warn',
				text: '`notify: false` is the most important argument in this file. A rebuild replays every event the venue has ever recorded — and without this flag it would also re-enqueue every notification, telling every member firm about six months of trades in one burst because somebody changed the shape of a read model.'
			},
			{
				type: 'p',
				text: 'The outbox\'s idempotency keys would absorb it *only* while the original rows are still there, and `prune` deletes delivered ones. So the protection cannot come from the constraint; it has to be the argument.'
			},
			{
				type: 'why',
				title: 'The general rule',
				text: 'Replay is for **internal** state. Anything that leaves the building must be suppressed during it.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why a projection may be deleted but the log may not',
					'You can explain why `filled = filled + n` needs a guard and `filled = quantity - remaining` does not',
					'You can explain how a correct engine can produce a crossed ladder',
					'You know what `notify: false` protects against'
				]
			}
		]
	},

	{
		slug: 'double-entry',
		title: 'Double entry, and the constraint that makes it work',
		summary:
			'Every transaction sums to zero, signed amounts instead of two columns, and corrections that are entries rather than edits.',
		goal: 'Build the ledger, and understand why one rule is worth more than every other correctness measure combined.',
		blocks: [
			{
				type: 'p',
				text: 'A trade moves money and stock between two firms and takes a fee for the venue. Getting that wrong loses money. So we use the technique accountants settled on six hundred years ago and have not improved since.'
			},
			{
				type: 'why',
				title: 'The rule',
				text: 'Every transaction is a set of postings that **sum to exactly zero**. Money is never created or destroyed, only moved — and the check is enforced in code before the transaction is written, rather than reconciled afterwards.'
			},
			{
				type: 'p',
				text: 'That single rule is worth more than every other correctness measure in this project put together. A ledger that balances *by construction* cannot silently lose a penny. A ledger that is *checked nightly* can lose one every day for a month before anybody runs the report.'
			},

			{ type: 'h3', id: 'signs', text: 'Signs, not columns' },
			{
				type: 'p',
				text: 'Textbook double entry uses two columns — debit and credit — and a rule about which side increases which kind of account. That is the right notation for a human with a pen and the wrong one for a database.'
			},
			{
				type: 'p',
				text: 'Two columns means two places to make an error, and a balance check written as `SUM(debit) - SUM(credit)` — which is a subtraction somebody will eventually get backwards. One **signed** column makes "does this balance" into `SUM(amount) = 0`, which is very hard to get wrong.'
			},
			{
				type: 'code',
				file: 'packages/store/src/ledger.ts',
				lang: 'ts',
				code: `
export interface Posting {
	readonly accountId: string;
	/** Positive is a debit, negative is a credit. They must cancel. */
	readonly amount: Amount;
}

export async function postTransaction(tx: Executor, input: {
	transactionId: string;
	seq: number;
	at: number;
	kind: string;
	postings: readonly Posting[];
}): Promise<void> {
	const total = input.postings.reduce((sum, posting) => sum + posting.amount, 0);

	if (total !== 0) {
		throw new UnbalancedTransaction(input.transactionId, total, input.postings);
	}

	// A transaction with no postings balances trivially and means nothing.
	if (input.postings.length === 0) {
		throw new Error(\`Ledger transaction \${input.transactionId} has no postings\`);
	}

	// ...insert
}`
			},
			{
				type: 'note',
				text: 'Notice what is **not** here: any attempt to fix an imbalance. Rounding the difference into one of the postings would make every transaction balance and quietly move the error into the ledger, where it would compound. Refusing is the feature.'
			},

			{ type: 'h3', id: 'accounts', text: 'Shares are a balance too' },
			{
				type: 'p',
				text: 'The part people find surprising: a firm\'s *stock* is a ledger account, exactly like its cash.'
			},
			{
				type: 'code',
				file: 'packages/store/src/ledger.ts',
				lang: 'ts',
				code: `
export const ACCOUNT_KINDS = [
	/** A firm's money, per currency. */
	'firm_cash',
	/** A firm's holding of one instrument. */
	'firm_securities',
	/** What the venue has earned in fees. */
	'venue_revenue',
	/**
	 * The venue's own side of every trade.
	 *
	 * Every trade here is cleared *centrally*: the venue stands between the two
	 * participants rather than leaving them exposed to each other. So a trade is
	 * two transactions — buyer with the clearing house, seller with the clearing
	 * house — and this account is the clearing house's own position, which nets
	 * to zero across any completed trade. If it does not, one leg is missing.
	 */
	'venue_clearing'
] as const;`
			},
			{
				type: 'p',
				text: 'Modelling stock as a balance is what makes it **impossible** for a trade to debit somebody\'s cash and forget to credit their shares — the transaction would not sum to zero, and `postTransaction` would refuse it.'
			},

			{ type: 'h3', id: 'trade', text: 'What a trade posts' },
			{
				type: 'code',
				file: 'packages/store/src/projections.ts',
				lang: 'ts',
				code: `
const postings: Posting[] = [
	// The exchange of value itself.
	{ accountId: buyerCash,   amount: -notional },
	{ accountId: buyerStock,  amount:  notional },
	{ accountId: sellerStock, amount: -notional },
	{ accountId: sellerCash,  amount:  notional },

	// Fees. A negative fee is a rebate, and the sign handles it with no special
	// case anywhere: the maker is *paid*, and the arithmetic is identical.
	{ accountId: buyerCash,   amount: -event.buyerFee },
	{ accountId: sellerCash,  amount: -event.sellerFee },
	{ accountId: revenue,     amount:  event.buyerFee + event.sellerFee }
];`
			},
			{
				type: 'p',
				text: 'Seven postings, summing to zero. The buyer\'s cash goes down by the notional and their stock up by it; the seller\'s the reverse; the fees come out of both and land in the venue\'s revenue account.'
			},

			{ type: 'h3', id: 'corrections', text: 'Corrections are entries, not edits' },
			{
				type: 'code',
				file: 'packages/store/src/schema.ts',
				lang: 'sql',
				code: `
-- Corrections are reversing entries, never updates. Same rule as the log, and
-- for the same reason: an accountant's question is "what did you think the
-- balance was in March", and an updated row cannot answer it.
CREATE TRIGGER IF NOT EXISTS ledger_posting_is_permanent
BEFORE UPDATE ON ledger_posting
BEGIN
	SELECT RAISE(ABORT, 'ledger postings are immutable; post a reversing entry');
END;`
			},
			{
				type: 'code',
				file: 'packages/store/src/ledger.ts',
				lang: 'ts',
				code: `
/**
 * Reverse a transaction by posting its mirror image.
 *
 * Not a delete and not an update — a new transaction whose postings are the
 * negatives of the original's. The books end up where they would have been if
 * the mistake had never happened, and the record still shows that it did.
 */
export async function reverseTransaction(/* ... */) {
	await postTransaction(tx, {
		kind: 'reversal',
		reference: \`\${originalId} \${input.reason}\`,
		postings: original.map((row) => ({ accountId: row.accountId, amount: -row.amount }))
	});
}`
			},

			{ type: 'h3', id: 'trial-balance', text: 'The cheapest audit there is' },
			{
				type: 'code',
				file: 'packages/store/src/ledger.ts',
				lang: 'ts',
				code: `
/**
 * The trial balance: every account, and the total across all of them.
 *
 * That total must be zero. Not approximately zero, not zero after adjustments —
 * zero, because every posting ever written was part of a transaction that
 * summed to zero, and a sum of zeroes is zero.
 *
 * Running it is the cheapest possible audit and it should be part of the test
 * suite rather than a monthly ritual. If it is ever non-zero, something has
 * written to \`ledger_posting\` outside \`postTransaction\` — and finding out
 * which day that started is much easier than finding out which year.
 */
export async function trialBalance(client: Client) { /* ... */ }`
			},
			{
				type: 'p',
				text: 'This assertion appears at the end of the load test, the fault-injection tests, and the projection tests. It is the single most valuable line in the suite: `expect(total).toBe(0)`.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can state the balancing rule and explain why it is enforced before the write',
					'You can explain why one signed column beats debit and credit columns',
					'You can explain why a firm\'s shares are a ledger account',
					'You can explain why a correction is a new transaction'
				]
			}
		]
	},

	{
		slug: 'multi-tenancy',
		title: 'Multi-tenancy and authorisation',
		summary:
			'Five roles, thirteen actions, and a pure function small enough to enumerate every input of.',
		goal: 'Build the permission model, and understand why the order of the checks is a security decision.',
		blocks: [
			{
				type: 'p',
				text: 'Two firms trade on this venue. Neither may see the other\'s orders, positions, keys or people. That is the **tenant boundary**, and getting it wrong is the failure that ends companies.'
			},
			{
				type: 'why',
				title: 'Why authorisation is a pure function here',
				text: 'A permission bug does not throw. It does not show up in a log. It looks exactly like the feature working, right up until somebody notices that a trader at one firm can cancel another firm\'s orders. The only defence is a decision function small enough to enumerate every input of, and a test that does.'
			},

			{ type: 'h3', id: 'roles', text: 'Five roles, and the two interesting ones' },
			{
				type: 'code',
				file: 'packages/store/src/authz.ts',
				lang: 'ts',
				code: `
export const ROLES = ['trader', 'risk_manager', 'firm_admin', 'auditor', 'venue_operator'] as const;`
			},
			{
				type: 'ul',
				items: [
					'`trader` — sends orders, for the accounts they are assigned to',
					'`risk_manager` — sets limits and pulls the kill switch. **Cannot trade.**',
					'`firm_admin` — manages the firm\'s people, accounts and keys',
					'`auditor` — reads everything at their firm and changes nothing',
					'`venue_operator` — lists instruments, moves phases, halts trading'
				]
			},
			{
				type: 'p',
				text: '`auditor` is the role that breaks naive permission systems. It is not "a trader with fewer permissions" — it can see **more** than a trader (every account, not just its own) while being able to do strictly less. A system built on ranked permission levels cannot express that, and the usual result is an auditor given trader rights "temporarily".'
			},
			{
				type: 'p',
				text: '`risk_manager` is the other one: it can stop trading entirely and cannot place a single order. **Power and privilege are different axes.**'
			},

			{ type: 'h3', id: 'table', text: 'A table, not a chain of ifs' },
			{
				type: 'code',
				file: 'packages/store/src/authz.ts',
				lang: 'ts',
				code: `
/**
 * What each role may do at all, before any scoping.
 *
 * A table rather than a chain of \`if\`s, because a table can be read in one
 * glance and reviewed by somebody who is not a programmer — which, for
 * authorisation, is a feature. The compliance officer who has to sign this off
 * should be able to check it.
 */
const ALLOWED: Readonly<Record<Role, readonly Action[]>> = {
	trader: ['place_order', 'cancel_order', 'view_orders', 'view_positions'],

	risk_manager: ['cancel_firm_orders', 'view_orders', 'view_positions', 'view_ledger',
	               'set_risk_limits', 'engage_kill_switch'],

	firm_admin: ['view_orders', 'view_positions', 'view_ledger', 'manage_users',
	             'manage_api_keys', 'cancel_firm_orders'],

	// Reads everything, writes nothing. Note it can see the ledger and the audit
	// log, which a trader cannot — more visibility, less power.
	auditor: ['view_orders', 'view_positions', 'view_ledger', 'view_audit_log'],

	venue_operator: ['list_instrument', 'set_phase', 'view_audit_log', 'view_orders']
};`
			},

			{ type: 'h3', id: 'order', text: 'The order of the checks is a security decision' },
			{
				type: 'code',
				file: 'packages/store/src/authz.ts',
				lang: 'ts',
				code: `
export function can(viewer: Viewer, action: Action, target: Target = {}): Decision {
	/*
	 * 1. The tenant boundary — FIRST.
	 *
	 * A venue operator is above it. Everybody else is confined to their own
	 * firm, and asking about another one gets the same answer as asking about a
	 * firm that does not exist.
	 */
	if (target.firmId !== undefined && target.firmId !== viewer.firmId) {
		if (viewer.role !== 'venue_operator') return deny('not_found');
	}

	// 2. Does the role permit this action at all?
	if (!ALLOWED[viewer.role].includes(action)) return deny('forbidden');

	// 3. Account assignment. Belonging to the firm is not the same as being
	//    allowed to trade on a particular desk.
	if (target.accountId !== undefined && needsAssignment(viewer.role)) {
		if (!viewer.accountIds.includes(target.accountId)) return deny('account_not_assigned');
	}

	// 4. API key scopes, if this is a key rather than a person. Applied last,
	//    and only ever narrowing.
	if (viewer.scopes !== undefined) {
		if (!viewer.scopes.includes(SCOPE_FOR[action])) return deny('missing_scope');
	}

	return ALLOW;
}`
			},
			{
				type: 'why',
				title: 'Why the tenant boundary is checked first',
				text: 'So that everything after it can only ever leak information about the viewer\'s own firm. If the role check came first, an auditor asking about another firm would get "you are not a risk manager" — which confirms the firm exists. Checked first, they get "not found", which tells them nothing.'
			},

			{ type: 'h3', id: 'not-found', text: '`not_found` is a denial' },
			{
				type: 'code',
				file: 'packages/store/src/authz.ts',
				lang: 'ts',
				code: `
/**
 * Why something was refused.
 *
 * \`not_found\` is a *denial*, and the distinction from \`forbidden\` is the whole
 * point of having both. Telling somebody "that firm exists but is not yours"
 * leaks the venue's member list one guess at a time. Telling a colleague at
 * their own firm "you are not a risk manager" protects nothing and merely
 * confuses them.
 *
 * The rule: **across a tenant boundary, deny as \`not_found\`. Inside one, deny
 * as \`forbidden\`.**
 */
export type DenialReason =
	| 'not_found'
	| 'forbidden'
	| 'account_not_assigned'
	| 'missing_scope'
	| 'inactive';`
			},

			{ type: 'h3', id: 'exhaustive', text: 'Tested exhaustively, and that is not a figure of speech' },
			{
				type: 'code',
				file: 'packages/store/src/authz.spec.ts',
				lang: 'ts',
				code: `
it('has a complete and deliberate matrix', () => {
	// Five roles, thirteen actions, sixty-five assertions. Every cell of the
	// permission table, asserted explicitly — so a change to ALLOWED that
	// somebody did not mean to make fails here rather than in production.
	for (const role of ROLES) {
		for (const action of ACTIONS) {
			expect(can(viewer(role), action).allowed, \`\${role} / \${action}\`)
				.toBe(EXPECTED[role].includes(action));
		}
	}
});`
			},
			{
				type: 'note',
				text: 'Sixty-five assertions sounds excessive until you consider the alternative: a permission table that nobody has ever checked in full, protecting other people\'s money. It is possible *because* `can` is pure — no database, no request, no session lookup.'
			},

			{ type: 'h3', id: 'bug', text: 'Bug found: the risk console let traders in' },
			{
				type: 'p',
				text: 'The risk console\'s load function gated on `view_positions`:'
			},
			{
				type: 'code',
				file: 'the wrong version',
				lang: 'ts',
				code: `
const decision = can(locals.viewer, 'view_positions', { firmId: locals.viewer.firmId });
if (!decision.allowed) error(403, 'Your role does not allow that.');`
			},
			{
				type: 'p',
				text: 'Which sounds right — the risk console shows positions. But **every trader has `view_positions`**, because a trader can see their own. So every trader could open the risk console and read the firm\'s trial balance.'
			},
			{
				type: 'p',
				text: 'Found by a browser test that signed in as a trader and asked for `/risk`. It got 200.'
			},
			{
				type: 'code',
				file: 'apps/web/src/routes/risk/+page.server.ts',
				lang: 'ts',
				code: `
/*
 * Gated on \`view_ledger\` rather than \`view_positions\`, and the difference
 * matters: every trader can see their own positions, so the first version let
 * traders straight into the risk console. \`view_ledger\` is held by exactly the
 * roles this screen is for — risk managers, firm admins and auditors.
 */
const decision = can(locals.viewer, 'view_ledger', { firmId: locals.viewer.firmId });
if (!decision.allowed) error(403, 'Your role does not allow that.');`
			},
			{
				type: 'why',
				title: 'The lesson, which generalises',
				text: 'Gate a screen on the permission that **describes** it, not on the first permission that happens to sound related. "This screen shows positions, so gate on view_positions" is a sentence that reads well and protects nothing.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why `auditor` breaks a ranked-permissions model',
					'You can explain why the tenant boundary is checked before the role',
					'You can explain when to deny as `not_found` and when as `forbidden`',
					'You can explain why gating on a related-sounding permission is dangerous'
				]
			}
		]
	},

	{
		slug: 'keys-and-secrets',
		title: 'Keys, secrets, and what may be stored in clear',
		summary:
			'scrypt, timing-safe comparison, two-part keys — and the one secret that must not be hashed.',
		goal: 'Build API keys and webhook secrets, and understand why they are stored differently.',
		blocks: [
			{
				type: 'p',
				text: 'Two kinds of secret in this venue, stored two different ways, and the reason is worth internalising because it is regularly got wrong in both directions.'
			},

			{ type: 'h3', id: 'passwords', text: 'Hashing what you only need to verify' },
			{
				type: 'code',
				file: 'packages/store/src/tenancy.ts',
				lang: 'ts',
				code: `
/**
 * Hash a password or an API secret.
 *
 * scrypt with a per-secret salt. Deliberately slow — that is the entire point
 * of a password hash, and a fast one is a vulnerability rather than an
 * optimisation.
 */
export function hashSecret(secret: string): string {
	const salt = randomBytes(16);
	const derived = scryptSync(secret, salt, 64);
	return \`\${salt.toString('hex')}:\${derived.toString('hex')}\`;
}

/**
 * Check a secret against a stored hash, in constant time.
 *
 * \`timingSafeEqual\` rather than \`===\`. String comparison stops at the first
 * differing byte, so how long it takes leaks how much of the guess was right —
 * enough, over many attempts, to recover a secret one character at a time. The
 * attack is fiddly over a network and completely practical against a local
 * service, and the defence costs nothing.
 */
export function verifySecret(secret: string, stored: string): boolean {
	const [saltHex, expectedHex] = stored.split(':');
	if (!saltHex || !expectedHex) return false;

	const expected = Buffer.from(expectedHex, 'hex');
	const actual = scryptSync(secret, Buffer.from(saltHex, 'hex'), expected.length);

	return timingSafeEqual(actual, expected);
}`
			},

			{ type: 'h3', id: 'two-part', text: 'Why an API key has two parts' },
			{
				type: 'p',
				text: 'A key looks like `ak_7f2c….A8c4Db…`. The first half is an identifier stored in clear; the second is the secret, stored only as a hash.'
			},
			{
				type: 'why',
				title: 'The split is not cosmetic',
				text: 'With one opaque blob you would have to scrypt the presented key against **every** stored hash to find out whose it is — O(keys) deliberately-slow hashes per request. Thousands of keys would make authentication cost more than the query it guards. With the id in clear, verification is one indexed lookup and one hash.'
			},
			{
				type: 'p',
				text: 'The prefix has a second use: it is **greppable**. Secret scanners find `ak_`-prefixed strings in a pushed commit precisely because the shape is recognisable, which is a good reason to make credentials *look* like credentials rather than like random noise.'
			},

			{ type: 'h3', id: 'shown-once', text: 'Shown once, stored never' },
			{
				type: 'p',
				text: 'The secret is returned from `createApiKey` and then it is gone. There is no code path anywhere that can recover it.'
			},
			{
				type: 'p',
				text: 'People find this annoying, and every venue that has softened it has regretted it. A system that can show you your own key can be made to show it to somebody wearing your face — a support agent talked into it, a database backup on a laptop, a subpoena. "Lost it? Here is a new one" costs a member firm ninety seconds and removes the entire category.'
			},

			{ type: 'h3', id: 'webhook', text: 'The secret that must not be hashed' },
			{
				type: 'p',
				text: 'A webhook signing secret is stored **in clear**, and that is not an oversight.'
			},
			{
				type: 'why',
				title: 'Verify versus compute',
				text: 'An API key\'s secret is only ever **verified** — somebody presents one and we check it. A one-way hash is enough. A webhook secret must be **used** to compute a signature on every delivery, so we need the original bytes. A hashed signing key cannot sign.'
			},
			{
				type: 'warn',
				text: 'The consequence is that `webhook_endpoint` is more sensitive than `api_key`: a dump of it lets somebody forge our webhooks to our members. In production these belong behind a KMS. Saying so plainly is better than a comment claiming it is fine.'
			},

			{ type: 'h3', id: 'scopes', text: 'Scopes narrow; they never promote' },
			{
				type: 'code',
				file: 'packages/store/src/tenancy.ts',
				lang: 'ts',
				code: `
/*
 * A key is always a \`trader\`, whatever its scopes say.
 *
 * Scopes narrow; they never promote. A key cannot be an admin because no human
 * reviews what an algorithm decides to do at 400 orders a second, and the blast
 * radius of a compromised key should not include the firm's user list.
 */
const viewer: Viewer = {
	userId: \`key:\${keyId}\`,
	firmId,
	role: 'trader',
	accountIds,
	scopes: String(row['scopes']).split(' ').filter(Boolean)
};`
			},
			{
				type: 'p',
				text: 'And because the scope check is the *last* narrowing in `can`, revoking a person\'s account is enough to stop their keys — rather than a separate job somebody forgets.'
			},

			{ type: 'h3', id: 'bug', text: 'Bug found: an unpinned key could trade nothing' },
			{
				type: 'p',
				text: 'A key can be pinned to one trading account, or left unpinned to trade all of the firm\'s. The unpinned branch looked like this:'
			},
			{
				type: 'code',
				file: 'the wrong version',
				lang: 'ts',
				code: `
accountIds: accountId ? [accountId] : await accountsFor(client, \`key:\${keyId}\`, firmId, 'trader')`
			},
			{
				type: 'p',
				text: '`accountsFor` looks up `account_assignment`, which is keyed on `venue_user`. A key is not a user, so the lookup returns nothing — **always**.'
			},
			{
				type: 'p',
				text: 'The result was an unpinned key that authenticated perfectly and then refused every order it sent, with `account_not_assigned` and nothing in any log explaining why. Found by a unit test that expected `missing_scope` and got `account_not_assigned`.'
			},
			{
				type: 'code',
				file: 'packages/store/src/tenancy.ts',
				lang: 'ts',
				code: `
const accountIds = accountId ? [accountId] : await allAccountsOf(client, firmId);`
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why an API key has two parts',
					'You can explain why a webhook secret is stored in clear and a key secret is not',
					'You can explain why a key is always a trader',
					'You can explain why `timingSafeEqual` is worth using'
				]
			}
		]
	},

	{
		slug: 'the-gateway',
		title: 'The gateway',
		summary:
			'The only way a command reaches the log — and the one line that stops a client trading as somebody else.',
		goal: 'Build the write path, and understand why identity is stamped on before validation rather than after.',
		blocks: [
			{
				type: 'p',
				text: 'The gateway\'s job is small, and worth stating precisely because the temptation is to make it bigger. It authenticates, it authorises, it validates, and it appends.'
			},
			{
				type: 'p',
				text: 'It does **not** decide anything about trading. Whether an order is too large, whether it crosses, whether the instrument is halted are all the engine\'s business, and answering them here would mean answering them twice. Two answers to the same question is how a system starts disagreeing with itself.'
			},

			{ type: 'h3', id: 'identity', text: 'The most important line' },
			{
				type: 'code',
				file: 'apps/web/src/lib/server/gateway.ts',
				lang: 'ts',
				code: `
/*
 * Identity is stamped on **before** the command is parsed, not after.
 *
 * The order is the point. A client that could name its own firm could trade as
 * anybody, so \`firmId\` and \`actorId\` are overwritten with the viewer's — and
 * doing it first means a client-supplied value is never even syntactically
 * meaningful. There is no window in which a parsed command carries a firm
 * somebody else chose.
 */
const claimed = {
	...(input as Record<string, unknown>),
	firmId: viewer.firmId,
	actorId: viewer.userId
};

let authorised: Command;
try {
	authorised = parseCommand(claimed);
} catch (thrown) {
	error(400, thrown instanceof Error ? thrown.message : 'Invalid command');
}`
			},
			{
				type: 'warn',
				text: 'This is the single most important line in the gateway, and it is one line — which is exactly why it is easy to leave out. Without it, `{"firmId": "lowfield", ...}` in a request body lets Northgate trade as Lowfield.'
			},

			{ type: 'h3', id: 'ordering-bug', text: 'Why it moved from after to before' },
			{
				type: 'p',
				text: 'The first version parsed the command and *then* overwrote the identity. That also worked, and had a subtler cost: the schema required a `firmId`, so every caller had to invent one purely to have it thrown away.'
			},
			{
				type: 'p',
				text: 'The public API\'s very first order came back with:'
			},
			{
				type: 'terminal',
				code: `{"error":{"code":"invalid_request",
  "message":"Invalid key: Expected \\"firmId\\" but received undefined"}}`
			},
			{
				type: 'p',
				text: 'A confusing thing to tell somebody about a field they are not allowed to set. Stamping first fixes the message and removes the window in one change.'
			},

			{ type: 'h3', id: 'action-map', text: 'Which permission each command needs' },
			{
				type: 'code',
				file: 'apps/web/src/lib/server/gateway.ts',
				lang: 'ts',
				code: `
const ACTION_FOR: Record<Command['kind'], Action> = {
	place_order: 'place_order',
	cancel_order: 'cancel_order',
	replace_order: 'place_order',
	cancel_all: 'cancel_firm_orders',
	set_risk_limits: 'set_risk_limits',
	set_kill_switch: 'engage_kill_switch',
	list_instrument: 'list_instrument',
	set_phase: 'set_phase',
	tick: 'set_phase'
};`
			},
			{
				type: 'note',
				text: 'A `Record<Command["kind"], Action>` rather than a partial map. Adding a tenth command is a compile error here — you cannot forget to decide what permission it needs, which is the kind of omission that ships.'
			},

			{ type: 'h3', id: 'flags', text: 'Where the pause goes' },
			{
				type: 'code',
				file: 'apps/web/src/lib/server/gateway.ts',
				lang: 'ts',
				code: `
/*
 * The flag check goes **after** authorisation and before the append.
 *
 * After, because "the venue is paused" is not something to tell somebody who
 * was not allowed to send this anyway — that would leak which commands exist to
 * whoever is probing. Before the append, because a paused venue must not put
 * the command in the log at all: a log entry is a promise the engine will apply
 * it, and pausing means not making that promise.
 */
const flag = FLAG_FOR[authorised.kind];
if (flag && !(await flags.enabled(flag))) {
	// 503, not 403. The caller did nothing wrong and should retry later, which
	// is exactly what 503 means and 403 does not.
	error(503, 'The venue is not accepting new orders at the moment. Cancels still work.');
}`
			},
			{
				type: 'warn',
				text: '`cancel_order` deliberately has **no** flag. A pause that traps somebody\'s resting orders is worse than no pause at all — the entire point of pausing is to let people get out.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can state the gateway\'s four jobs, and one thing it must not do',
					'You can explain why identity is stamped on before parsing',
					'You can explain why the flag check sits between authorisation and the append',
					'You can explain why cancels are never paused'
				]
			}
		]
	}
];
