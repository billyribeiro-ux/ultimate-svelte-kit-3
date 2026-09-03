import { expect, test, type Page } from '@playwright/test';

/**
 * THE LOCAL SHEET
 * ===============
 *
 * No account and no server round trips: the document lives in this
 * browser's private file system. These tests drive the grid the way a
 * person does — click a cell, type, press Enter — and read back what the
 * cells show, which is the only thing a person can read.
 */

const cell = (page: Page, row: number, col: number) => page.locator(`#cell-${row}-${col}`);

/** Click a cell, type into it, press Enter: the selection moves down. */
async function enter(page: Page, row: number, col: number, text: string) {
	await cell(page, row, col).click();
	await page.keyboard.type(text);
	await page.keyboard.press('Enter');
}

test.beforeEach(async ({ page }) => {
	await page.goto('/sheet/local');
	await expect(page.getByText('Kept in this browser')).toBeVisible();
});

test('typing, formulas and recalculation', async ({ page }) => {
	await enter(page, 0, 0, '12');
	await enter(page, 1, 0, '30');
	await enter(page, 2, 0, '=SUM(A1:A2)*2');
	await expect(cell(page, 2, 0)).toHaveText('84');

	// Change a precedent; the dependent follows without being touched.
	await enter(page, 0, 0, '20');
	await expect(cell(page, 2, 0)).toHaveText('100');

	// The formula bar shows the formula of the active cell, and where it is.
	await cell(page, 2, 0).click();
	await expect(page.getByRole('combobox', { name: 'Formula' })).toHaveValue('=SUM(A1:A2)*2');
	await expect(page.getByLabel('Active cell', { exact: true })).toHaveText('A3');

	// Once something is saved, the chip says so.
	await expect(page.getByText('Saved in this browser')).toBeVisible();
});

test('errors are values, and a cycle is named as one', async ({ page }) => {
	await enter(page, 0, 0, '=1/0');
	await expect(cell(page, 0, 0)).toHaveText('#DIV/0!');

	await enter(page, 1, 0, '=A3+1');
	await enter(page, 2, 0, '=A2+1');
	await expect(cell(page, 1, 0)).toHaveText('#CYCLE!');
	await expect(cell(page, 2, 0)).toHaveText('#CYCLE!');

	// IFERROR sees the error as a value and answers with something else.
	await enter(page, 0, 1, '=IFERROR(A1, "no")');
	await expect(cell(page, 0, 1)).toHaveText('no');

	// A formula that does not parse is flagged while it is being typed, with
	// the position of the problem; Escape abandons the edit.
	await cell(page, 3, 0).click();
	await page.keyboard.type('=SUM(');
	await expect(page.getByRole('alert')).toContainText('at character');
	await page.keyboard.press('Escape');
	await expect(cell(page, 3, 0)).toHaveText('');
});

test('undo and redo, from the keyboard and the toolbar', async ({ page }) => {
	await enter(page, 0, 0, 'first');
	await expect(cell(page, 0, 0)).toHaveText('first');

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(cell(page, 0, 0)).toHaveText('');
	await page.getByRole('button', { name: 'Redo' }).click();
	await expect(cell(page, 0, 0)).toHaveText('first');

	await cell(page, 0, 0).click();
	await page.keyboard.press('Control+z');
	await expect(cell(page, 0, 0)).toHaveText('');
	await page.keyboard.press('Control+y');
	await expect(cell(page, 0, 0)).toHaveText('first');
});

test('deleting a row rewrites the formulas below it, and undo puts everything back', async ({
	page
}) => {
	await enter(page, 0, 0, '1');
	await enter(page, 1, 0, '2');
	await enter(page, 2, 0, '=SUM(A1:A2)');
	await expect(cell(page, 2, 0)).toHaveText('3');

	// Select row 2 and delete it through the menu — a native popover.
	await cell(page, 1, 0).click();
	await page.getByRole('button', { name: 'Rows and columns', exact: true }).click();
	await page.getByRole('button', { name: 'Delete 1 row' }).click();

	// The formula moved up a row and its range shrank to what is left.
	await expect(cell(page, 1, 0)).toHaveText('1');
	await cell(page, 1, 0).click();
	await expect(page.getByRole('combobox', { name: 'Formula' })).toHaveValue('=SUM(A1:A1)');

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(cell(page, 1, 0)).toHaveText('2');
	await expect(cell(page, 2, 0)).toHaveText('3');
});

