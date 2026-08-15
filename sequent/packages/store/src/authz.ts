/**
 * Who may do what.
 *
 * Every decision in this file is a **pure function**. No database, no request,
 * no session lookup — just a viewer, an action, and a target. That is not
 * stylistic tidiness; it is what makes the rules testable exhaustively, and
 * exhaustively is the only useful way to test authorisation.
 *
 * A permission bug does not throw. It does not show up in a log. It looks
 * exactly like the feature working, right up until somebody notices that a
 * trader at one firm can cancel another firm's orders. The only defence is a
 * decision function small enough to enumerate every input of, and a test that
 * does.
 *
 * ## The roles, and why the last two are the interesting ones
 *
 *   `trader`         — sends orders, for the accounts they are assigned to.
 *   `risk_manager`   — sets limits and pulls the kill switch. Cannot trade.
 *   `firm_admin`     — manages the firm's people, accounts and keys.
 *   `auditor`        — reads everything at their firm and changes nothing.
 *   `venue_operator` — lists instruments, moves phases, halts trading.
 *
 * `auditor` is the role that breaks naive permission systems. It is not "a
 * trader with fewer permissions" — it can see *more* than a trader (every
 * account, not just its own) while being able to do strictly less. A system
 * built on ranked permission levels cannot express that, and the usual result
 * is an auditor given trader rights "temporarily".
 *
 * `risk_manager` is the other one: it can stop trading entirely and cannot
 * place a single order. Power and privilege are different axes.
 */

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

export const ROLES = ['trader', 'risk_manager', 'firm_admin', 'auditor', 'venue_operator'] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
	'place_order',
	'cancel_order',
	'cancel_firm_orders',
	'view_orders',
	'view_positions',
	'view_ledger',
	'set_risk_limits',
	'engage_kill_switch',
	'manage_users',
	'manage_api_keys',
	'list_instrument',
	'set_phase',
	'view_audit_log'
] as const;
export type Action = (typeof ACTIONS)[number];

/** Who is asking. Everything needed to decide, and nothing else. */
export interface Viewer {
	readonly userId: string;
	readonly firmId: string;
	readonly role: Role;
	/** Accounts this user may act on. Empty for roles that never trade. */
	readonly accountIds: readonly string[];
	/**
	 * Scopes, when the request came from an API key rather than a browser.
	 *
	 * A key is always *at most* as powerful as the role it belongs to. Modelling
	 * it as an additional narrowing rather than a parallel permission system is
	 * what stops a key outliving the revocation of the person who made it.
	 */
	readonly scopes?: readonly string[];
}

/** What is being acted on. Absent fields mean "not scoped to one of those". */
export interface Target {
	readonly firmId?: string;
	readonly accountId?: string;
}

/* -------------------------------------------------------------------------- */
/* The table                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What each role may do at all, before any scoping.
 *
 * A table rather than a chain of `if`s, because a table can be read in one
 * glance and reviewed by somebody who is not a programmer — which, for
 * authorisation, is a feature. The compliance officer who has to sign this off
 * should be able to check it.
 */
const ALLOWED: Readonly<Record<Role, readonly Action[]>> = {
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

	// Reads everything, writes nothing. Note it can see the ledger and the audit
	// log, which a trader cannot — more visibility, less power.
	auditor: ['view_orders', 'view_positions', 'view_ledger', 'view_audit_log'],

	venue_operator: ['list_instrument', 'set_phase', 'view_audit_log', 'view_orders']
};

/** Which scope an action needs, when the request came from an API key. */
const SCOPE_FOR: Readonly<Record<Action, string>> = {
	place_order: 'trade',
	cancel_order: 'trade',
	cancel_firm_orders: 'trade',
	view_orders: 'read',
	view_positions: 'read',
	view_ledger: 'read',
	set_risk_limits: 'admin',
	engage_kill_switch: 'admin',
	manage_users: 'admin',
	manage_api_keys: 'admin',
	list_instrument: 'admin',
	set_phase: 'admin',
	view_audit_log: 'read'
};

/* -------------------------------------------------------------------------- */
/* The decision                                                                */
/* -------------------------------------------------------------------------- */

export type Decision =
	| { readonly allowed: true }
	| { readonly allowed: false; readonly reason: DenialReason };

