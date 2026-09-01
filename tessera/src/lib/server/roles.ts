/**
 * The role type, on its own, importable from the browser.
 *
 * `db/schema.ts` also exports `Role`, and importing it from there would drag
 * Drizzle, the libSQL client and a native binding into the client bundle — which
 * fails the build, loudly, but only after you have written the import in four
 * components.
 *
 * A file whose only job is to be safe to import from both sides is not
 * ceremony. It is the seam between the two, made explicit.
 */
export const ROLES = ['owner', 'editor', 'commenter', 'viewer'] as const;

export type Role = (typeof ROLES)[number];