test('number formats change how a value reads, not what it is', async ({ page }) => {
	await enter(page, 0, 0, '0.256');
	await cell(page, 0, 0).click();
	await page.getByRole('button', { name: 'Percent format' }).click();
	await expect(cell(page, 0, 0)).toHaveText('25.6%');

	await enter(page, 1, 0, '=A1*100');
	await expect(cell(page, 1, 0)).toHaveText('25.6');

	await cell(page, 0, 0).click();
	await page.getByRole('button', { name: 'Number format' }).click();
	await page.getByRole('button', { name: 'Currency (EUR)' }).click();
	await expect(cell(page, 0, 0)).toHaveText('€0.26');
});

test('imports a CSV through the worker and exports it back', async ({ page }) => {
	await cell(page, 0, 0).click();
	await page.getByLabel('Import a CSV file').setInputFiles({
		name: 'people.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from('name,age\nAda,36\n"Hopper, Grace",45\n')
	});
	await expect(page.getByText('Imported 3 rows')).toBeVisible();
	await expect(cell(page, 0, 0)).toHaveText('name');
	await expect(cell(page, 2, 0)).toHaveText('Hopper, Grace');
	await expect(cell(page, 2, 1)).toHaveText('45');

	// A formula over the imported numbers, then the whole thing as a file.
	await enter(page, 3, 1, '=AVERAGE(B2:B3)');
	await expect(cell(page, 3, 1)).toHaveText('40.5');

	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export CSV' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toMatch(/\.csv$/);
	const text = await new Promise<string>((resolve, reject) => {
		const chunks: Buffer[] = [];
		file
			.createReadStream()
			.then((stream) => {
				stream.on('data', (chunk: Buffer) => chunks.push(chunk));
				stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
				stream.on('error', reject);
			})
			.catch(reject);
	});
	expect(text).toContain('Ada,36');
	expect(text).toContain('"Hopper, Grace",45');
	expect(text).toContain('40.5');
});

test('what was typed is still there after a reload', async ({ page }) => {
	await enter(page, 0, 0, 'kept');
	await expect(page.getByText('Saved in this browser')).toBeVisible();

	await page.reload();
	await expect(cell(page, 0, 0)).toHaveText('kept');
});

test('two tabs on the same sheet stay in step', async ({ page, context }) => {
	const other = await context.newPage();
	await other.goto('/sheet/local');
	await expect(other.getByText('Kept in this browser')).toBeVisible();

	await enter(page, 0, 0, 'from the first tab');
	await expect(cell(other, 0, 0)).toHaveText('from the first tab');

	await enter(other, 1, 0, '=LEN(A1)');
	await expect(cell(page, 1, 0)).toHaveText('18');
	await other.close();
});

test('the title is editable in place and names the document', async ({ page }) => {
	const title = page.getByLabel('Sheet title');
	await title.fill('Trip budget');
	await title.press('Enter');
	await expect(page).toHaveTitle('Trip budget — Abacus');
});

test('the formula bar completes function names', async ({ page }) => {
	await cell(page, 0, 0).click();
	const bar = page.getByRole('combobox', { name: 'Formula' });
	await bar.click();
	await bar.pressSequentially('=sum');
	const suggestions = page.getByRole('listbox');
	await expect(suggestions).toBeVisible();
	await expect(suggestions.getByRole('option', { name: /^SUM\(/ })).toBeVisible();

	// Enter takes the highlighted suggestion and leaves the caret inside the call.
	await bar.press('Enter');
	await expect(bar).toHaveValue('=SUM(');
	await bar.pressSequentially('1,2)');
	await bar.press('Enter');
	await expect(cell(page, 0, 0)).toHaveText('3');
});