/**
 * Why something was refused.
 *
 * `not_found` is a *denial*, and the distinction from `forbidden` is the whole
 * point of having both. Telling somebody "that firm exists but is not yours"
 * leaks the venue's member list one guess at a time. Telling a colleague at
 * their own firm "you are not a risk manager" protects nothing and merely
 * confuses them.
 *
 * The rule: **across a tenant boundary, deny as `not_found`. Inside one, deny
 * as `forbidden`.**
 */
export type DenialReason =
	| 'not_found'
	| 'forbidden'
	| 'account_not_assigned'
	| 'missing_scope'
	| 'inactive';

const ALLOW: Decision = { allowed: true };
const deny = (reason: DenialReason): Decision => ({ allowed: false, reason });

/**
 * May this viewer take this action on this target?
 *
 * The checks run in a deliberate order, and the order is itself a security
 * decision: the tenant boundary is tested **first**, so that everything after
 * it can only ever leak information about the viewer's own firm.
 */
export function can(viewer: Viewer, action: Action, target: Target = {}): Decision {
	/*
	 * 1. The tenant boundary.
	 *
	 * A venue operator is above it — they administer the venue itself. Everybody
	 * else is confined to their own firm, and asking about another one gets the
	 * same answer as asking about a firm that does not exist.
	 */
	if (target.firmId !== undefined && target.firmId !== viewer.firmId) {
		if (viewer.role !== 'venue_operator') return deny('not_found');
	}

	// 2. Does the role permit this action at all?
	if (!ALLOWED[viewer.role].includes(action)) return deny('forbidden');

	/*
	 * 3. Account assignment.
	 *
	 * Belonging to the firm is not the same as being allowed to trade on a
	 * particular desk. A trader assigned to the equities account must not be able
	 * to send an order on the derivatives one just because both are theirs.
	 *
	 * `firm_admin` and `risk_manager` are exempt because their actions are
	 * firm-wide by definition — a kill switch that only covered some of a firm's
	 * accounts would be worse than none.
	 */
	if (target.accountId !== undefined && needsAssignment(viewer.role)) {
		if (!viewer.accountIds.includes(target.accountId)) return deny('account_not_assigned');
	}

	/*
	 * 4. API key scopes, if this is a key rather than a person.
	 *
	 * Applied last, and only ever narrowing. A key cannot grant something the
	 * role does not already allow — which is what makes revoking a person's
	 * account enough to stop their keys, rather than a separate job somebody
	 * forgets.
	 */
	if (viewer.scopes !== undefined) {
		if (!viewer.scopes.includes(SCOPE_FOR[action])) return deny('missing_scope');
	}

	return ALLOW;
}

function needsAssignment(role: Role): boolean {
	return role === 'trader' || role === 'auditor';
}

/**
 * The HTTP status a denial should produce.
 *
 * Kept next to the reasons rather than at the call sites, so that the
 * "not_found across a tenant boundary" rule is applied once instead of being
 * remembered fourteen times.
 */
export function statusFor(reason: DenialReason): 401 | 403 | 404 {
	switch (reason) {
		case 'not_found':
			return 404;
		case 'inactive':
			return 401;
		case 'forbidden':
		case 'account_not_assigned':
		case 'missing_scope':
			return 403;
	}
}

/**
 * A sentence for the person on the other end.
 *
 * Deliberately vague across the tenant boundary and specific inside it. "Not
 * found" tells a stranger nothing; "you are not a risk manager" tells a
 * colleague exactly what to do next.
 */
export function messageFor(reason: DenialReason): string {
	switch (reason) {
		case 'not_found':
			return 'Not found.';
		case 'inactive':
			return 'This account is not active.';
		case 'forbidden':
			return 'Your role does not allow that.';
		case 'account_not_assigned':
			return 'You are not assigned to that trading account.';
		case 'missing_scope':
			return 'This API key does not have the required scope.';
	}
}

/** Throwing form, for the places where a boolean would be easy to ignore. */
export class NotAllowed extends Error {
	constructor(readonly reason: DenialReason) {
		super(messageFor(reason));
		this.name = 'NotAllowed';
	}

	get status(): number {
		return statusFor(this.reason);
	}
}

export function assertCan(viewer: Viewer, action: Action, target: Target = {}): void {
	const decision = can(viewer, action, target);
	if (!decision.allowed) throw new NotAllowed(decision.reason);
}
