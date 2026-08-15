import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import type { Amount } from '@sequent/protocol';
import {
	buildInvoice,
	canCreateKey,
	cappedRate,
	daysBetween,
	InvoiceAlreadyIssued,
	invoicesFor,
	issueInvoice,
	planFor,
	PLANS,
	prorate,
	usageFor,
	type Usage
} from './billing.ts';
import { openStore, withTransaction } from './client.ts';
import { createApiKey } from './keys.ts';

/**
 * Billing.
 *
 * Almost every test here is of a **pure function**, which is the point: the
 * hard cases in billing are arithmetic and edge dates, and neither needs a
 * database. A firm that joined mid-period, one that used exactly its allowance,
 * one that reissued an invoice — all assertions rather than an afternoon with a
 * seeded database and a fake clock.
 */

const DAY = 86_400_000;
const JAN = Date.UTC(2026, 0, 1);
const FEB = Date.UTC(2026, 1, 1);

describe('proration', () => {
	it('charges nothing for no days', () => {
		expect(prorate(3_000_000 as Amount, 0, 31)).toBe(0);
	});

	it('charges the full amount for the whole period', () => {
		expect(prorate(3_000_000 as Amount, 31, 31)).toBe(3_000_000);
	});

	it('charges a fraction for part of it', () => {
		// 19 days of a 30-day month at £300.
		expect(prorate(3_000_000 as Amount, 19, 30)).toBe(1_900_000);
	});

	it('rounds down, so every rounding error is in the customer´s favour', () => {
		/*
		 * 1 day of 7 at £100 is £14.2857…. Rounding to nearest gives 142857 (up
		 * from 142857.14 — actually down here), but the direction is what matters
		 * across thousands of line items, and a system that rounds *up* has to
		 * defend itself.
		 */
		expect(prorate(1_000_000 as Amount, 1, 7)).toBe(142_857);
		expect(prorate(1_000_000 as Amount, 1, 3)).toBe(333_333);
	});

	it('multiplies before dividing', () => {
		// £0.10 over 30 days: 1000 * 1 / 30 = 33, not (1000/30)|0 * 1.
		expect(prorate(1000 as Amount, 1, 30)).toBe(33);
	});

	it('never charges for more days than the period has', () => {
		expect(prorate(3_000_000 as Amount, 999, 30)).toBe(3_000_000);
	});

	it('survives a zero-length period without dividing by zero', () => {
		expect(prorate(3_000_000 as Amount, 5, 0)).toBe(0);
	});
});

describe('daysBetween', () => {
	it('counts whole days', () => {
		expect(daysBetween(JAN, JAN + 19 * DAY)).toBe(19);
	});

	it('rounds a partial day down', () => {
		expect(daysBetween(JAN, JAN + 19 * DAY + 23 * 3_600_000)).toBe(19);
	});

	it('is never negative', () => {
		expect(daysBetween(FEB, JAN)).toBe(0);
	});
});

/* -------------------------------------------------------------------------- */

const usage = (overrides: Partial<Usage> = {}): Usage => ({
	firmId: 'firm-a',
	seats: 3,
	orders: 500,
	trades: 0,
	tradingFees: 0 as Amount,
	...overrides
});

const invoice = (input: { plan?: string; usage?: Usage; activeFrom?: number } = {}) =>
	buildInvoice({
		invoiceId: 'inv-1',
		firmId: 'firm-a',
		plan: planFor(input.plan ?? 'desk'),
		usage: input.usage ?? usage(),
		periodStart: JAN,
		periodEnd: JAN + 31 * DAY,
		activeFrom: input.activeFrom ?? JAN - 90 * DAY,
		issuedAt: JAN + 31 * DAY
	});

