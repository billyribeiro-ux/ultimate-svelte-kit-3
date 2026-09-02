/**
 * SHEETS IN THE DATABASE
 * ======================
 *
 * Reads and writes for the `sheets` table. Remote functions call these;
 * nothing else touches the table. Every read that hands back a sheet checks
 * who is asking, so an id in a URL is never enough on its own.
 */

import { error } from '@sveltejs/kit';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { CELL_LIMIT } from '$app/env/private';
import { applyOps } from '#lib/sheet/apply.ts';
import { emptyDocument, parseDocument, type Document } from '#lib/sheet/document.ts';
import type { Op } from '#lib/sheet/ops.ts';
import { db, schema } from './db/index.ts';
import type { User } from './identity.ts';

export interface SheetSummary {
	id: string;
	title: string;
	access: 'private' | 'link';
	cellCount: number;
	version: number;
	published: boolean;
	updatedAt: number;
	createdAt: number;
}

export interface SheetRecord extends SheetSummary {
	ownerId: string;
	doc: Document;
}

type Row = typeof schema.sheets.$inferSelect;

function summary(row: Row): SheetSummary {
	return {
		id: row.id,
		title: row.title,
		access: row.access,
		cellCount: row.cellCount,
		version: row.version,
		published: row.published !== null,
		updatedAt: row.updatedAt,
		createdAt: row.createdAt
	};
}

function record(row: Row): SheetRecord {
	return { ...summary(row), ownerId: row.ownerId, doc: parseDocument(row.doc) };
}

/** Eight characters from an alphabet with no look-alikes. */
export function sheetId(): string {
	const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
	return Array.from(
		crypto.getRandomValues(new Uint8Array(8)),
		(b) => alphabet[b % alphabet.length]
	).join('');
}

export async function createSheet(
	owner: User,
	title: string,
	doc = emptyDocument(title)
): Promise<SheetRecord> {
	const id = sheetId();
	const stored = { ...doc, title };
	await db.insert(schema.sheets).values({
		id,
		ownerId: owner.id,
		title,
		doc: JSON.stringify(stored),
		cellCount: stored.cells.length
	});
	return (await getSheet(id, owner))!;
}

export async function listSheets(ownerId: string): Promise<SheetSummary[]> {
	const rows = await db.query.sheets.findMany({
		where: eq(schema.sheets.ownerId, ownerId),
		orderBy: [desc(schema.sheets.updatedAt)]
	});
	return rows.map(summary);
}

/**
 * A sheet, if this person may open it: its owner, or — when the owner has
 * turned link access on — anybody signed in. A 404 either way, because "it
 * exists but not for you" is a fact a stranger has no business learning.
 */
export async function getSheet(id: string, user: User | null): Promise<SheetRecord | null> {
	const row = await db.query.sheets.findFirst({ where: eq(schema.sheets.id, id) });
	if (!row) return null;
	if (!user) return null;
	if (row.ownerId !== user.id && row.access !== 'link') return null;
	return record(row);
}

export async function requireSheet(id: string, user: User | null): Promise<SheetRecord> {
	const sheet = await getSheet(id, user);
	if (!sheet) error(404, 'No such sheet');
	return sheet;
}

/** Owner-only changes: rename, access, delete, publish. */
async function requireOwned(id: string, user: User): Promise<Row> {
	const row = await db.query.sheets.findFirst({ where: eq(schema.sheets.id, id) });
	if (!row || row.ownerId !== user.id) error(404, 'No such sheet');
	return row;
}

export async function renameSheet(id: string, user: User, title: string): Promise<void> {
	await requireOwned(id, user);
	await db
		.update(schema.sheets)
		.set({ title, updatedAt: Date.now() })
		.where(eq(schema.sheets.id, id));
}

export async function setAccess(id: string, user: User, access: 'private' | 'link'): Promise<void> {
	await requireOwned(id, user);
	await db
		.update(schema.sheets)
		.set({ access, updatedAt: Date.now() })
		.where(eq(schema.sheets.id, id));
}

export async function deleteSheet(id: string, user: User): Promise<void> {
	await requireOwned(id, user);
	await db.delete(schema.sheets).where(eq(schema.sheets.id, id));
}

/**
 * Save a whole document — the autosave path when nobody else is on the
 * sheet. `baseVersion` is the version the browser last saw; if the row has
 * moved on, somebody else saved first and this save is refused rather than
 * silently overwriting theirs.
 */
