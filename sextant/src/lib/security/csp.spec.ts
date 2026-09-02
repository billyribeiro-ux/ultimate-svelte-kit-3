import { describe, expect, it } from 'vitest';
import { auditPolicy, hashesIn, nonceIn, parsePolicy } from './csp.ts';

/**
 * The audit is only worth having if it fails on the policies people actually
 * ship, so each of these is a real way a CSP stops working while still looking
 * like one.
 */

const COMMON =
	"default-src 'self'; connect-src 'self'; font-src 'self' data:; img-src 'self' data:; " +
	"object-src 'none'; style-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; " +
	"frame-ancestors 'none'";

/**
 * Both shapes, because `mode: 'auto'` emits both.
 *
 * A prerendered page's whole document is known at build time, so it gets
 * hashes. A dynamically rendered one streams — `resolve(…)` scripts appended
 * after the header has gone — so it gets a nonce, which is the only thing that
 * can cover a script that does not exist yet. The audit has to pass on either,
 * and `REAL` is the one this application serves for a signed-in page.
 */
const REAL = `${COMMON}; script-src 'self' 'nonce-ds+oJY8cI7hzGXeh53OeWg=='`;
const PRERENDERED = `${COMMON}; script-src 'self' 'sha256-ThXgSlaUpy4mmk42LrLnTnWygBJs+QKvuDUhceb6Yps='`;

describe('parsing', () => {
	it('splits directives and their sources', () => {
		const policy = parsePolicy(REAL);

		expect(policy.get('default-src')).toEqual(["'self'"]);
		expect(policy.get('img-src')).toEqual(["'self'", 'data:']);
		expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
	});

	it('survives the whitespace a concatenated header picks up', () => {
		const policy = parsePolicy("  default-src 'self' ;; script-src   'self'  ;  ");

		expect(policy.get('default-src')).toEqual(["'self'"]);
		expect(policy.get('script-src')).toEqual(["'self'"]);
		expect(policy.size).toBe(2);
	});
});

describe('hashes', () => {
	it('finds the sha256 sources and strips the quotes', () => {
		const hashes = hashesIn(parsePolicy(PRERENDERED));

		expect(hashes).toHaveLength(1);
		expect(hashes[0]).toBe('sha256-ThXgSlaUpy4mmk42LrLnTnWygBJs+QKvuDUhceb6Yps=');
	});

	it('does not mistake a keyword or a host for a hash', () => {
		// The narrowing is what gives `hashesIn` its `Sha256Source[]` return type,
		// and this is the case that would break it if it were a plain `includes`.
		const policy = parsePolicy(
			"script-src 'self' 'unsafe-inline' https://cdn.example sha-256-nope"
		);

		expect(hashesIn(policy)).toEqual([]);
	});
});

describe('the audit', () => {
	it('passes both policies this application ships', () => {
		expect(auditPolicy(parsePolicy(REAL))).toEqual([]);
		expect(auditPolicy(parsePolicy(PRERENDERED))).toEqual([]);
	});

	it('reads the nonce back out', () => {
		expect(nonceIn(parsePolicy(REAL))).toBe('ds+oJY8cI7hzGXeh53OeWg==');
		expect(nonceIn(parsePolicy(PRERENDERED))).toBeNull();
	});

	it("catches 'unsafe-inline' being added to make a console error go away", () => {
		const policy = parsePolicy(
			REAL.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
		);

		expect(auditPolicy(policy)).toContainEqual(expect.stringContaining("'unsafe-inline'"));
	});

	it("catches 'unsafe-eval'", () => {
		const policy = parsePolicy(
			REAL.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")
		);

		expect(auditPolicy(policy)).toContainEqual(expect.stringContaining("'unsafe-eval'"));
	});

	it('catches a wildcard script source', () => {
		const policy = parsePolicy(REAL.replace("script-src 'self'", 'script-src *'));

		expect(auditPolicy(policy)).toContainEqual(expect.stringContaining('any host'));
	});

	it('catches the policy losing both its hash and its nonce', () => {
		const policy = parsePolicy(REAL.replace(/ 'nonce-[^']*'/, ''));

		expect(auditPolicy(policy)).toContainEqual(
			expect.stringContaining('neither a hash nor a nonce')
		);
	});

	it('catches the two bypasses that are easy to leave out', () => {
		const withoutObject = parsePolicy(REAL.replace("object-src 'none'; ", ''));
		const withoutBase = parsePolicy(REAL.replace("base-uri 'self'; ", ''));

		expect(auditPolicy(withoutObject)).toContainEqual(expect.stringContaining('plugin document'));
		expect(auditPolicy(withoutBase)).toContainEqual(expect.stringContaining('<base>'));
	});

	it('does not complain about `style-src` being permissive', () => {
		// A deliberate, documented trade — Svelte writes per-frame `style="..."`
		// attributes that cannot be hashed. A check that fires on a decision
		// somebody already made is a check people learn to ignore.
		expect(auditPolicy(parsePolicy(REAL)).join(' ')).not.toContain('style-src');
	});
});