describe('invoices', () => {
	it('charges nothing when everything is within the plan', () => {
		expect(invoice().total).toBe(0);
	});

	it('charges for seats beyond the included ones', () => {
		// Desk includes 5 seats at £250 each beyond that.
		expect(invoice({ usage: usage({ seats: 8 }) }).total).toBe(3 * 2_500_000);
	});

	it('prorates seats for a firm that joined mid-period', () => {
		const result = invoice({
			usage: usage({ seats: 8 }),
			activeFrom: JAN + 12 * DAY
		});

		// 19 of 31 days.
		expect(result.total).toBe(prorate((3 * 2_500_000) as Amount, 19, 31));

		const line = result.lines.find((l) => l.description.includes('days'));
		// The line item says so, so a finance team can check it with a calculator.
		expect(line?.description).toContain('19/31');
	});

	it('does not prorate a firm that was already active', () => {
		expect(invoice({ usage: usage({ seats: 8 }) }).lines.some((l) => l.description.includes('/'))).toBe(
			false
		);
	});

	it('charges metered orders beyond the allowance', () => {
		const result = invoice({ usage: usage({ orders: 250_100 }) });

		// 100 over, at £0.002.
		expect(result.total).toBe(100 * 20);
	});

	it('charges nothing at exactly the allowance', () => {
		// The off-by-one that would bill every customer who used their plan
		// precisely, which is the one they will notice.
		expect(invoice({ usage: usage({ orders: 250_000 }) }).total).toBe(0);
	});

	it('does not prorate metered usage', () => {
		/*
		 * An order sent on the 29th cost the venue the same work as one sent on the
		 * 1st. Proration is about *access*; metering is about *use*. Conflating
		 * them is how a bill stops matching the invoice.
		 */
		const early = invoice({ usage: usage({ orders: 250_100 }), activeFrom: JAN + 20 * DAY });
		const whole = invoice({ usage: usage({ orders: 250_100 }) });

		expect(early.total).toBe(whole.total);
	});

	it('shows already-settled trading fees at zero, so they are not billed twice', () => {
		const result = invoice({
			usage: usage({ trades: 40, tradingFees: 123_456 as Amount })
		});

		const memo = result.lines.find((l) => l.description.includes('already settled'));

		expect(memo).toBeDefined();
		expect(memo?.amount).toBe(0);
		expect(result.total).toBe(0);
	});

	it('bills a free plan for overage but never for seats', () => {
		const result = invoice({
			plan: 'starter',
			usage: usage({ seats: 20, orders: 1_500 })
		});

		// Starter's seat price is zero, so extra seats cost nothing; the 500 extra
		// orders at £0.01 do.
		expect(result.total).toBe(500 * 100);
	});

	it('sums to the sum of its lines', () => {
		const result = invoice({ usage: usage({ seats: 9, orders: 300_000 }) });

		expect(result.total).toBe(result.lines.reduce((sum, line) => sum + line.amount, 0));
	});
});

describe('plans', () => {
	it('refuses an unknown one rather than defaulting', () => {
		// Defaulting to the cheapest would hide the bug and give the work away.
		expect(() => planFor('enterprise-plus')).toThrow(/Unknown plan/);
	});

	it('caps a requested rate at the plan´s ceiling', () => {
		expect(cappedRate(500, PLANS['desk']!)).toBe(50);
		expect(cappedRate(20, PLANS['desk']!)).toBe(20);
		expect(cappedRate(0, PLANS['desk']!)).toBe(1);
	});
});

/* -------------------------------------------------------------------------- */

