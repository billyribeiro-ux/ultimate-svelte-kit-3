/**
 * A venue you can actually open.
 *
 * Creates two member firms with people in every role, lists two instruments,
 * opens them, and runs a short session through the real engine so the terminal
 * has a book and a tape on first load.
 *
 * Everything goes through the same path production does — commands to the log,
 * the engine applying them, projections catching up. A seed that reached past
 * the engine and wrote rows directly would produce a demo that cannot happen,
 * and the first real order would disagree with it.
 */

import { rm } from 'node:fs/promises';
import {
	asAccountId,
	asClientOrderId,
	asFirmId,
	asInstrumentId,
	asUserId,
	CURRENT_VERSION,
	price,
	quantity,
	type Command
} from '@sequent/protocol';
import { newId } from '@sequent/protocol/generate';
import { catchUp, createApiKey, hashSecret, openStore, Sequencer } from '@sequent/store';
import { runEngine } from '@sequent/engine';

/*
 * The same `DATABASE_URL` every other process reads.
 *
 * Hardcoding `sequent.db` here would seed a file relative to *this* script's
 * working directory, which is not where the engine looks. See `scripts/paths.js`
 * — a relative database path is the multi-process bug that fails silently,
 * because SQLite creates the missing file instead of complaining.
 */
const URL_ = process.env['DATABASE_URL'] ?? 'file:sequent.db';
const PASSWORD = 'sequent-demo-2026';

if (!URL_.startsWith('file:')) {
	throw new Error(`Refusing to seed a non-file database: ${URL_}`);
}

const FILE = URL_.slice('file:'.length);

await rm(FILE, { force: true });
await rm(`${FILE}-wal`, { force: true });
await rm(`${FILE}-shm`, { force: true });

const db = await openStore({ url: URL_ });
const now = Date.now();

/* -------------------------------------------------------------------------- */

console.log('· firms, accounts and people');

interface Person {
	email: string;
	name: string;
	role: string;
	accounts: string[];
}

const FIRMS: Array<{ id: string; name: string; accounts: string[]; people: Person[] }> = [
	{
		id: 'northgate',
		name: 'Northgate Capital',
		accounts: ['northgate-equities', 'northgate-systematic'],
		people: [
			{
				email: 'ada@northgate.test',
				name: 'Ada Whitlock',
				role: 'trader',
				accounts: ['northgate-equities']
			},
			{ email: 'rhys@northgate.test', name: 'Rhys Okafor', role: 'risk_manager', accounts: [] },
			{ email: 'mira@northgate.test', name: 'Mira Solberg', role: 'firm_admin', accounts: [] },
			{
				email: 'quinn@northgate.test',
				name: 'Quinn Adeyemi',
				role: 'auditor',
				accounts: ['northgate-equities']
			}
		]
	},
	{
		id: 'lowfield',
		name: 'Lowfield Partners',
		accounts: ['lowfield-main'],
		people: [
			{
				email: 'ben@lowfield.test',
				name: 'Ben Castellanos',
				role: 'trader',
				accounts: ['lowfield-main']
			}
		]
	}
];

const passwordHash = hashSecret(PASSWORD);

for (const firm of FIRMS) {
	await db.execute({
		sql: 'INSERT INTO firm (firm_id, name, plan, seats, created_at) VALUES (?, ?, ?, ?, ?)',
		args: [firm.id, firm.name, 'desk', firm.people.length, now]
	});

	for (const accountId of firm.accounts) {
		await db.execute({
			sql: 'INSERT INTO trading_account (account_id, firm_id, name, created_at) VALUES (?, ?, ?, ?)',
			args: [accountId, firm.id, accountId, now]
		});
	}

	for (const person of firm.people) {
		const userId = newId();
		await db.execute({
			sql: `INSERT INTO venue_user (user_id, firm_id, email, display_name, password_hash, role, created_at)
			      VALUES (?, ?, ?, ?, ?, ?, ?)`,
			args: [userId, firm.id, person.email, person.name, passwordHash, person.role, now]
		});

		for (const accountId of person.accounts) {
			await db.execute({
				sql: 'INSERT INTO account_assignment (user_id, account_id) VALUES (?, ?)',
				args: [userId, accountId]
			});
		}
	}
}

