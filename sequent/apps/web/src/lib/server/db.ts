/**
 * The one database connection this process opens.
 *
 * A module-level singleton, which is right here: it guards a process-wide
 * resource, so having two would guard nothing — and `busy_timeout` is a
 * property of the connection, so a second one opened elsewhere would quietly
 * not have it.
 */
import { DATABASE_URL } from '$app/env/private';
import { openStore } from '@sequent/store';

export const db = await openStore({ url: DATABASE_URL });
