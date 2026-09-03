/**
 * THE GUIDES
 * ==========
 *
 * Every `.svx` file in `src/content/guides` is a guide. mdsvex compiles each
 * one into a Svelte component (the Markdown becomes markup, the frontmatter
 * becomes a `metadata` export), and `import.meta.glob` — a Vite feature —
 * imports the whole folder at build time, so adding a guide is adding a
 * file. No registry to update, no list to forget.
 *
 * The frontmatter is *validated*, with the same valibot the forms use. A typo
 * in `published:` is a build error here rather than an `Invalid Date` on a
 * page that shipped.
 */

import type { Component } from 'svelte';
import * as v from 'valibot';
import gazetteer from '#lib/data/places.json' with { type: 'json' };

const GuideMetaSchema = v.object({
	title: v.pipe(v.string(), v.nonEmpty()),
	summary: v.pipe(v.string(), v.nonEmpty()),
	/** A gazetteer id, when the guide is about one place. */
	place: v.optional(v.string()),
	minutes: v.pipe(v.number(), v.integer(), v.minValue(1)),
	published: v.pipe(v.string(), v.isoDate())
});

export type GuideMeta = v.InferOutput<typeof GuideMetaSchema>;

export interface Guide extends GuideMeta {
	readonly slug: string;
	/** Where the guide is about, when it is about somewhere. */
	readonly placeName: string | null;
	readonly country: string | null;
	readonly component: Component;
}

/*
 * `eager: true` imports every module now rather than returning a function
 * that imports it later. Eager is right here: the list page needs every
 * guide's title, and the whole folder is a handful of files.
 */
const modules = import.meta.glob<{ default: Component; metadata: unknown }>(
	'/src/content/guides/*.svx',
	{ eager: true }
);

export const guides: readonly Guide[] = Object.entries(modules)
	.map(([path, module]) => {
		const slug =
			path
				.split('/')
				.pop()
				?.replace(/\.svx$/, '') ?? path;
		const meta = v.parse(GuideMetaSchema, module.metadata, {
			message: `Guide ${slug}: invalid frontmatter`
		});
		const place = meta.place ? gazetteer.find((p) => p.id === meta.place) : undefined;
		if (meta.place && !place) throw new Error(`Guide ${slug}: unknown place "${meta.place}"`);
		return {
			...meta,
			slug,
			placeName: place?.name ?? null,
			country: place?.country ?? null,
			component: module.default
		};
	})
	.sort((a, b) => (a.published < b.published ? 1 : -1));

export function guideBySlug(slug: string): Guide | undefined {
	return guides.find((guide) => guide.slug === slug);
}

/** The guide for a place, if one was written. The explore page links to it. */
export function guideForPlace(placeId: string): Guide | undefined {
	return guides.find((guide) => guide.place === placeId);
}