// A venue operator, who belongs to the venue rather than to a member firm.
await db.execute({
	sql: 'INSERT INTO firm (firm_id, name, plan, seats, created_at) VALUES (?, ?, ?, ?, ?)',
	args: ['venue', 'Sequent', 'venue', 1, now]
});
await db.execute({
	sql: `INSERT INTO venue_user (user_id, firm_id, email, display_name, password_hash, role, created_at)
	      VALUES (?, ?, ?, ?, ?, ?, ?)`,
	args: [
		newId(),
		'venue',
		'ops@sequent.test',
		'Venue Operations',
		passwordHash,
		'venue_operator',
		now
	]
});

/*
 * An API key, so the public API is usable the moment the venue is seeded.
 *
 * Pinned to one account and given both scopes, which is what a member firm's
 * algorithm would actually be issued. The secret is printed here and nowhere
 * else — reseeding is how you get another one, exactly as in production.
 */
const demoKey = await createApiKey(db, {
	firmId: 'northgate',
	label: 'demo algo',
	scopes: ['read', 'trade'],
	accountId: 'northgate-equities',
	ratePerSecond: 20,
	now
});

/* -------------------------------------------------------------------------- */

console.log('· listing instruments and opening the market');

const sequencer = new Sequencer(db);
await sequencer.start();

let at = now - 60_000;
const send = (body: Command) => sequencer.append(body, (at += 10), CURRENT_VERSION);

const OPERATOR = asUserId('seed');
const VENUE = asFirmId('venue');

const INSTRUMENTS = [
	{ symbol: 'VOD.L', name: 'Vodafone Group', reference: 455_000 },
	{ symbol: 'BP.L', name: 'BP plc', reference: 382_500 }
];

for (const instrument of INSTRUMENTS) {
	await send({
		kind: 'list_instrument',
		firmId: VENUE,
		actorId: OPERATOR,
		instrumentId: asInstrumentId(instrument.symbol),
		name: instrument.name,
		currency: 'GBP',
		tickSize: 25,
		lotSize: 1,
		referencePrice: price(instrument.reference)
	});

	/*
	 * Pre-open, then auction, then continuous — the real sequence.
	 *
	 * Orders accumulate in pre-open without matching, the auction clears them at
	 * one price, and continuous trading starts on an uncrossed book. Skipping
	 * straight to continuous would work, and it would skip the most interesting
	 * thing the venue does.
	 */
	await send({
		kind: 'set_phase',
		firmId: VENUE,
		actorId: OPERATOR,
		instrumentId: asInstrumentId(instrument.symbol),
		phase: 'pre_open',
		reason: 'seed'
	});
}

console.log('· a pre-open book, then the opening auction');

let clientOrderCounter = 0;

interface SeedOrder {
	firm: string;
	account: string;
	symbol: string;
	side: 'buy' | 'sell';
	at: number;
	qty: number;
}

const order = (input: SeedOrder): Command => {
	clientOrderCounter += 1;
	return {
		kind: 'place_order',
		firmId: asFirmId(input.firm),
		actorId: OPERATOR,
		accountId: asAccountId(input.account),
		instrumentId: asInstrumentId(input.symbol),
		clientOrderId: asClientOrderId(`SEED-${clientOrderCounter}`),
		side: input.side,
		orderType: 'limit',
		price: price(input.at),
		quantity: quantity(input.qty),
		timeInForce: 'gtc',
		selfTradePrevention: 'cancel_both'
	};
};

// Crossing interest, so the auction has something to clear.
await send(
	order({
		firm: 'northgate',
		account: 'northgate-equities',
		symbol: 'VOD.L',
		side: 'buy',
		at: 455_100,
		qty: 400
	})
);
await send(
	order({
		firm: 'lowfield',
		account: 'lowfield-main',
		symbol: 'VOD.L',
		side: 'sell',
		at: 454_900,
		qty: 300
	})
);
await send(
	order({
		firm: 'northgate',
		account: 'northgate-systematic',
		symbol: 'VOD.L',
		side: 'buy',
		at: 455_000,
		qty: 200
	})
);

