/**
 * PUBLISHED PATTERNS
 * ==================
 *
 * Reads and writes for the `patterns` table, returning the shape the rest of
 * the app uses: a `Published` record with a real `Pattern` inside it. Remote
 * functions call these; nothing else touches the table.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { parseStored, toDto } from '#lib/pattern/dto.ts';
import type { Pattern } from '#lib/pattern/model.ts';
import { slugify } from '#lib/vanity.ts';
import { db, schema } from './db/index.ts';
import type { Artist } from './identity.ts';

export interface Published {
	id: string;
	slug: string;
	title: string;
	bpm: number;
	artist: { id: string; handle: string };
	remixOf: string | null;
	plays: number;
	likes: number;
	featured: boolean;
	createdAt: number;
	pattern: Pattern;
}

type Row = typeof schema.patterns.$inferSelect & { artist: { id: string; handle: string } };

function published(row: Row): Published {
	return {
		id: row.id,
		slug: row.slug,
		title: row.title,
		bpm: row.bpm,
		artist: row.artist,
		remixOf: row.remixOf,
		plays: row.plays,
		likes: row.likes,
		featured: row.featured,
		createdAt: row.createdAt,
		pattern: parseStored(row.data)
	};
}

/** Eight characters from an alphabet with no look-alikes. Short enough to read out loud. */
export function patternId(): string {
	const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
	return Array.from(
		crypto.getRandomValues(new Uint8Array(8)),
		(b) => alphabet[b % alphabet.length]
	).join('');
}

const withArtist = { artist: { columns: { id: true, handle: true } } } as const;

export async function getPattern(id: string): Promise<Published | null> {
	const row = await db.query.patterns.findFirst({
		where: eq(schema.patterns.id, id),
		with: withArtist
	});
	return row ? published(row) : null;
}

export async function resolveVanity(handle: string, slug: string): Promise<string | null> {
	const row = await db
		.select({ id: schema.patterns.id })
		.from(schema.patterns)
		.innerJoin(schema.artists, eq(schema.artists.id, schema.patterns.artistId))
		.where(and(eq(schema.artists.handle, handle), eq(schema.patterns.slug, slug)))
		.get();
	return row?.id ?? null;
}

export type Sort = 'new' | 'loved' | 'played';

export async function listPatterns(sort: Sort, limit: number): Promise<Published[]> {
	const order =
		sort === 'loved'
			? [desc(schema.patterns.likes), desc(schema.patterns.createdAt)]
			: sort === 'played'
				? [desc(schema.patterns.plays), desc(schema.patterns.createdAt)]
				: [desc(schema.patterns.createdAt)];

	const rows = await db.query.patterns.findMany({ orderBy: order, limit, with: withArtist });
	return rows.map(published);
}

export async function featuredPatterns(): Promise<Published[]> {
	const rows = await db.query.patterns.findMany({
		where: eq(schema.patterns.featured, true),
		orderBy: [desc(schema.patterns.likes)],
		limit: 6,
		with: withArtist
	});
	return rows.map(published);
}

export async function patternsBy(artistId: string): Promise<Published[]> {
	const rows = await db.query.patterns.findMany({
		where: eq(schema.patterns.artistId, artistId),
		orderBy: [desc(schema.patterns.createdAt)],
		with: withArtist
	});
	return rows.map(published);
}

/** Play and like counts for many patterns at once — what `query.batch` asks for. */
export async function countsFor(
	ids: string[]
): Promise<Map<string, { plays: number; likes: number }>> {
	if (ids.length === 0) return new Map();
	const rows = await db
		.select({ id: schema.patterns.id, plays: schema.patterns.plays, likes: schema.patterns.likes })
		.from(schema.patterns)
		.where(sql`${schema.patterns.id} in ${ids}`);
	return new Map(rows.map((row) => [row.id, { plays: row.plays, likes: row.likes }]));
}

/**
 * Publish, with a slug that is unique for this artist: `boom-bap`, then
 * `boom-bap-2`, and so on. Two publishes of the same title in quick succession
 * could race past the check and meet the unique index; the loop retries once
 * with the next number rather than surfacing that as a 500.
 */
export async function publishPattern(
	artist: Artist,
	pattern: Pattern,
	remixOf: string | null
): Promise<Published> {
	const base = slugify(pattern.title);

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const existing = await db
			.select({ slug: schema.patterns.slug })
			.from(schema.patterns)
			.where(
				and(
					eq(schema.patterns.artistId, artist.id),
					sql`${schema.patterns.slug} like ${base + '%'}`
				)
			);
		const taken = new Set(existing.map((row) => row.slug));

		let slug = base;
		for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;

		const id = patternId();
		try {
			await db.insert(schema.patterns).values({
				id,
				artistId: artist.id,
				slug,
				title: pattern.title,
				bpm: pattern.bpm,
				data: JSON.stringify(toDto(pattern)),
				remixOf
			});
		} catch (e) {
			if (attempt === 4) throw e;
			continue;
		}

		return (await getPattern(id))!;
	}

	throw new Error('unreachable');
}

export async function deletePattern(id: string, artistId: string): Promise<boolean> {
	const result = await db
		.delete(schema.patterns)
		.where(and(eq(schema.patterns.id, id), eq(schema.patterns.artistId, artistId)));
	return result.rowsAffected > 0;
}

export async function countPlay(id: string): Promise<void> {
	await db
		.update(schema.patterns)
		.set({ plays: sql`${schema.patterns.plays} + 1` })
		.where(eq(schema.patterns.id, id));
}

export async function love(id: string): Promise<number> {
	const [row] = await db
		.update(schema.patterns)
		.set({ likes: sql`${schema.patterns.likes} + 1` })
		.where(eq(schema.patterns.id, id))
		.returning({ likes: schema.patterns.likes });
	return row?.likes ?? 0;
}

export async function stats(): Promise<{ patterns: number; artists: number; rooms: number }> {
	const [p, a, r] = await Promise.all([
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.patterns)
			.get(),
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.artists)
			.get(),
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.rooms)
			.get()
	]);
	return { patterns: p?.n ?? 0, artists: a?.n ?? 0, rooms: r?.n ?? 0 };
}
