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
	// Shape first. An unparseable command never becomes a permission question.
	let command: Command;
	try {
		command = parseCommand(input);
	} catch (thrown) {
		error(400, thrown instanceof Error ? thrown.message : 'Invalid command');
	}

	/*
	 * The firm on the command is overwritten with the viewer's, never trusted.
	 *
	 * A client that could name its own firm could trade as anybody. This is the
	 * single most important line in the gateway, and it is one line — which is
	 * exactly why it is easy to leave out.
	 */
	const authorised = { ...command, firmId: viewer.firmId, actorId: viewer.userId } as Command;

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
