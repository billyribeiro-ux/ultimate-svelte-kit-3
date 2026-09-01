/**
 * A board with something on it.
 *
 * Two accounts in one workspace — an owner and a viewer — so that the permission
 * model can be seen working rather than taken on trust: sign in as the viewer,
 * try to move a box, and watch the server refuse it while the board keeps
 * rendering.
 *
 * Run with `node scripts/seed.ts`. No transpiler: Node 24 strips TypeScript
 * types on the fly. Types are erased rather than checked — that is
 * `svelte-check`'s job — and the syntax that would need emitting rather than
 * erasing (`enum`, namespaces, parameter properties) is not used here.
 */

process.loadEnvFile('.env');

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as schema from '../src/lib/server/db/schema.ts';
import { Clock, MIDDLE, between, newActorId, type OrderKey } from '../src/lib/crdt/index.ts';
import type { Operation } from '../src/lib/board/ops.ts';
import type { Fill, NodeKind } from '../src/lib/board/types.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = createClient({ url });
const db = drizzle(client, { schema });

/**
 * A second Better Auth instance, configured the same way.
 *
 * The application's own lives in `src/lib/server/auth.ts` and imports
 * `$app/env/private`, which only exists inside a SvelteKit build. Rather than
 * contort that module to be runnable from a script, the script builds its own —
 * the important thing is that the *password hashing* is Better Auth's, so the
 * accounts it creates can actually sign in.
 */
const auth = betterAuth({
	baseURL: process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173',
	secret: process.env.BETTER_AUTH_SECRET ?? 'seed-secret-not-used-for-anything-real-00',
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: { enabled: true, minPasswordLength: 12 }
});

const PASSWORD = 'tessera-demo-2026';

async function account(name: string, email: string): Promise<string> {
	const existing = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
	if (existing[0]) return existing[0].id;

	const created = await auth.api.signUpEmail({
		body: { name, email, password: PASSWORD },
		headers: new Headers()
	});

	return created.user.id;
}

/* ------------------------------------------------------------------ */
/* The demo board, expressed as operations                             */
/* ------------------------------------------------------------------ */

/**
 * Seeding writes *operations*, not rows.
 *
 * It would be quicker to insert a snapshot directly. It would also mean the seed
 * is the one board in the system that never went through the code every other
 * board goes through — so a bug in the operation format would not show up until
 * a real person made a real edit. This way the demo board is proof the pipeline
 * works.
 */
const actor = newActorId();
const clock = new Clock(actor);

const operations: Operation[] = [];

function node(
	kind: NodeKind,
	x: number,
	y: number,
	label: string,
	fill: Fill,
	order: OrderKey,
	size: { w: number; h: number } = { w: 168, h: 88 }
): string {
	const stamp = clock.tick();
	operations.push({
		kind: 'node.add',
		stamp,
		id: stamp,
		fields: { kind, x, y, w: size.w, h: size.h, fill, order, parent: null }
	});

	let after: string | null = null;
	for (const character of [...label]) {
		const at = clock.tick();
		operations.push({
			kind: 'text.insert',
			stamp: at,
			target: stamp,
			after: after as never,
			value: character
		});
		after = at;
	}

	return stamp;
}

function edge(from: string, to: string, kind: 'sync' | 'async' | 'stream' | 'dependency'): void {
	const stamp = clock.tick();
	operations.push({
		kind: 'edge.add',
		stamp,
		id: stamp,
		fields: { from: from as never, to: to as never, kind, fromPort: 'auto', toPort: 'auto' }
	});
}

let order = MIDDLE;
const nextOrder = (): OrderKey => (order = between(order, null));

const web = node('service', 40, 40, 'Web', 'indigo', nextOrder());
const api = node('service', 320, 40, 'API gateway', 'indigo', nextOrder());
const orders = node('service', 600, 40, 'Orders', 'jade', nextOrder());
const queue = node('queue', 600, 200, 'order.events', 'amber', nextOrder());
const store = node('datastore', 880, 40, 'Postgres', 'slate', nextOrder());
const email = node('external', 880, 200, 'Email provider', 'rose', nextOrder());
node(
	'note',
	40,
	200,
	'Double-click a shape to rename it. Press N for a new one.',
	'cyan',
	nextOrder(),
	{ w: 240, h: 88 }
);

edge(web, api, 'sync');
edge(api, orders, 'sync');
edge(orders, store, 'sync');
edge(orders, queue, 'async');
edge(queue, email, 'async');

/* ------------------------------------------------------------------ */
/* Write it                                                            */
/* ------------------------------------------------------------------ */

const ownerId = await account('Ada Reyes', 'ada@tessera.test');
const viewerId = await account('Mo Iqbal', 'mo@tessera.test');

const workspaceId = 'demo-workspace';
const boardId = 'demo-board';

await db
	.insert(schema.workspace)
	.values({ id: workspaceId, name: 'Payments platform', slug: 'payments' })
	.onConflictDoNothing();

for (const [userId, role] of [
	[ownerId, 'owner'],
	[viewerId, 'viewer']
] as const) {
	await db
		.insert(schema.membership)
		.values({ id: `${workspaceId}:${userId}`, workspaceId, userId, role })
		.onConflictDoNothing();
}

await db
	.insert(schema.board)
	.values({ id: boardId, workspaceId, title: 'Checkout, end to end' })
	.onConflictDoNothing();

// Idempotent: the (board, stamp) unique index means re-running the seed adds
// nothing, so `pnpm run db:seed` is safe to type twice.
await db
	.insert(schema.operation)
	.values(
		operations.map((operation) => ({
			boardId,
			stamp: operation.stamp,
			actor,
			authorId: ownerId,
			kind: operation.kind,
			payload: JSON.stringify(operation)
		}))
	)
	.onConflictDoNothing();

console.log(`[seed] ${operations.length} operations on "${boardId}"`);
console.log(`[seed] owner  ada@tessera.test / ${PASSWORD}`);
console.log(`[seed] viewer mo@tessera.test  / ${PASSWORD}`);
console.log(`[seed] board  ${process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173'}/b/${boardId}`);
