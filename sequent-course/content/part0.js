/**
 * PART 0 — What we are building, and the four things that make it hard
 * (chapters 01–05)
 *
 * No code for the first two chapters. That is deliberate: an exchange has four
 * genuinely difficult properties, and every one of them is a design decision
 * made before the first file exists. Starting to type before you understand
 * them produces a system you have to throw away.
 */

export const part0 = [
	{
		slug: 'what-we-are-building',
		title: 'What we are building',
		summary:
			'A stock exchange: an order book, an opening auction, pre-trade risk, central clearing and a double-entry ledger — with an event log the whole thing can be rebuilt from.',
		goal: 'Understand what the finished venue does, and why each part of it exists, before writing anything.',
		blocks: [
			{
				type: 'p',
				text: 'We are going to build **Sequent**: a small but genuinely complete stock exchange. Not a mock, not a simulation with the interesting parts stubbed out. Orders arrive, match against each other by price and time, produce trades, and those trades move money and stock in a ledger that balances.'
			},
			{
				type: 'p',
				text: 'By the end you will have written a matching engine, an opening auction, a risk layer with a kill switch, a double-entry clearing system, a multi-tenant permission model, a public API with rate limits, a webhook delivery system that cannot lose a message, and a trading terminal that updates live. Roughly eleven thousand lines, and every one of them earns its place.'
			},

			{ type: 'h3', id: 'why-an-exchange', text: 'Why an exchange, specifically' },
			{
				type: 'p',
				text: 'Because the difficulty is real rather than imposed. A lot of "advanced" tutorials are ordinary CRUD applications with more screens. An exchange is different: it has four properties that are hard *in principle*, and no amount of framework knowledge makes them easy.'
			},
			{
				type: 'ol',
				items: [
					'**Order matters absolutely.** Two orders arriving at the same moment must have a definite winner, and the venue must be able to say which — forever.',
					'**Money must not be created or destroyed.** Not approximately. A venue that loses a penny a day loses a customer eventually and a licence shortly after.',
					'**What happened must be reconstructable.** "What did the book look like at 14:32:07 last Tuesday" is a question with one right answer, and an auditor will ask it.',
					'**Being wrong is expensive.** A booking app that double-books costs an apology. A venue that double-fills costs the difference, in cash, to somebody who noticed.'
				]
			},
			{
				type: 'why',
				title: 'Why this is worth your time even if you never build an exchange',
				text: 'Every technique here transfers. Event sourcing, idempotent consumers, the transactional outbox, double-entry bookkeeping, deterministic replay — these are the tools you reach for whenever *being wrong quietly* is unacceptable. An exchange is simply the domain where the consequences are obvious enough that you cannot talk yourself out of doing it properly.'
			},

			{ type: 'h3', id: 'the-shape', text: 'The shape of it' },
			{
				type: 'terminal',
				code: `                  ┌──────────────┐
   browser ───────│  apps/web    │──── commands ──┐
   API client ────│  SvelteKit 3 │                │
                  └──────────────┘                ▼
                         ▲                 ┌─────────────┐
                         │                 │ command_log │  ← the only writer
                    reads│                 └─────────────┘     is the sequencer
                         │                        │
                  ┌──────┴───────┐                ▼
                  │ projections  │◀───────┌──────────────┐
                  │ tape, orders │ events │ apps/engine  │  ← single threaded,
                  │ positions,   │        │  pure rules  │     deterministic
                  │ the ledger   │        └──────────────┘
                  └──────┬───────┘
                         │ same transaction
                         ▼
                    ┌─────────┐      ┌──────────────┐
                    │ outbox  │─────▶│ apps/worker  │──▶ signed webhooks,
                    └─────────┘      └──────────────┘    email`
			},
			{
				type: 'p',
				text: 'Three processes. The web tier accepts requests and does exactly one thing with them: appends a **command** to a log. The engine reads that log and decides what actually happened, producing **events**. Everything else reads events.'
			},

			{ type: 'h3', id: 'commands-events', text: 'Commands and events are different words' },
			{
				type: 'p',
				text: 'This distinction runs through the entire project, so it is worth being precise about it now.'
			},
			{
				type: 'ul',
				items: [
					'A **command** is a request: *place this order*. It can be refused. It is written in the imperative.',
					'An **event** is a fact: *this order traded 400 at 455050*. It already happened. It is written in the past tense, and it cannot be refused because it is not asking.'
				]
			},
			{
				type: 'p',
				text: 'The web tier only ever writes commands. It never decides anything. When you submit an order, the honest answer the venue can give you immediately is "we have your request, and it is number 8,134 in the queue" — not "you bought". Whether you bought is decided by the engine a moment later.'
			},
			{
				type: 'note',
				text: 'This is why our order endpoint answers **202 Accepted** rather than 201 Created. Returning 201 would be a lie, and blocking until the engine caught up would give the endpoint the engine\'s latency plus a deadlock to look forward to.'
			},

			{ type: 'h3', id: 'what-you-need', text: 'What you need' },
			{
				type: 'ul',
				items: [
					'**Node 24 LTS** — we use its ability to run TypeScript directly, with no build step for the server-side code',
					'**pnpm** — the workspace is a monorepo and pnpm handles that better than the alternatives',
					'A terminal, an editor, and a browser',
					'No prior knowledge of finance. Every term is defined the first time it appears.'
				]
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what a command is and what an event is, and why they are not the same',
					'You can name the three processes and what each one is responsible for',
					'You understand why the venue answers 202 rather than 201'
				]
			}
		]
	},

	{
		slug: 'the-four-hard-parts',
		title: 'The four hard parts',
		summary:
			'Ordering, money, reconstructability and blast radius. Each one dictates a design decision we make before writing any code.',
		goal: 'Understand the four constraints well enough that the architecture in the next chapter feels inevitable rather than arbitrary.',
		blocks: [
			{
				type: 'p',
				text: 'Everything in this project follows from four constraints. If you understand them, the architecture stops looking like a set of choices and starts looking like the only thing that could work.'
			},

			{ type: 'h3', id: 'ordering', text: '1. Order matters absolutely' },
			{
				type: 'p',
				text: 'Two traders both want to buy at £45.50. There are only 100 shares available. Who gets them?'
			},
			{
				type: 'p',
				text: 'The answer has to be **whoever asked first**, and the venue has to be able to prove it. Not "probably the first one". Not "whichever thread got the lock". A definite, defensible, permanent answer.'
			},
			{
				type: 'p',
				text: 'That requirement is much stronger than it sounds. It means the venue must impose a **total order** on every request it receives — a single numbered sequence that everybody agrees on. And the cheapest way to get a total order that nobody can argue with is to have exactly one thing assigning the numbers.'
			},
			{
				type: 'why',
				title: 'Why one writer, and what it costs',
				text: 'Two processes assigning sequence numbers would have to agree with each other on the order — and every distributed consensus protocol ever written exists because that agreement is expensive. One writer makes it free. The cost is a throughput ceiling: the venue can never accept more orders per second than one process can write. That is a real limit and it is the right trade, because an exchange that could accept two orders simultaneously would have to explain which was first, and "we are not sure" is not an answer a venue can give.'
			},

			{ type: 'h3', id: 'money', text: '2. Money must not leak' },
			{
				type: 'p',
				text: 'Every price and every amount in this project is an **integer**. There is not a single floating-point number anywhere near the money, and the reason fits on one line.'
			},
			{
				type: 'terminal',
				code: `$ node -e "console.log(0.1 + 0.2)"
0.30000000000000004`
			},
			{
				type: 'p',
				text: 'Binary floating point cannot represent 0.1 exactly, any more than decimal can represent one third. Add enough of them together and the error becomes visible. A venue that rounds is a venue that loses money, slowly, in a way that takes an auditor to find.'
			},
			{
				type: 'p',
				text: 'So we scale. £45.505 is stored as `455050` — the price in ten-thousandths of a pound. Integers add and subtract exactly, forever, and JavaScript integers are exact up to about nine quadrillion, which is comfortably more money than this venue will ever see.'
			},
			{
				type: 'p',
				text: 'The second half of not leaking money is **double-entry bookkeeping**: every transaction is a set of entries that sum to exactly zero. Money is never created or destroyed, only moved. We will build that in Part 4.'
			},

			{ type: 'h3', id: 'reconstruct', text: '3. What happened must be reconstructable' },
			{
				type: 'p',
				text: 'An auditor asks: what did the order book look like at 14:32:07 on the third of March?'
			},
			{
				type: 'p',
				text: 'If your system stores *current state* — a table of orders that you `UPDATE` as things change — that question has no answer. The information is gone. You overwrote it.'
			},
			{
				type: 'p',
				text: 'So we store the **log**, not the state. Every command, in order, forever. The current state is what you get by replaying it. That is called **event sourcing**, and it is the single biggest structural decision in this project.'
			},
			{
				type: 'ul',
				items: [
					'"What is the book now?" — replay everything',
					'"What was the book at seq 8,134?" — replay up to 8,134',
					'"Why did this order get rejected?" — read the command and the event it produced',
					'"Did we compute this fee correctly in March?" — replay March with the rules that were in force in March'
				]
			},
			{
				type: 'p',
				text: 'That last one is why every command in the log records which **version** of the rules was in force when it arrived. Changing how matching works must not rewrite what happened last March.'
			},

			{ type: 'h3', id: 'blast-radius', text: '4. Being wrong is expensive' },
			{
				type: 'p',
				text: 'A permission bug in a booking app shows somebody another salon\'s diary. A permission bug here lets a trader at one firm cancel a competitor\'s orders — which is market manipulation, and the sort of thing that ends a company.'
			},
			{
				type: 'p',
				text: 'This shapes how we test. Ordinary example-based tests ("given this book and this order, expect this trade") are necessary and nowhere near sufficient, because they only check the cases you thought of. We will use two other kinds:'
			},
			{
				type: 'ul',
				items: [
					'**Property-based tests** that generate hundreds of random order sequences and assert things that must *never* be true — the book is never crossed, quantity is conserved. These found three real bugs in this codebase that example tests structurally could not.',
					'**Fault injection** that kills the engine mid-session, corrupts its snapshot and restarts it on every single command, then checks the state fingerprint is identical. This found one.'
				]
			},
			{
				type: 'note',
				text: 'Throughout the course, chapters that end with a **Bug found** section are describing something that genuinely went wrong while this project was being built, and how it was caught. Those sections are the most valuable part of the course, because the mistakes are the ones you are about to make.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why the venue has exactly one writer, and what that costs',
					'You can explain why `0.1 + 0.2` is a reason to use integers for money',
					'You understand what event sourcing is and which question it exists to answer',
					'You know the difference between an example test and a property test'
				]
			}
		]
	},

	{
		slug: 'the-workspace',
		title: 'The workspace',
		summary:
			'Six packages, and a dependency rule that makes the most important property of the engine impossible to break by accident.',
		goal: 'Set up the monorepo, and understand why `packages/core` is forbidden from depending on `packages/store`.',
		blocks: [
			{
				type: 'p',
				text: 'Let us build the skeleton. Make a folder and set up a pnpm workspace.'
			},
			{
				type: 'terminal',
				code: `mkdir sequent && cd sequent
pnpm init
mkdir -p apps/web apps/engine apps/worker
mkdir -p packages/protocol packages/core packages/store`
			},
			{
				type: 'code',
				file: 'pnpm-workspace.yaml',
				lang: 'yaml',
				code: `
# The workspace.
#
# Three runnable processes under \`apps/\`, and the code they share under
# \`packages/\`. The split is not tidiness — it is enforcement.
#
# \`packages/core\` has no dependency on \`packages/store\`, and it cannot acquire
# one without somebody editing a package.json and being asked why. That is the
# whole point: the matching engine must not be able to reach a database, a
# clock, or a network, and the surest way to guarantee that is to put it
# somewhere those things do not exist.
packages:
  - 'apps/*'
  - 'packages/*'

# Keep the lockfile honest about what each package actually uses, rather than
# letting a transitive dependency satisfy an undeclared import.
linkWorkspacePackages: true`
			},

			{ type: 'h3', id: 'the-six', text: 'The six packages' },
			{
				type: 'ul',
				items: [
					'`packages/protocol` — commands, events, money, ids. The vocabulary, versioned.',
					'`packages/core` — the matching engine, auctions and risk. **Pure functions, no I/O of any kind.**',
					'`packages/store` — the log, projections, the ledger, tenancy, authorisation.',
					'`apps/engine` — the process that turns commands into events, and recovers from crashes.',
					'`apps/worker` — drains the outbox: signed webhooks, and email.',
					'`apps/web` — SvelteKit 3: the terminal, the risk console, the admin area, the public API.'
				]
			},

			{
				type: 'why',
				title: 'Why the dependency rule is load-bearing',
				text: 'The engine must be a **pure function**: same inputs, same outputs, every time. That is what makes replay produce identical history, which is what makes the audit question answerable. A single `Date.now()` inside it would break that — replaying tomorrow would produce different timestamps. So would a database read, or a random number.'
			},
			{
				type: 'p',
				text: 'You could enforce that with a code review checklist. Checklists get skipped at 5pm on a Friday. Instead we enforce it with the module graph: `packages/core` does not list `packages/store` as a dependency, so `import { db } from "@sequent/store"` simply fails to resolve. Somebody has to deliberately edit a `package.json` — and be asked why in review.'
			},
			{
				type: 'note',
				text: 'The same trick is used for randomness. `packages/protocol` exports `newId()` — which uses `node:crypto` — from a **separate subpath**, `@sequent/protocol/generate`. The engine imports `@sequent/protocol` and gets everything except the one function that would make it non-deterministic.'
			},

			{ type: 'h3', id: 'typescript', text: 'TypeScript, run directly' },
			{
				type: 'code',
				file: 'tsconfig.base.json',
				lang: 'json',
				code: `
{
	"compilerOptions": {
		"target": "esnext",
		"module": "nodenext",
		"moduleResolution": "nodenext",
		"strict": true,

		// \`array[0]\` is \`T | undefined\`. Half this codebase asks "what is the best
		// bid", and the honest answer is often "there isn't one".
		"noUncheckedIndexedAccess": true,

		// \`{ a?: string }\` and \`{ a: string | undefined }\` become different types.
		// Fiddly, and it is what catches "I passed undefined where the field was
		// supposed to be absent" — which matters on the wire.
		"exactOptionalPropertyTypes": true,

		"noImplicitOverride": true,
		"noFallthroughCasesInSwitch": true,
		"verbatimModuleSyntax": true,
		"isolatedModules": true,
		"skipLibCheck": true,
		"noEmit": true
	}
}`
			},
			{
				type: 'p',
				text: 'Node 24 runs TypeScript directly by **stripping the types** — it deletes them and runs what is left. No build step, no watcher, no `dist` folder for the server-side code. That is a genuine simplification, and it comes with one rule.'
			},
			{
				type: 'warn',
				text: 'Strip-only means Node refuses any TypeScript syntax that requires code to be **generated**. The commonest is a constructor parameter property: `constructor(private readonly client: Client) {}` looks like a type annotation and is actually an instruction to emit an assignment. It fails with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. The same rule rules out enums, namespaces and decorators.'
			},
			{
				type: 'p',
				text: 'Write the field out instead. Three extra lines buys running the source directly with no build step at all:'
			},
			{
				type: 'code',
				file: 'the shape Node accepts',
				lang: 'ts',
				code: `
export class Sequencer {
	readonly #client: Client;

	constructor(client: Client) {
		this.#client = client;
	}
}`
			},
			{
				type: 'checkpoint',
				items: [
					'You have a pnpm workspace with six package folders',
					'You can explain why `packages/core` must not depend on `packages/store`',
					'You know what strip-only TypeScript refuses, and why'
				]
			}
		]
	},

	{
		slug: 'money-as-integers',
		title: 'Money, as integers',
		summary:
			'Scaled integers, branded types, and a `parsePrice` that never multiplies by 10,000.',
		goal: 'Build the money layer, and understand why the obvious implementation of `parsePrice` is wrong.',
		blocks: [
			{
				type: 'p',
				text: 'The first real code. Every price, quantity and amount in Sequent is an integer, scaled by 10,000.'
			},
			{
				type: 'code',
				file: 'packages/protocol/src/money.ts',
				lang: 'ts',
				code: `
/**
 * The scale.
 *
 * £45.505 is 455050. Four decimal places, which is more precision than any
 * exchange quotes in and enough that a fee of three basis points on a small
 * trade does not round to nothing.
 */
export const SCALE = 10_000;`
			},

			{ type: 'h3', id: 'branded', text: 'Branded types' },
			{
				type: 'p',
				text: 'A price and a quantity are both numbers, and passing one where the other belongs is the easiest mistake in this codebase to make and the hardest to see. TypeScript can stop it, with a trick:'
			},
			{
				type: 'code',
				file: 'packages/protocol/src/money.ts',
				lang: 'ts',
				code: `
declare const brand: unique symbol;

/**
 * A scaled price. Structurally a number; nominally its own type.
 *
 * The \`brand\` property does not exist at runtime — it is erased along with
 * every other type. What it buys is that \`Price\` and \`Quantity\` stop being
 * interchangeable at compile time, so \`notional(quantity, price)\` with the
 * arguments the wrong way round is an error rather than a very wrong number.
 */
export type Price = number & { readonly [brand]: 'Price' };
export type Quantity = number & { readonly [brand]: 'Quantity' };
export type Amount = number & { readonly [brand]: 'Amount' };

export const price = (value: number): Price => {
	if (!Number.isSafeInteger(value)) {
		throw new TypeError(\`A price must be a safe integer in scaled units, got \${value}\`);
	}
	return value as Price;
};`
			},
			{
				type: 'note',
				text: 'The runtime check matters as much as the type. `price(45.505)` is a type error *and* throws — because the value that reaches this function at runtime came off a wire, and a type is not a validation.'
			},

			{ type: 'h3', id: 'notional', text: 'Multiplying two scaled numbers' },
			{
				type: 'p',
				text: 'Here is a trap. If price is scaled by 10,000 and quantity is a plain count, then `price × quantity` is scaled by 10,000 — good. But if you ever multiply two *scaled* numbers together you get something scaled by 100,000,000, and if you forget to divide, every number downstream is ten thousand times too big.'
			},
			{
				type: 'p',
				text: 'We avoid it by keeping quantity **unscaled** — a quantity of 400 is four hundred shares, not 0.04 — so there is only ever one scaled operand.'
			},
			{
				type: 'code',
				file: 'packages/protocol/src/money.ts',
				lang: 'ts',
				code: `
/** What a trade is worth: price × quantity, still in scaled units. */
export const notional = (unitPrice: Price, howMany: Quantity): Amount =>
	(unitPrice * howMany) as Amount;

/**
 * A fee in basis points, truncated **toward zero**.
 *
 * Truncation rather than rounding, and the direction is deliberate: a fee that
 * rounds up takes a fraction of a penny more than it should from every trade,
 * and across a million trades that is real money taken by an arithmetic
 * decision nobody made on purpose.
 */
export const feeOf = (value: Amount, basisPoints: number): Amount =>
	Math.trunc((value * basisPoints) / 10_000) as Amount;`
			},

			{ type: 'h3', id: 'parsing', text: 'Parsing a price, without ever touching a float' },
			{
				type: 'p',
				text: 'Somebody types `45.505` into the order ticket. We need `455050`. The obvious implementation is one line:'
			},
			{
				type: 'code',
				file: 'the wrong way',
				lang: 'ts',
				code: `
// Do not do this.
const scaled = Math.round(Number(text) * SCALE);`
			},
			{
				type: 'p',
				text: 'It is wrong, and it is wrong rarely enough to reach production. `Number("45.505")` is not exactly 45.505 — it is the nearest float, which is `45.50499999999999545...`. Multiply by 10,000 and you get `455049.9999...`, which rounds to 455050 and happens to be right. Try enough values and some of them are not.'
			},
			{
				type: 'p',
				text: 'The fix is to never create the float at all. Split the string:'
			},
			{
				type: 'code',
				file: 'packages/protocol/src/money.ts',
				lang: 'ts',
				code: `
/**
 * Turn "45.505" into 455050, using string arithmetic.
 *
 * No \`Number(text) * SCALE\` anywhere: that would build a float first and
 * inherit its error. Splitting the string and padding the fractional part
 * cannot lose precision, because it never leaves the integers.
 */
export function parsePrice(text: string): Price {
	const trimmed = text.trim();

	if (!/^-?\\d+(\\.\\d+)?$/.test(trimmed)) {
		throw new TypeError(\`Not a price: \${text}\`);
	}

	const negative = trimmed.startsWith('-');
	const [whole = '0', fraction = ''] = trimmed.replace('-', '').split('.');

	// Four decimal places, padded or truncated. Truncated rather than rounded,
	// for the same reason fees truncate: never take more than was typed.
	const padded = (fraction + '0000').slice(0, 4);
	const scaled = Number(whole) * SCALE + Number(padded);

	return price(negative ? -scaled : scaled);
}`
			},

			{ type: 'h3', id: 'formatting', text: 'And back again' },
			{
				type: 'code',
				file: 'packages/protocol/src/money.ts',
				lang: 'ts',
				code: `
/**
 * A scaled integer as something a person reads.
 *
 * The division happens **here**, at the very edge, for display only. Every
 * amount that travels or is stored stays an integer — the moment a float
 * touches money it starts losing pennies in ways that take an auditor to find.
 */
export function formatPrice(value: Price, currency = 'GBP'): string {
	const symbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '';
	const units = Math.abs(value) / SCALE;

	// Up to four decimals, but no trailing zeros: £45.50, not £45.5000.
	const text = units.toLocaleString('en-GB', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 4
	});

	return \`\${value < 0 ? '−' : ''}\${symbol}\${text}\`;
}`
			},
			{
				type: 'why',
				title: 'The rule to take away',
				text: 'Divide **once**, at the boundary, for a human to read. Everything inside the system is an integer. If you find yourself dividing in the middle of a calculation, you have introduced a float into the money path and it will cost you a penny eventually.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why quantity is unscaled and price is scaled',
					'You can explain why `Number(text) * SCALE` is wrong',
					'You know where the only division in the money path is allowed to happen'
				]
			}
		]
	},

	{
		slug: 'ids-that-explain-themselves',
		title: 'Ids that explain themselves',
		summary:
			'Deterministic identifiers derived from the sequence number, and why a UUID would make replay impossible.',
		goal: 'Build the id layer, and understand why a random id in an event-sourced system is a bug.',
		blocks: [
			{
				type: 'p',
				text: 'Every order and every trade needs an identifier. The obvious answer is a UUID, and in this system it is the wrong one.'
			},
			{
				type: 'p',
				text: 'Remember the rule: the engine must be a pure function, so that replaying the log produces identical history. A UUID is random. Replay the log tomorrow and every order gets a different id — so the "identical history" claim quietly stops being true, and every downstream table that keyed on those ids no longer matches.'
			},

			{ type: 'h3', id: 'derived', text: 'Derived from the sequence number' },
			{
				type: 'code',
				file: 'packages/protocol/src/ids.ts',
				lang: 'ts',
				code: `
/**
 * An order id, derived from the command that created it.
 *
 * \`O-0000000000001834\` — the sequence number, zero-padded so ids sort
 * lexicographically in the same order they were created. That padding is worth
 * the ugliness: it means \`ORDER BY order_id\` and \`ORDER BY seq\` agree, and a
 * directory listing or a log file sorts correctly by accident.
 *
 * Deterministic, so replay produces the same ids. Self-describing, so
 * "where did this order come from" is answered by reading it rather than by a
 * join.
 */
export function orderIdFor(seq: number): OrderId {
	return \`O-\${String(seq).padStart(16, '0')}\` as OrderId;
}

/**
 * A trade id: the sequence number, plus which trade this was within the command.
 *
 * One aggressive order can produce several trades as it eats through a level,
 * so the sequence number alone is not unique. The index disambiguates, and
 * keeps them in the order they occurred.
 *
 *   T-0000000000001834-002
 *     └ the command       └ the third trade it produced
 */
export function tradeIdFor(seq: number, index: number): TradeId {
	return \`T-\${String(seq).padStart(16, '0')}-\${String(index).padStart(3, '0')}\` as TradeId;
}

/** And back, because an id that cannot be read is only half an id. */
export function seqOfTrade(id: TradeId): number {
	return Number(id.slice(2, 18));
}`
			},
			{
				type: 'why',
				title: 'What this buys during an incident',
				text: 'At 3am, somebody shows you trade `T-0000000000008134-002`. Without leaving the message you know it came from command 8,134 and was the third trade that command produced. You can go straight to `SELECT * FROM command_log WHERE seq = 8134` and see exactly what was asked for. A UUID would have told you nothing and cost you a join.'
			},

			{ type: 'h3', id: 'where-random-lives', text: 'Where randomness is allowed' },
			{
				type: 'p',
				text: 'Some ids genuinely should be random — a session id, an API key, a user id. Those are not derived from anything and must not be guessable. So `newId()` exists, and it lives somewhere the engine cannot reach it:'
			},
			{
				type: 'code',
				file: 'packages/protocol/src/generate.ts',
				lang: 'ts',
				code: `
/**
 * Random identifiers, at a separate subpath.
 *
 * This file is exported as \`@sequent/protocol/generate\`, not from the package
 * root. The engine imports \`@sequent/protocol\` and gets the whole vocabulary
 * *except* the one function that would make it non-deterministic.
 *
 * The separation is the point. A comment saying "do not use this in the engine"
 * is advice; a module the engine does not import is a guarantee.
 */
import { randomBytes } from 'node:crypto';

export const newId = (): string => randomBytes(12).toString('base64url');`
			},
			{
				type: 'code',
				file: 'packages/protocol/package.json',
				lang: 'json',
				code: `
{
	"name": "@sequent/protocol",
	"exports": {
		".": "./src/index.ts",
		"./generate": "./src/generate.ts"
	}
}`
			},

			{ type: 'h3', id: 'keys', text: 'Composite keys, built not looked up' },
			{
				type: 'code',
				file: 'packages/protocol/src/ids.ts',
				lang: 'ts',
				code: `
/**
 * A client's own name for an order is unique **per firm**, not globally.
 *
 * Two firms may both have an order called \`ORD-1\`, and both are entitled to.
 * Every lookup by client order id therefore takes the firm too — and building
 * the key here rather than at each call site means nobody can forget.
 */
export const clientKey = (firmId: FirmId, clientOrderId: ClientOrderId): string =>
	\`\${firmId}:\${clientOrderId}\`;

export const positionKey = (accountId: AccountId, instrumentId: InstrumentId): string =>
	\`\${accountId}:\${instrumentId}\`;`
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why a UUID would break replay',
					'You can read a trade id and say which command produced it',
					'You understand why `newId()` lives at a separate import path'
				]
			}
		]
	}
];
