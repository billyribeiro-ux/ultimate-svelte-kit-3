/**
 * ALERT RULES, AS REMOTE FUNCTIONS
 * ================================
 *
 * `query` for reads and `form` for writes, and the choice between `form` and
 * `command` is worth stating because it is the one people get wrong.
 *
 * `command` is a function call over the network: it needs JavaScript, and if the
 * bundle has not loaded, nothing happens. `form` is a real `<form>` that posts,
 * progressively enhanced when the bundle is there. The rule is what the action
 * costs when it silently does nothing — for "save this alert rule", the cost is
 * somebody believing they are covered when they are not, so it is a form.
 *
 * `command` is used below for exactly one thing: the enable/disable toggle,
 * which is instant, reversible and visibly reflected in the row.
 */

import { error, invalid } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import * as v from 'valibot';
import { command, form, getRequestEvent, query } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { alertRule, alertStatus } from '#lib/server/db/schema.ts';
import { requireTenant } from '#lib/server/access.ts';
import { check } from '#lib/sqf/check.ts';
import { parse } from '#lib/sqf/parser.ts';

const tenantSlug = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

/**
 * Rules with their current state.
 *
 * A left join rather than two queries: a rule that has never been evaluated has
 * no status row, and the interface has to show it as "not yet evaluated" rather
 * than as "ok" — which is a different and much more dangerous statement.
 */
export const rules = query(v.object({ tenant: tenantSlug }), async ({ tenant }) => {
	const { user } = requireUser();
	const access = await requireTenant(user.id, tenant, 'viewer');

	const rows = await db
		.select({ rule: alertRule, status: alertStatus })
		.from(alertRule)
		.leftJoin(alertStatus, eq(alertStatus.ruleId, alertRule.id))
		.where(eq(alertRule.tenantId, access.tenantId))
		.orderBy(alertRule.name);

	return rows.map((row) => ({
		id: row.rule.id,
		name: row.rule.name,
		query: row.rule.query,
		threshold: row.rule.threshold,
		clearsAt: row.rule.clearsAt,
		forMs: row.rule.forMs,
		windowMs: row.rule.windowMs,
		intervalMs: row.rule.intervalMs,
		direction: row.rule.direction,
		enabled: row.rule.enabled,
		state: row.status?.state ?? null,
		value: row.status?.value ?? null,
		firingSince: row.status?.firingSince ?? null,
		evaluatedAt: row.status?.evaluatedAt ?? 0
	}));
});

/**
 * The rule form.
 *
 * The validation here is not a copy of the client's — there is no client copy.
 * A `form` validates on the server and returns the issues, and the browser
 * displays them; the same code runs whether the request came from an enhanced
 * submission or from a `<form>` with no JavaScript at all.
 */
export const saveRule = form(
	v.object({
		tenant: tenantSlug,
		/** Empty for a new rule. Present when editing, and checked against the tenant. */
		id: v.optional(v.string(), ''),
		name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Give the rule a name.'), v.maxLength(120)),
		query: v.pipe(
			v.string(),
			v.trim(),
			v.minLength(1, 'A rule needs a query.'),
			v.maxLength(4_000)
		),
		threshold: v.pipe(
			v.string(),
			v.transform(Number),
			v.number('The threshold must be a number.'),
			v.finite()
		),
		clearsAt: v.optional(v.string(), ''),
		direction: v.picklist(['above', 'below']),
		/*
		 * Minutes in the form, milliseconds in the database.
		 *
		 * The conversion belongs here rather than in the component: a field that
		 * says "minutes" and stores milliseconds is a unit bug waiting for the
		 * second place that writes it, and the second place is always the seed
		 * script.
		 */
		forMinutes: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(0), v.maxValue(720)),
		windowMinutes: v.pipe(
			v.string(),
			v.transform(Number),
			v.number(),
			v.minValue(1, 'A window shorter than a minute evaluates on almost no data.'),
			v.maxValue(1_440)
		)
	}),
	async (input, issue) => {
		const { user } = requireUser();
		// `member`, not `viewer`: creating an alert is a write, and a read-only
		// member must not be able to page the whole team at three in the morning.
		const access = await requireTenant(user.id, input.tenant, 'member');

		/*
		 * The rule's query is parsed and checked *before* it is stored.
		 *
		 * A rule whose query does not parse is a rule that silently never fires —
		 * `valueFor` returns null, the machine holds its state, and nothing ever
		 * happens. That is the worst possible failure for an alert, and it is
		 * entirely preventable at the moment somebody types it.
		 *
		 * `invalid(issue.query(…))`, NOT `error(400, …)`. The distinction is not
		 * stylistic: a form's job is to come back with the field marked and the
		 * message beside it, and `error` throws an `HttpError`, which a form handler
		 * turns into a 500 error *page* — the whole form, and the list around it,
		 * replaced by "Internal Error". The end-to-end test that creates a rule is
		 * what found that; the version with `error` looked perfectly reasonable.
		 */
		const parsed = parse(input.query);
		if (!parsed.query || parsed.errors.length > 0) {
			invalid(issue.query(parsed.errors[0]?.message ?? 'That query does not parse.'));
		}

		const checked = check(parsed.query);
		if (checked.errors.length > 0) invalid(issue.query(checked.errors[0]!.message));

		const clearsAt = input.clearsAt.trim() === '' ? null : Number(input.clearsAt);
		if (clearsAt !== null && !Number.isFinite(clearsAt)) {
			invalid(issue.clearsAt('The clear threshold must be a number, or empty.'));
		}

		const values = {
			tenantId: access.tenantId,
			name: input.name,
			query: input.query,
			threshold: input.threshold,
			clearsAt,
			direction: input.direction,
			forMs: Math.round(input.forMinutes * 60_000),
			windowMs: Math.round(input.windowMinutes * 60_000),
			intervalMs: 60_000
		};

		if (input.id) {
			// Scoped to the tenant in the `where`, not checked and then updated. The
			// two-step version has a window between the check and the write, and the
			// one-step version cannot be wrong.
			await db
				.update(alertRule)
				.set(values)
				.where(and(eq(alertRule.id, input.id), eq(alertRule.tenantId, access.tenantId)));
		} else {
			await db.insert(alertRule).values({ id: crypto.randomUUID(), ...values });
		}

		await rules({ tenant: input.tenant }).refresh();

		return { saved: true };
	}
);

/** Enable or disable. A command, because it is instant and reversible. */
export const toggleRule = command(
	v.object({ tenant: tenantSlug, id: v.string(), enabled: v.boolean() }),
	async ({ tenant, id, enabled }) => {
		const { user } = requireUser();
		const access = await requireTenant(user.id, tenant, 'member');

		await db
			.update(alertRule)
			.set({ enabled })
			.where(and(eq(alertRule.id, id), eq(alertRule.tenantId, access.tenantId)));

		await rules({ tenant }).refresh();
	}
);

export const deleteRule = form(
	v.object({ tenant: tenantSlug, id: v.string() }),
	async ({ tenant, id }) => {
		const { user } = requireUser();
		// `admin`, not `member`. Deleting a rule removes a safety net silently, and
		// the person who notices is whoever was relying on it during an incident.
		const access = await requireTenant(user.id, tenant, 'admin');

		await db
			.delete(alertRule)
			.where(and(eq(alertRule.id, id), eq(alertRule.tenantId, access.tenantId)));

		await rules({ tenant }).refresh();

		return { deleted: true };
	}
);

function requireUser() {
	const event = getRequestEvent();
	if (!event.locals.user) error(401, 'Sign in to continue.');
	return { user: event.locals.user };
}
