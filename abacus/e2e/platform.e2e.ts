import { expect, test } from '@playwright/test';

/**
 * THE PLATFORM
 * ============
 *
 * What is true of the deployment rather than of any one feature: the
 * prerendered pages, the pages that ship no JavaScript, the security
 * headers, the one route that may be framed, the health check, the version,
 * and what a wrong address gets.
 */

test('the landing page is prerendered, with its policy in the document', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

	// A prerendered page cannot carry a header, so its Content Security Policy
	// travels as a meta tag with script hashes in it.
	const meta = page.locator('meta[http-equiv="content-security-policy"]');
	await expect(meta).toHaveAttribute('content', /script-src 'self' 'sha256-/);

	// A client-side navigation: with `router.resolution: 'server'` the browser
	// asks the server which route a path belongs to, then loads only that.
	await page.getByRole('link', { name: 'Start from a template' }).click();
	await expect(page).toHaveURL(/\/templates$/);
	await expect(page.getByRole('link', { name: 'Monthly budget' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Loan schedule' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Grade book' })).toBeVisible();
});

test('a template page is prerendered from `entries` and opens as a local copy', async ({
	page
}) => {
	await page.goto('/templates/budget');
	await expect(page.getByRole('heading', { level: 1, name: 'Monthly budget' })).toBeVisible();
	await expect(page.getByRole('table')).toContainText('Groceries');
	await expect(page.getByRole('table')).toContainText('$512.40');

	await page.getByRole('link', { name: 'Open a copy — no account' }).click();
	await expect(page).toHaveURL(/\/sheet\/local\?template=budget$/);
	await expect(page.locator('#cell-0-0')).toHaveText('Category');
	await expect(page.locator('#cell-8-1')).toHaveText('$2,845.00');
});

test('a published sheet is plain HTML: no script, a table, a CSV', async ({ page, request }) => {
	const response = await page.goto('/s/seedbudget');
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { level: 1, name: 'Monthly budget' })).toBeVisible();
	await expect(page.getByText('by Abacus')).toBeVisible();
	await expect(page.locator('script')).toHaveCount(0);
	await expect(page.getByRole('table')).toContainText('Left over');

	const headers = response!.headers();
	expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
	expect(headers['vary']).toContain('Cookie');

	const csv = await request.get('/api/sheets/seedbudget/export.csv');
	expect(csv.ok()).toBe(true);
	expect(csv.headers()['content-type']).toContain('text/csv');
	expect(csv.headers()['content-disposition']).toContain('Monthly budget.csv');
	const text = await csv.text();
	expect(text.split(/\r?\n/)[0]).toBe('Category,Budgeted,Actual,Difference,Share of spend');
	// Values travel formatted, as a person would read them; a comma inside is quoted.
	expect(text).toContain('Groceries,$450.00,$512.40,-$62.40,17.4%');
	expect(text).toContain('Rent,"$1,400.00","$1,400.00",$0.00,');
});

test('the embed is the one page that may be framed', async ({ page }) => {
	const response = await page.goto('/embed/seedbudget');
	expect(response?.headers()['content-security-policy']).toContain('frame-ancestors *');
	await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
	await expect(page.getByRole('table')).toContainText('Rent');
	await expect(page.getByRole('link', { name: 'Monthly budget' })).toHaveAttribute(
		'href',
		'/s/seedbudget'
	);
});

test('the health check answers with the running version', async ({ request }) => {
	const health = await request.get('/healthz');
	expect(health.ok()).toBe(true);
	expect(health.headers()['cache-control']).toBe('no-store');
	const body = (await health.json()) as { ok: boolean; version: string; uptime: number };
	expect(body.ok).toBe(true);
	expect(body.uptime).toBeGreaterThanOrEqual(0);

	// The same version the client polls for, so a deploy is noticed.
	const polled = await request.get('/_app/version.json');
	expect(((await polled.json()) as { version: string }).version).toBe(body.version);
});

test('a wrong address is a 404 with the error page, not a crash', async ({ page }) => {
	const response = await page.goto('/s/not-a-sheet');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1, name: 'Nothing here' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Back to Abacus' })).toBeVisible();
});

test('a cross-site form post is refused', async ({ request }) => {
	const response = await request.post('/sheets', {
		headers: { origin: 'https://elsewhere.example' },
		form: { title: 'not yours' }
	});
	expect(response.status()).toBe(403);
});
