/**
 * The worker process.
 *
 * Drains the outbox: webhooks to member firms, emails to the people who need
 * them. Nothing here decides anything — every message it sends was written into
 * the outbox, transactionally, by whoever knew the fact.
 *
 * It is safe to run several of these. The outbox leases each message to one
 * worker at a time, so scaling out is starting another process and nothing
 * else. It is also safe to run none for a while: messages queue, and the only
 * consequence is that firms hear about their trades late.
 *
 * That combination — horizontally scalable and safely absent — is what a
 * transactional outbox buys, and it is why the notification path is not inside
 * the engine.
 */

import { openStore, stats } from '@sequent/store';
import { runWorker } from './loop.ts';

const url = process.env['DATABASE_URL'] ?? 'file:sequent.db';
const name = process.env['WORKER_NAME'] ?? `worker-${process.pid}`;

/*
 * `ALLOW_INSECURE_WEBHOOKS` loosens the SSRF checks so a developer can point a
 * webhook at `http://localhost:3000`.
 *
 * An environment variable rather than a code branch on `NODE_ENV`, because
 * `NODE_ENV` is set to `production` in places nobody expects and the failure
 * mode of getting this backwards is a production venue that will happily fetch
 * its own cloud metadata endpoint on a member's instruction.
 */
const allowInsecure = process.env['ALLOW_INSECURE_WEBHOOKS'] === 'true';

const controller = new AbortController();
let shuttingDown = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		if (shuttingDown) {
			/*
			 * Exiting now abandons any message currently in flight — its lease is
			 * still held, so it will not be retried until the lease expires. That is
			 * a delay, not a loss, which is exactly the property the lease exists to
			 * provide.
			 */
			console.error('[worker] second signal, exiting immediately');
			process.exit(130);
		}

		shuttingDown = true;
		console.log(`[worker] ${signal} — finishing the current batch`);
		controller.abort();
	});
}

const client = await openStore({ url });

console.log(`[worker] ${name} starting against ${url}`);
if (allowInsecure) console.warn('[worker] SSRF checks relaxed — development only');

const health = await stats(client);
console.log(`[worker] ${health.pending} pending, ${health.dead} dead on arrival`);

await runWorker(client, {
	signal: controller.signal,
	name,
	allowInsecure,
	onProgress: ({ claimed, delivered, retried, dead }) => {
		// Only when something happened. A worker that logs every idle poll produces
		// a log nobody reads, which is the same as no log at all.
		if (claimed === 0) return;
		console.log(`[worker] ${delivered} delivered, ${retried} retrying, ${dead} dead`);
	}
});

const final = await stats(client);
console.log(`[worker] stopped. ${final.pending} pending, ${final.delivered} delivered total`);

client.close();
