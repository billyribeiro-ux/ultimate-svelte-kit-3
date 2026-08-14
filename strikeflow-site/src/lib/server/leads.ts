/**
 * LEAD STORAGE
 * ============
 *
 * Where captured email addresses go.
 *
 * THE DESIGN DECISION THAT MATTERS: this module exports an *interface* (`LeadStore`)
 * and one implementation of it. Everything upstream depends on the interface.
 *
 * Why bother, when there's only one implementation? Because there won't be for long.
 * A real deployment sends these to Mailchimp, ConvertKit, HubSpot, or a Postgres
 * table. When that day comes, you write a second implementation and change one line
 * — you do not go hunting through form handlers for `fs.appendFile` calls. This is
 * the difference between a two-hour change and a two-day one, and it costs about
 * fifteen lines today.
 *
 * The default implementation appends newline-delimited JSON to a file. That's a
 * deliberate choice for a teaching project: zero dependencies, zero infrastructure,
 * and you can read the output with `cat`. It is NOT what you'd run in production —
 * concurrent appends from multiple processes can interleave, and there's no backup.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { LEADS_DIR } from '$app/env/private';

/** A captured lead. */
export interface Lead {
	readonly email: string;
	/** Self-reported experience, used for list segmentation. */
	readonly experience: ExperienceLevel;
	readonly consentedToMarketing: boolean;
	/** ISO 8601 timestamp of capture. */
	readonly capturedAt: string;
	/** Which page or campaign produced the signup. */
	readonly source: string;
}

export type ExperienceLevel = 'new' | 'some' | 'experienced' | 'professional';

/**
 * The contract every storage backend must satisfy.
 *
 * Deliberately tiny. A wide interface is hard to implement, which defeats the point
 * of having one.
 */
export interface LeadStore {
	/** Persist a lead. Must be idempotent-safe: the same email may arrive twice. */
	save(lead: Lead): Promise<void>;
	/** Has this address already signed up? Used to avoid duplicate welcome emails. */
	has(email: string): Promise<boolean>;
}

/* ------------------------------------------------------------------
 * FILE-BACKED IMPLEMENTATION
 * ------------------------------------------------------------------ */

/*
 * `resolve()` against the working directory, so a relative LEADS_DIR like ".data"
 * lands inside the project rather than wherever the process happened to start.
 */
const dataDir = resolve(process.cwd(), LEADS_DIR);
const leadsFile = join(dataDir, 'leads.jsonl');

/**
 * Normalise an email for comparison.
 *
 * Lowercased and trimmed. We deliberately do NOT strip Gmail-style dots or `+tags`:
 * `a+news@gmail.com` is a legitimate address a user chose in order to filter our
 * mail, and silently rewriting it is both rude and, under GDPR, arguably processing
 * we didn't disclose.
 */
export function normaliseEmail(email: string): string {
	return email.trim().toLowerCase();
}

class FileLeadStore implements LeadStore {
	async save(lead: Lead): Promise<void> {
		await mkdir(dirname(leadsFile), { recursive: true });

		/*
		 * One JSON object per line — the JSONL format.
		 *
		 * Better than a single JSON array here for one specific reason: appending is
		 * a pure append. A JSON array would require reading the whole file, parsing
		 * it, pushing, and rewriting — which is O(n) per signup and loses everything
		 * if the process dies mid-write.
		 */
		const line = `${JSON.stringify(lead)}\n`;
		await appendFile(leadsFile, line, 'utf8');
	}

	async has(email: string): Promise<boolean> {
		const target = normaliseEmail(email);

		try {
			const contents = await readFile(leadsFile, 'utf8');

			return contents
				.split('\n')
				.filter(Boolean)
				.some((line) => {
					try {
						const parsed = JSON.parse(line) as Partial<Lead>;
						return typeof parsed.email === 'string' && normaliseEmail(parsed.email) === target;
					} catch {
						// One corrupt line shouldn't break the whole lookup.
						return false;
					}
				});
		} catch (error) {
			// ENOENT just means nobody has signed up yet — that's not an error.
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
			throw error;
		}
	}
}

/**
 * The store the app uses.
 *
 * Swapping backends is this one line. Everything else imports `leadStore` and is
 * unaware of what's behind it.
 */
export const leadStore: LeadStore = new FileLeadStore();
