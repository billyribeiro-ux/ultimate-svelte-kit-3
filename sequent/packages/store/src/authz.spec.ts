import { describe, expect, it } from 'vitest';
import {
	ACTIONS,
	ROLES,
	assertCan,
	can,
	NotAllowed,
	statusFor,
	type Action,
	type Role,
	type Viewer
} from './authz.ts';

/**
 * Authorisation, tested exhaustively.
 *
 * "Exhaustively" is not a figure of speech here: the last test in this file
 * walks every role against every action and asserts the complete matrix. That
 * is possible because `can` is a pure function of five roles and thirteen
 * actions, and it is worth doing because a permission bug is invisible — it
 * looks exactly like the feature working until somebody notices a trader
 * cancelling another firm's orders.
 */

const viewer = (role: Role, overrides: Partial<Viewer> = {}): Viewer => ({
	userId: 'u1',
	firmId: 'firm-a',
	role,
	accountIds: ['acc-a1'],
	...overrides
});

describe('the tenant boundary', () => {
	it('answers not_found rather than forbidden for another firm', () => {
		const decision = can(viewer('firm_admin'), 'view_orders', { firmId: 'firm-b' });

		// 404, not 403. "That firm exists but is not yours" leaks the venue's
		// member list one guess at a time.
		expect(decision).toEqual({ allowed: false, reason: 'not_found' });
		expect(statusFor('not_found')).toBe(404);
	});

	it('is checked before the role, so nothing after it can leak', () => {
		// An auditor cannot set risk limits anywhere. Asked about another firm,
		// the answer must still be "not found" rather than "you are not a risk
		// manager" — the second version confirms the firm exists.
		expect(can(viewer('auditor'), 'set_risk_limits', { firmId: 'firm-b' })).toEqual({
			allowed: false,
			reason: 'not_found'
		});
	});

	it('lets a venue operator cross it', () => {
		expect(can(viewer('venue_operator'), 'set_phase', { firmId: 'firm-b' }).allowed).toBe(true);
	});

	it('says forbidden, not not_found, inside the viewer’s own firm', () => {
		// A colleague deserves a useful answer.
		expect(can(viewer('trader'), 'set_risk_limits', { firmId: 'firm-a' })).toEqual({
			allowed: false,
			reason: 'forbidden'
		});
	});
});

describe('account assignment', () => {
	it('lets a trader act on an account they are assigned to', () => {
		expect(can(viewer('trader'), 'place_order', { accountId: 'acc-a1' }).allowed).toBe(true);
	});

	it('refuses an account at their own firm that they are not assigned to', () => {
		// Belonging to the firm is not the same as being allowed to trade on a
		// particular desk.
		expect(can(viewer('trader'), 'place_order', { accountId: 'acc-a2' })).toEqual({
			allowed: false,
			reason: 'account_not_assigned'
		});
	});

	it('exempts firm-wide roles, because their actions are firm-wide by definition', () => {
		// A kill switch that covered only some of a firm's accounts would be worse
		// than none.
		expect(can(viewer('risk_manager'), 'engage_kill_switch', { accountId: 'acc-a2' }).allowed).toBe(
			true
		);
		expect(can(viewer('firm_admin'), 'view_positions', { accountId: 'acc-a2' }).allowed).toBe(true);
	});
});

describe('the auditor', () => {
	it('sees more than a trader and can do less', () => {
		const auditor = viewer('auditor');
		const trader = viewer('trader');

		// More visibility...
		expect(can(auditor, 'view_ledger').allowed).toBe(true);
		expect(can(trader, 'view_ledger').allowed).toBe(false);

		// ...and strictly less power. A ranked permission system cannot express
		// this, which is why the usual outcome is an auditor given trader rights
		// "temporarily".
		expect(can(auditor, 'place_order').allowed).toBe(false);
		expect(can(auditor, 'cancel_order').allowed).toBe(false);
		expect(can(auditor, 'set_risk_limits').allowed).toBe(false);
	});

	it('cannot change anything at all', () => {
		const auditor = viewer('auditor');
		const writes: Action[] = [
			'place_order',
			'cancel_order',
			'cancel_firm_orders',
			'set_risk_limits',
			'engage_kill_switch',
			'manage_users',
			'manage_api_keys',
			'list_instrument',
			'set_phase'
		];

		for (const action of writes) {
			expect(can(auditor, action).allowed).toBe(false);
		}
	});
});