for (const instrument of INSTRUMENTS) {
	await send({
		kind: 'set_phase',
		firmId: VENUE,
		actorId: OPERATOR,
		instrumentId: asInstrumentId(instrument.symbol),
		phase: 'auction',
		reason: 'opening auction'
	});
	await send({
		kind: 'set_phase',
		firmId: VENUE,
		actorId: OPERATOR,
		instrumentId: asInstrumentId(instrument.symbol),
		phase: 'continuous',
		reason: 'open'
	});
}

console.log('· a lived-in book and a few trades');

const depth: SeedOrder[] = [
	{
		firm: 'northgate',
		account: 'northgate-equities',
		symbol: 'VOD.L',
		side: 'buy',
		at: 454_800,
		qty: 500
	},
	{
		firm: 'northgate',
		account: 'northgate-equities',
		symbol: 'VOD.L',
		side: 'buy',
		at: 454_750,
		qty: 800
	},
	{
		firm: 'lowfield',
		account: 'lowfield-main',
		symbol: 'VOD.L',
		side: 'buy',
		at: 454_700,
		qty: 300
	},
	{
		firm: 'lowfield',
		account: 'lowfield-main',
		symbol: 'VOD.L',
		side: 'sell',
		at: 455_050,
		qty: 400
	},
	{
		firm: 'lowfield',
		account: 'lowfield-main',
		symbol: 'VOD.L',
		side: 'sell',
		at: 455_100,
		qty: 700
	},
	{
		firm: 'northgate',
		account: 'northgate-systematic',
		symbol: 'VOD.L',
		side: 'sell',
		at: 455_150,
		qty: 250
	},

	{
		firm: 'northgate',
		account: 'northgate-equities',
		symbol: 'BP.L',
		side: 'buy',
		at: 382_400,
		qty: 600
	},
	{
		firm: 'northgate',
		account: 'northgate-equities',
		symbol: 'BP.L',
		side: 'buy',
		at: 382_350,
		qty: 900
	},
	{
		firm: 'lowfield',
		account: 'lowfield-main',
		symbol: 'BP.L',
		side: 'sell',
		at: 382_600,
		qty: 550
	},
	{
		firm: 'lowfield',
		account: 'lowfield-main',
		symbol: 'BP.L',
		side: 'sell',
		at: 382_650,
		qty: 800
	}
];

for (const input of depth) await send(order(input));

// Two aggressive orders, so the tape is not empty.
await send(
	order({
		firm: 'northgate',
		account: 'northgate-equities',
		symbol: 'VOD.L',
		side: 'buy',
		at: 455_050,
		qty: 150
	})
);
await send(
	order({
		firm: 'lowfield',
		account: 'lowfield-main',
		symbol: 'BP.L',
		side: 'sell',
		at: 382_400,
		qty: 200
	})
);

/* -------------------------------------------------------------------------- */

console.log('· running the engine over it');

const controller = new AbortController();
const target = sequencer.nextSeq - 1;

await runEngine(db, {
	signal: controller.signal,
	idleMs: 1,
	onProgress: ({ lastSeq }) => {
		if (lastSeq >= target) controller.abort();
	}
});

const applied = await catchUp(db);

console.log('');
console.log(`  Seeded Sequent. ${applied} events projected.`);
console.log('');
console.log('  Sign in at /sign-in — the password for everybody is:');
console.log(`    ${PASSWORD}`);
console.log('');
console.log('    ada@northgate.test    trader        sends orders on northgate-equities');
console.log('    rhys@northgate.test   risk manager  limits and the kill switch, cannot trade');
console.log('    mira@northgate.test   firm admin    people and keys');
console.log('    quinn@northgate.test  auditor       reads everything, changes nothing');
console.log('    ben@lowfield.test     trader        the other side of the book');
console.log('    ops@sequent.test      venue ops     lists instruments, moves phases');
console.log('');
console.log('  An API key for Northgate (read + trade, pinned to northgate-equities):');
console.log(`    ${demoKey.secret}`);
console.log('');
console.log('    curl -H "Authorization: Bearer $KEY" localhost:5173/api/v1/instruments');
console.log('');

db.close();