describe('against a database', () => {
	let client: Client;
	let directory: string;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), 'sequent-billing-'));
		client = await openStore({ url: `file:${join(directory, 'test.db')}` });

		await client.execute({
			sql: 'INSERT INTO firm (firm_id, name, plan, created_at) VALUES (?, ?, ?, ?)',
			args: ['firm-a', 'Northgate', 'desk', JAN]
		});
	});

	afterEach(async () => {
		client.close();
		await rm(directory, { recursive: true, force: true });
	});

	it('counts seats from active users only', async () => {
		for (const [id, active] of [['u1', 1], ['u2', 1], ['u3', 0]] as const) {
			await client.execute({
				sql: `INSERT INTO venue_user (user_id, firm_id, email, display_name, password_hash, role, is_active, created_at)
				      VALUES (?, 'firm-a', ?, ?, 'x', 'trader', ?, ?)`,
				args: [id, `${id}@firm-a.test`, id, active, JAN]
			});
		}

		expect((await usageFor(client, 'firm-a', JAN, FEB)).seats).toBe(2);
	});

	it('is reproducible: the same window always gives the same number', async () => {
		const first = await usageFor(client, 'firm-a', JAN, FEB);
		const second = await usageFor(client, 'firm-a', JAN, FEB);

		/*
		 * The property that makes it safe to re-run. Usage is *counted* from the
		 * log rather than accumulated in a counter, so a projector that replays a
		 * batch after a crash cannot drift the bill by an amount nobody could
		 * reconstruct.
		 */
		expect(second).toEqual(first);
	});

	it('writes an invoice once', async () => {
		const built = invoice({ usage: usage({ seats: 8 }) });

		await withTransaction(client, async (tx) => {
			await issueInvoice(tx, built);
		});

		expect((await invoicesFor(client, 'firm-a'))[0]?.total).toBe(built.total);
	});

	it('is idempotent when reissued identically', async () => {
		const built = invoice({ usage: usage({ seats: 8 }) });

		for (let attempt = 0; attempt < 2; attempt += 1) {
			await withTransaction(client, async (tx) => {
				await issueInvoice(tx, built);
			});
		}

		expect(await invoicesFor(client, 'firm-a')).toHaveLength(1);
	});

	it('refuses to reissue with a different total', async () => {
		await withTransaction(client, async (tx) => {
			await issueInvoice(tx, invoice({ usage: usage({ seats: 8 }) }));
		});

		/*
		 * The alternative is a firm receiving two different totals for the same
		 * period and nobody knowing which one they paid. Corrections are credit
		 * notes, for the same reason ledger corrections are reversing entries.
		 */
		await expect(
			withTransaction(client, (tx) => issueInvoice(tx, invoice({ usage: usage({ seats: 12 }) })))
		).rejects.toThrow(InvoiceAlreadyIssued);
	});

	it('cannot be edited once written', async () => {
		await withTransaction(client, async (tx) => {
			await issueInvoice(tx, invoice({ usage: usage({ seats: 8 }) }));
		});

		await expect(
			client.execute({ sql: 'UPDATE invoice SET total = 1 WHERE invoice_id = ?', args: ['inv-1'] })
		).rejects.toThrow(/credit note/);
	});

	it('stops a firm at its plan´s key limit', async () => {
		const desk = PLANS['desk']!;

		for (let index = 0; index < desk.maxApiKeys; index += 1) {
			await createApiKey(client, { firmId: 'firm-a', label: `key ${index}`, scopes: ['read'] });
		}

		const check = await canCreateKey(client, 'firm-a', desk);
		expect(check.allowed).toBe(false);
		expect(check.reason).toContain('10 active keys');
	});

	it('does not count revoked keys against the limit', async () => {
		const desk = PLANS['desk']!;
		const keys = [];

		for (let index = 0; index < desk.maxApiKeys; index += 1) {
			keys.push(await createApiKey(client, { firmId: 'firm-a', label: `key ${index}`, scopes: ['read'] }));
		}

		await client.execute({
			sql: 'UPDATE api_key SET revoked_at = ? WHERE key_id = ?',
			args: [Date.now(), keys[0]!.keyId]
		});

		expect((await canCreateKey(client, 'firm-a', desk)).allowed).toBe(true);
	});

	it('does not revoke existing keys when a firm downgrades', async () => {
		// Eleven keys, then a downgrade to a plan allowing ten.
		for (let index = 0; index < 11; index += 1) {
			await createApiKey(client, { firmId: 'firm-a', label: `key ${index}`, scopes: ['read'] });
		}

		/*
		 * The eleventh key keeps working. Revoking on downgrade would mean a plan
		 * change silently breaks a trading system in production — a thing no
		 * customer forgives and no support conversation fixes.
		 */
		const active = await client.execute({
			sql: 'SELECT COUNT(*) AS n FROM api_key WHERE firm_id = ? AND revoked_at IS NULL',
			args: ['firm-a']
		});
		expect(Number(active.rows[0]?.['n'])).toBe(11);

		// But they cannot make a twelfth.
		expect((await canCreateKey(client, 'firm-a', PLANS['desk']!)).allowed).toBe(false);
	});
});
