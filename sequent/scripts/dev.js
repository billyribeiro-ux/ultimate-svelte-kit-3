/**
 * Run the venue: the engine process and the web process, together.
 *
 * Sequent is deliberately multi-process, and this script exists so that being
 * multi-process does not also mean being annoying to start. It is not a process
 * manager — it spawns two children, forwards their output, and makes sure that
 * when one dies the other does too.
 *
 * That last part is the only interesting bit. Without it, killing the terminal
 * leaves an engine running against the database, and the next `pnpm dev` starts
 * a *second* engine. Two engines writing events for the same commands is the
 * one failure this whole architecture is built to make impossible — the
 * sequencer's `assertSoleWriter` catches it, but it is much better not to
 * arrange it in the first place.
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { resolveDatabaseUrl, WORKSPACE_ROOT } from './paths.js';

// Absolute, always. The children run in different directories, and a relative
// path would give each of them a different database. See `paths.js`.
const DATABASE_URL = resolveDatabaseUrl();
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173';

const children = [];
let stopping = false;

/** Spawn a child, tag its output, and remember it. */
function start(name, command, args, cwd) {
	const child = spawn(command, args, {
		cwd: resolve(WORKSPACE_ROOT, cwd),
		env: { ...process.env, DATABASE_URL, PUBLIC_ORIGIN },
		// `pipe` rather than `inherit` so each line can be tagged with which
		// process produced it. Two interleaved untagged logs are unreadable, and
		// this is the cheapest possible fix.
		stdio: ['ignore', 'pipe', 'pipe']
	});

	const tag = (stream, prefix) => {
		let buffered = '';
		stream.on('data', (chunk) => {
			buffered += chunk.toString();
			const lines = buffered.split('\n');
			// Keep the last fragment — it is a partial line until the next chunk.
			buffered = lines.pop() ?? '';
			for (const line of lines) console.log(`${prefix} ${line}`);
		});
	};

	tag(child.stdout, `[36m[${name}][0m`);
	tag(child.stderr, `[31m[${name}][0m`);

	child.on('exit', (code, signal) => {
		if (stopping) return;
		console.log(`[31m[${name}] exited (${signal ?? code}) — stopping everything[0m`);
		stopAll(code ?? 1);
	});

	children.push({ name, child });
	return child;
}

function stopAll(code) {
	if (stopping) return;
	stopping = true;

	for (const { child } of children) {
		if (child.exitCode === null) child.kill('SIGTERM');
	}

	/*
	 * A deadline, then SIGKILL.
	 *
	 * The engine finishes its current batch on SIGTERM, which is the behaviour we
	 * want and which takes a moment. If it is still there after three seconds it
	 * is wedged, and waiting forever for a graceful shutdown that is not coming
	 * is how a deploy hangs.
	 */
	const deadline = setTimeout(() => {
		for (const { child } of children) if (child.exitCode === null) child.kill('SIGKILL');
		process.exit(code);
	}, 3000);

	deadline.unref();

	Promise.all(
		children.map(({ child }) =>
			child.exitCode !== null
				? Promise.resolve()
				: new Promise((resolve) => child.once('exit', resolve))
		)
	).then(() => process.exit(code));
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stopAll(0));

console.log(`Sequent — database ${DATABASE_URL}, origin ${PUBLIC_ORIGIN}\n`);

start('engine', 'node', ['src/main.ts'], 'apps/engine');
start('web', 'pnpm', ['exec', 'vite', 'dev'], 'apps/web');