describe('the risk manager', () => {
	it('can stop all trading and cannot place a single order', () => {
		const risk = viewer('risk_manager');

		expect(can(risk, 'engage_kill_switch').allowed).toBe(true);
		expect(can(risk, 'cancel_firm_orders').allowed).toBe(true);
		// Power and privilege are different axes.
		expect(can(risk, 'place_order').allowed).toBe(false);
	});
});

describe('API key scopes', () => {
	it('narrows a role and never widens it', () => {
		const key = viewer('trader', { scopes: ['read'] });

		expect(can(key, 'view_orders', { accountId: 'acc-a1' }).allowed).toBe(true);
		expect(can(key, 'place_order', { accountId: 'acc-a1' })).toEqual({
			allowed: false,
			reason: 'missing_scope'
		});
	});

	it('cannot grant what the role does not already allow', () => {
		// An admin-scoped key belonging to a trader is still a trader.
		const key = viewer('trader', { scopes: ['read', 'trade', 'admin'] });

		expect(can(key, 'set_risk_limits')).toEqual({ allowed: false, reason: 'forbidden' });
		expect(can(key, 'manage_users')).toEqual({ allowed: false, reason: 'forbidden' });
	});

	it('is still bound by account assignment', () => {
		const key = viewer('trader', { scopes: ['trade'] });

		expect(can(key, 'place_order', { accountId: 'acc-a2' })).toEqual({
			allowed: false,
			reason: 'account_not_assigned'
		});
	});
});

describe('assertCan', () => {
	it('throws with a status and a sentence', () => {
		expect(() => assertCan(viewer('trader'), 'manage_users')).toThrow(NotAllowed);

		try {
			assertCan(viewer('trader'), 'view_orders', { firmId: 'firm-b' });
			expect.unreachable('should have thrown');
		} catch (thrown) {
			expect(thrown).toBeInstanceOf(NotAllowed);
			expect((thrown as NotAllowed).status).toBe(404);
			expect((thrown as NotAllowed).message).toBe('Not found.');
		}
	});
});

describe('the complete matrix', () => {
	/*
	 * Every role against every action, written out.
	 *
	 * This is long and it is the most valuable test in the file. A change to the
	 * permission table that nobody intended shows up here as a diff a reviewer
	 * can read, rather than as an absence of a test nobody thought to write.
	 */
	const EXPECTED: Record<Role, readonly Action[]> = {
		trader: ['place_order', 'cancel_order', 'view_orders', 'view_positions'],
		risk_manager: [
			'cancel_firm_orders',
			'view_orders',
			'view_positions',
			'view_ledger',
			'set_risk_limits',
			'engage_kill_switch'
		],
		firm_admin: [
			'view_orders',
			'view_positions',
			'view_ledger',
			'manage_users',
			'manage_api_keys',
			'cancel_firm_orders'
		],
		auditor: ['view_orders', 'view_positions', 'view_ledger', 'view_audit_log'],
		venue_operator: ['list_instrument', 'set_phase', 'view_audit_log', 'view_orders']
	};

	for (const role of ROLES) {
		it(`${role} may do exactly what the table says`, () => {
			const allowed = ACTIONS.filter((action) => can(viewer(role), action).allowed);
			expect([...allowed].sort()).toEqual([...EXPECTED[role]].sort());
		});
	}

	it('gives nobody every permission', () => {
		// A role that can do everything is a role somebody will be given by
		// accident. If one ever appears here, it should be a deliberate diff.
		for (const role of ROLES) {
			const allowed = ACTIONS.filter((action) => can(viewer(role), action).allowed);
			expect(allowed.length).toBeLessThan(ACTIONS.length);
		}
	});
});