export async function saveDocument(
	id: string,
	user: User,
	doc: Document,
	baseVersion: number
): Promise<{ version: number }> {
	const row = await requireSheetRow(id, user);
	if (row.version !== baseVersion)
		error(409, 'Somebody else saved this sheet first — reload to see their changes');
	if (doc.cells.length > CELL_LIMIT)
		error(413, `A sheet may hold at most ${CELL_LIMIT.toLocaleString()} cells`);
	const version = row.version + 1;
	await db
		.update(schema.sheets)
		.set({
			doc: JSON.stringify(doc),
			title: doc.title,
			version,
			cellCount: doc.cells.length,
			updatedAt: Date.now()
		})
		.where(eq(schema.sheets.id, id));
	return { version };
}

async function requireSheetRow(id: string, user: User): Promise<Row> {
	const row = await db.query.sheets.findFirst({ where: eq(schema.sheets.id, id) });
	if (!row || (row.ownerId !== user.id && row.access !== 'link')) error(404, 'No such sheet');
	return row;
}

/**
 * Apply operations from a browser: the collaboration path. The document is
 * updated in the same transaction as the op log, the version goes up by one,
 * and the new version is what the live query announces.
 */
export async function applySheetOps(
	id: string,
	user: User,
	ops: Op[]
): Promise<{ version: number; cellCount: number }> {
	const row = await requireSheetRow(id, user);
	const next = applyOps(parseDocument(row.doc), ops);
	if (next.cells.length > CELL_LIMIT)
		error(413, `A sheet may hold at most ${CELL_LIMIT.toLocaleString()} cells`);
	const version = row.version + 1;

	await db.transaction(async (tx) => {
		await tx
			.update(schema.sheets)
			.set({
				doc: JSON.stringify(next),
				title: next.title,
				version,
				cellCount: next.cells.length,
				updatedAt: Date.now()
			})
			.where(eq(schema.sheets.id, id));
		await tx
			.insert(schema.ops)
			.values({ sheetId: id, version, userId: user.id, payload: JSON.stringify(ops) });
	});

	return { version, cellCount: next.cells.length };
}

/** The operations after a version, oldest first, for a browser catching up. */
export async function opsSince(
	id: string,
	version: number
): Promise<{ version: number; ops: Op[] }[]> {
	const rows = await db.query.ops.findMany({
		where: and(eq(schema.ops.sheetId, id), gt(schema.ops.version, version)),
		orderBy: [schema.ops.version]
	});
	return rows.map((r) => ({ version: r.version, ops: JSON.parse(r.payload) as Op[] }));
}

/* ------------------------------------------------------------------ */
/* Publishing                                                          */
/* ------------------------------------------------------------------ */

export interface PublishedSheet {
	id: string;
	title: string;
	owner: string;
	doc: Document;
	publishedAt: number;
}

/** A read-only copy at `/s/<id>`, frozen now; publishing again refreshes it. */
export async function publishSheet(id: string, user: User): Promise<PublishedSheet> {
	const row = await requireOwned(id, user);
	await db
		.update(schema.sheets)
		.set({ published: row.doc, publishedAt: Date.now() })
		.where(eq(schema.sheets.id, id));
	return (await getPublished(id))!;
}

export async function unpublishSheet(id: string, user: User): Promise<void> {
	await requireOwned(id, user);
	await db
		.update(schema.sheets)
		.set({ published: null, publishedAt: null })
		.where(eq(schema.sheets.id, id));
}

export async function getPublished(id: string): Promise<PublishedSheet | null> {
	const row = await db.query.sheets.findFirst({
		where: eq(schema.sheets.id, id),
		with: { owner: { columns: { name: true } } }
	});
	if (!row?.published || row.publishedAt === null) return null;
	return {
		id: row.id,
		title: row.title,
		owner: row.owner.name,
		doc: parseDocument(row.published),
		publishedAt: row.publishedAt
	};
}

export async function stats(): Promise<{ sheets: number; users: number; published: number }> {
	const [s, u, p] = await Promise.all([
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.sheets)
			.get(),
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.users)
			.get(),
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.sheets)
			.where(sql`${schema.sheets.published} is not null`)
			.get()
	]);
	return { sheets: s?.n ?? 0, users: u?.n ?? 0, published: p?.n ?? 0 };
}
