/**
 * LOCAL-FIRST STORAGE
 * ===================
 *
 * IndexedDB, directly, with about sixty lines of promise wrapper.
 *
 * The wrapper is worth writing rather than depending on. IndexedDB's awkwardness
 * is almost entirely its event-based API; the transaction model underneath is
 * good, and the popular wrappers hide it well enough that people stop
 * understanding when their writes commit. Tessera cares a great deal about when
 * its writes commit — that is the difference between "your work is safe" being
 * true and being a message.
 *
 * WHAT IS STORED, AND WHY EACH
 * ----------------------------
 *   snapshots  the document as of a known server sequence. Opening a board reads
 *              this first and renders immediately, before any network call.
 *   outbox     operations made locally that the server has not acknowledged.
 *              This is the whole of the offline guarantee: close the laptop
 *              mid-edit, open it on a train, and the work is still there and
 *              still queued.
 *
 * Not stored: the operation log. It is on the server, and a client that has a
 * snapshot plus its outbox can reconstruct everything it needs. Keeping a local
 * log too would mean two logs that can disagree.
 */

import type { Operation } from '#lib/board/index.ts';
import type { BoardSnapshot } from '#lib/board/index.ts';

const DATABASE = 'tessera';
const VERSION = 1;

const SNAPSHOTS = 'snapshots';
const OUTBOX = 'outbox';

export interface StoredSnapshot {
	boardId: string;
	snapshot: BoardSnapshot;
	/** The server sequence this snapshot accounts for. */
	watermark: number;
	savedAt: number;
}

interface OutboxRow {
	boardId: string;
	stamp: string;
	operation: Operation;
	queuedAt: number;
}

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
	opening ??= new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE, VERSION);

		request.onupgradeneeded = () => {
			const database = request.result;

			if (!database.objectStoreNames.contains(SNAPSHOTS)) {
				database.createObjectStore(SNAPSHOTS, { keyPath: 'boardId' });
			}

			if (!database.objectStoreNames.contains(OUTBOX)) {
				/*
				 * A compound key of (board, stamp).
				 *
				 * Storing the outbox as one row per board — an array of pending
				 * operations — would be simpler and would make acknowledging *some* of
				 * them a read-modify-write, which races with the editor appending to
				 * the same array. One row per operation means an acknowledgement is a
				 * delete of exactly the keys that were confirmed.
				 */
				const store = database.createObjectStore(OUTBOX, { keyPath: ['boardId', 'stamp'] });
				store.createIndex('byBoard', 'boardId');
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB refused to open'));

		/*
		 * Another tab is holding an old version open.
		 *
		 * Without this the upgrade hangs forever and the board never loads, with no
		 * error anywhere. Rejecting turns it into a message the application can show.
		 */
		request.onblocked = () =>
			reject(new Error('Tessera is open in another tab with an older version. Reload it.'));
	});

	return opening;
}

/** Run a transaction and resolve when it *commits*, not when the request succeeds. */
async function transact<T>(
	stores: string | string[],
	mode: IDBTransactionMode,
	body: (transaction: IDBTransaction) => Promise<T> | T
): Promise<T> {
	const database = await open();
	const transaction = database.transaction(stores, mode);

	const done = new Promise<void>((resolve, reject) => {
		/*
		 * `oncomplete`, not the last request's `onsuccess`.
		 *
		 * A request succeeding means the value is staged; the transaction can still
		 * abort afterwards — a quota error, or another handler throwing. Resolving
		 * early is how "saved" becomes a lie, and it is the single most common bug
		 * in hand-rolled IndexedDB code.
		 */
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed'));
		transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
	});

	const result = await body(transaction);
	await done;
	return result;
}

function request<T>(source: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		source.onsuccess = () => resolve(source.result);
		source.onerror = () => reject(source.error ?? new Error('Request failed'));
	});
}

/* ------------------------------------------------------------------ */
/* Snapshots                                                           */
/* ------------------------------------------------------------------ */

export async function readSnapshot(boardId: string): Promise<StoredSnapshot | undefined> {
	return transact(SNAPSHOTS, 'readonly', (transaction) =>
		request<StoredSnapshot | undefined>(transaction.objectStore(SNAPSHOTS).get(boardId))
	);
}

export async function writeSnapshot(entry: Omit<StoredSnapshot, 'savedAt'>): Promise<void> {
	await transact(SNAPSHOTS, 'readwrite', (transaction) => {
		transaction.objectStore(SNAPSHOTS).put({ ...entry, savedAt: Date.now() });
	});
}

/* ------------------------------------------------------------------ */
/* The outbox                                                          */
/* ------------------------------------------------------------------ */

export async function enqueue(boardId: string, operations: readonly Operation[]): Promise<void> {
	if (operations.length === 0) return;

	await transact(OUTBOX, 'readwrite', (transaction) => {
		const store = transaction.objectStore(OUTBOX);
		const queuedAt = Date.now();
		for (const operation of operations) {
			store.put({ boardId, stamp: operation.stamp, operation, queuedAt } satisfies OutboxRow);
		}
	});
}

/** Everything still waiting, oldest first. */
export async function pending(boardId: string): Promise<Operation[]> {
	const rows = await transact(OUTBOX, 'readonly', (transaction) =>
		request<OutboxRow[]>(transaction.objectStore(OUTBOX).index('byBoard').getAll(boardId))
	);

	/*
	 * Sorted by stamp, not by `queuedAt`.
	 *
	 * Two operations queued in the same millisecond have the same `queuedAt`, and
	 * `getAll` returns them in key order — which for a compound key is board then
	 * stamp, so this is usually already right. Sorting explicitly makes it right
	 * by construction rather than by implementation detail, and stamp order is
	 * the order the operations were created in.
	 */
	return rows.map((row) => row.operation).sort((a, b) => (a.stamp < b.stamp ? -1 : 1));
}

export async function acknowledge(
	boardId: string,
	operations: readonly Operation[]
): Promise<void> {
	if (operations.length === 0) return;

	await transact(OUTBOX, 'readwrite', (transaction) => {
		const store = transaction.objectStore(OUTBOX);
		for (const operation of operations) store.delete([boardId, operation.stamp]);
	});
}

export async function outboxSize(boardId: string): Promise<number> {
	return transact(OUTBOX, 'readonly', (transaction) =>
		request<number>(transaction.objectStore(OUTBOX).index('byBoard').count(boardId))
	);
}

/** Forget a board entirely — used when the server says it is gone. */
export async function forget(boardId: string): Promise<void> {
	const operations = await pending(boardId);
	await transact([SNAPSHOTS, OUTBOX], 'readwrite', (transaction) => {
		transaction.objectStore(SNAPSHOTS).delete(boardId);
		const store = transaction.objectStore(OUTBOX);
		for (const operation of operations) store.delete([boardId, operation.stamp]);
	});
}

/** Is IndexedDB usable at all? Some privacy modes expose it and then throw. */
export function available(): boolean {
	try {
		return typeof indexedDB !== 'undefined' && indexedDB !== null;
	} catch {
		return false;
	}
}
