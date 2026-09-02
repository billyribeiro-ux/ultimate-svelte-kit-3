/**
 * A SHEET THAT LIVES IN THIS BROWSER
 * ==================================
 *
 * Nobody should need an account to try a spreadsheet. `/sheet/local` is a
 * sheet with no server behind it: the document is written to the Origin
 * Private File System — a real file, private to this site, that survives a
 * reload and a restart — and two tabs on it stay in step over a
 * `BroadcastChannel`, which is a message bus between the tabs of one origin
 * with no server in the loop.
 *
 * OPFS is not everywhere yet, so `localStorage` is the fallback. Both are
 * behind the same two functions, and the page never knows which it got.
 */

import { parseDocument, type Document } from './document.ts';
import type { Op } from './ops.ts';

const FILE = 'local-sheet.json';
const STORAGE_KEY = 'abacus:local-sheet';

async function directory(): Promise<FileSystemDirectoryHandle | null> {
	try {
		if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
		return await navigator.storage.getDirectory();
	} catch {
		return null;
	}
}

export async function loadLocal(): Promise<Document | null> {
	const dir = await directory();
	if (dir) {
		try {
			const handle = await dir.getFileHandle(FILE);
			const file = await handle.getFile();
			return parseDocument(await file.text());
		} catch {
			// no file yet, or an unreadable one: fall through to localStorage
		}
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? parseDocument(raw) : null;
	} catch {
		return null;
	}
}

export async function saveLocal(doc: Document): Promise<'opfs' | 'storage' | 'none'> {
	const json = JSON.stringify(doc);
	const dir = await directory();
	if (dir) {
		try {
			const handle = await dir.getFileHandle(FILE, { create: true });
			const writable = await handle.createWritable();
			await writable.write(json);
			await writable.close();
			return 'opfs';
		} catch {
			// a full disk, or a browser that lists the API and refuses to write
		}
	}
	try {
		localStorage.setItem(STORAGE_KEY, json);
		return 'storage';
	} catch {
		return 'none';
	}
}

export async function clearLocal(): Promise<void> {
	const dir = await directory();
	try {
		await dir?.removeEntry(FILE);
	} catch {
		// nothing to remove
	}
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// nothing to remove
	}
}

/** A message on the channel: an operation from another tab, tagged with that tab. */
export interface TabMessage {
	tab: string;
	op: Op;
}

/**
 * The bus between tabs. `post` sends this tab's operations; `listen` hands
 * back the other tabs' with the sender's id, so a tab can ignore itself —
 * a `BroadcastChannel` does not echo, but the id makes that explicit and
 * survives somebody changing the transport.
 */
export function openTabChannel(tab: string): {
	post(op: Op): void;
	listen(handler: (message: TabMessage) => void): () => void;
	close(): void;
} {
	const channel =
		typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('abacus:local-sheet');
	return {
		post(op) {
			channel?.postMessage({ tab, op } satisfies TabMessage);
		},
		listen(handler) {
			if (!channel) return () => {};
			const onMessage = (event: MessageEvent<TabMessage>) => {
				if (event.data.tab !== tab) handler(event.data);
			};
			channel.addEventListener('message', onMessage);
			return () => channel.removeEventListener('message', onMessage);
		},
		close() {
			channel?.close();
		}
	};
}

/** One id per tab, kept for the tab's life in `sessionStorage`. */
export function tabId(): string {
	try {
		const existing = sessionStorage.getItem('abacus:tab');
		if (existing) return existing;
		const id = Math.random().toString(36).slice(2, 10);
		sessionStorage.setItem('abacus:tab', id);
		return id;
	} catch {
		return Math.random().toString(36).slice(2, 10);
	}
}
