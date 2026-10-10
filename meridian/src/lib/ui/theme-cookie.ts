/**
 * THE THEME, TOLD TO THE SERVER
 * =============================
 *
 * A chosen theme lives in `localStorage`, where the boot script in
 * `app.html` reads it before the first paint. The server cannot read
 * `localStorage`, and one thing it renders depends on the choice: the home
 * page's hero, which has a day print and a night print, and must ask for
 * only the one that will be shown — the browser starts downloading an
 * image long before any script runs. So the boot script, and
 * `theme.set()`, mirror the choice into this cookie, and the `(site)`
 * layout's `load` reads it back.
 *
 * Nothing else depends on it: every colour on the page still comes from
 * `light-dark()` and `data-theme`, so a missing or stale cookie costs at
 * most a picture drawn for the other theme, never a flash.
 */
export const THEME_COOKIE = 'meridian-theme';

export type ChosenTheme = 'light' | 'dark';

export function chosenTheme(value: string | undefined): ChosenTheme | null {
	return value === 'light' || value === 'dark' ? value : null;
}
