/**
 * The gateway: the only way a command reaches the log.
 *
 * Its job is small and worth stating precisely, because the temptation is to
 * make it bigger. It authenticates, it authorises, it validates, and it
 * appends. It does **not** decide anything about trading — whether an order is
 * too large, whether it crosses, whether the instrument is halted are all the
 * engine's business, and answering them here would mean answering them twice.
 *
 * Two answers to the same question is how a system starts disagreeing with
 * itself.
 */

import { error } from '@sveltejs/kit';
import {
	CURRENT_VERSION,
	parseCommand,
	type Command
} from '@sequent/protocol';
import { assertCan, NotAllowed, Sequencer, type Action, type Viewer } from '@sequent/store';
import { db } from './db.ts';

/**
 * One sequencer for the process, started once.
 *
 * The single-writer property is the venue's total order. `assertSoleWriter` is
 * called on every append rather than at startup, because the failure it catches
 * — a second instance still running after a deploy — appears mid-life, not at
 * boot.
 */
const sequencer = new Sequencer(db);
await sequencer.start();

/** Which permission each command kind needs. */
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
};

/**
 * Validate, authorise and append a command.
 *
 * `now` is a parameter so that a test can drive a whole session without
 * touching a clock — the same discipline the engine follows, applied one layer
 * out.
 */
export async function submit(
	viewer: Viewer,
	input: unknown,
	now: number = Date.now()
): Promise<number> {
	/*
	 * Identity is stamped on **before** the command is parsed, not after.
	 *
	 * The order is the point. A client that could name its own firm could trade
	 * as anybody, so `firmId` and `actorId` are overwritten with the viewer's —
	 * and doing it first means a client-supplied value is never even syntactically
	 * meaningful. There is no window in which a parsed command carries a firm
	 * somebody else chose.
	 *
	 * Doing it the other way round — parse, then overwrite — also worked, and had
	 * a subtler cost: the schema required a `firmId`, so every caller had to
	 * invent one purely to have it thrown away. The public API's first order was
	 * rejected with `Expected "firmId" but received undefined`, which is a
	 * confusing thing to tell somebody about a field they are not allowed to set.
	 */
	if (typeof input !== 'object' || input === null || Array.isArray(input)) {
		error(400, 'A command must be an object.');
	}

	const claimed = { ...(input as Record<string, unknown>), firmId: viewer.firmId, actorId: viewer.userId };

	let authorised: Command;
	try {
		authorised = parseCommand(claimed);
	} catch (thrown) {
		error(400, thrown instanceof Error ? thrown.message : 'Invalid command');
	}

	try {
		assertCan(viewer, ACTION_FOR[authorised.kind], {
			firmId: viewer.firmId,
			...('accountId' in authorised && authorised.accountId
				? { accountId: authorised.accountId }
				: {})
		});
	} catch (thrown) {
		if (thrown instanceof NotAllowed) error(thrown.status as 403, thrown.message);
		throw thrown;
	}

	await sequencer.assertSoleWriter();
	const record = await sequencer.append(authorised, now, CURRENT_VERSION);

	return record.seq;
}
