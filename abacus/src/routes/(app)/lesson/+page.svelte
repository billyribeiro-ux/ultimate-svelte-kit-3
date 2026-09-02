<script lang="ts">
	import { Engine } from '#lib/engine/engine.ts';
	import { ErrorValue } from '#lib/formula/values.ts';
	import Section from '#lib/components/Section.svelte';
	import { ReactiveSheet } from '#lib/lesson/reactive.svelte.ts';
	import { parseA1 } from '#lib/sheet/address.ts';

	/**
	 * THE LESSON PAGE
	 * ===============
	 *
	 * Two three-by-three sheets with the same formulas. The left one is the
	 * hand-written engine of chapter 10; the right one is nine `$derived`s.
	 * Type into either and both update — and each says how many cells it
	 * evaluated to do so, which is the number that makes the point.
	 */
	const starting: Record<string, string> = {
		A1: '10',
		B1: '=A1*2',
		C1: '=B1+A1',
		A2: '5',
		B2: '=A2+B1',
		C2: '=SUM(A1:B2)',
		A3: '=IF(A1>A2,"A1","A2")',
		B3: '=C1-C2',
		C3: '=AVERAGE(A1:C2)'
	};

	const reactive = new ReactiveSheet();
	const engine = new Engine();

	for (const [name, input] of Object.entries(starting)) {
		reactive.set(name, input);
		const { row, col } = parseA1(name)!;
		engine.set(row, col, input);
	}

	let engineVersion = $state(engine.version);
	let engineEvaluated = $state(0);
	let reactiveEvaluated = $state(0);
	let lastReactive = 0;

	function edit(name: string, input: string) {
		const { row, col } = parseA1(name)!;
		const before = reactive.evaluations;
		reactive.set(name, input);
		engineEvaluated = engine.set(row, col, input).evaluated;
		engineVersion = engine.version;
		// Read every reactive value so that the deriveds run now, then count.
		for (const cell of reactive.cells.values()) void cell.value;
		reactiveEvaluated = reactive.evaluations - before;
		lastReactive = reactive.evaluations;
	}

	const show = (value: unknown) =>
		value === null ? '' : value instanceof ErrorValue ? value.code : String(value);

	// Silence the "assigned but never read" warning honestly: it is read by `edit`.
	void lastReactive;
</script>

<svelte:head>
	<title>The lesson — Abacus</title>
</svelte:head>

<div class="page">
	<Section eyebrow="The lesson" title="A spreadsheet is a reactivity graph">
		<p class="prose">
			On the left, the engine this project wrote by hand: cells in a <code>Map</code>, edges
			recorded when a formula is parsed, a dirty set, a topological sort. On the right, nine
			<code>$derived</code>s that read each other through a lookup function and nothing else. Change
			a cell in either and watch the other follow — and watch the count of cells each one evaluated.
			They agree, because they are the same algorithm: Svelte's runtime is a spreadsheet engine with
			the cells hidden.
		</p>

		<div class="twins">
			<div class="twin card stack">
				<h3>The engine, by hand</h3>
				<table class="mini">
					<tbody>
						{#each [1, 2, 3] as r (r)}
							<tr>
								{#each ['A', 'B', 'C'] as c (c)}
									{@const name = `${c}${r}`}
									{@const a = parseA1(name)!}
									<td>
										<label>
											<span class="visually-hidden">{name}</span>
											<input
												class="cell"
												value={engine.get(a.row, a.col)?.input ?? ''}
												onchange={(e) => edit(name, e.currentTarget.value)}
											/>
										</label>
										<output
											class={['shown', { error: engine.value(a.row, a.col) instanceof ErrorValue }]}
										>
											{(void engineVersion, show(engine.value(a.row, a.col)))}
										</output>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="hint" role="status">
					Last edit evaluated <strong>{engineEvaluated}</strong> formula cells.
				</p>
			</div>

			<div class="twin card stack">
				<h3>Nine <code>$derived</code>s</h3>
				<table class="mini">
					<tbody>
						{#each [1, 2, 3] as r (r)}
							<tr>
								{#each ['A', 'B', 'C'] as c (c)}
									{@const name = `${c}${r}`}
									{@const cell = reactive.cells.get(name)!}
									<td>
										<label>
											<span class="visually-hidden">{name}</span>
											<input
												class="cell"
												value={cell.input}
												onchange={(e) => edit(name, e.currentTarget.value)}
											/>
										</label>
										<svelte:boundary>
											<output class={['shown', { error: cell.value instanceof ErrorValue }]}
												>{show(cell.value)}</output
											>
											{#snippet failed(error)}
												<output class="shown error" title={(error as Error).message}>cycle!</output>
											{/snippet}
										</svelte:boundary>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="hint" role="status">
					Last edit evaluated <strong>{reactiveEvaluated}</strong> deriveds.
				</p>
			</div>
		</div>

		<div class="prose stack">
			<h3>Try these</h3>
			<ul>
				<li>
					Change <code>A1</code> to 20. Both sides recompute B1, C1, B2, C2, A3, B3, C3 — and not A2.
				</li>
				<li>
					Change <code>A2</code>. Fewer cells this time: only what reads A2, directly or through
					another cell.
				</li>
				<li>
					Type <code>=C3</code> into <code>A1</code>. The engine marks the cycle as
					<code>#CYCLE!</code> and carries on; the reactive sheet throws, and the boundary around that
					cell catches it. A spreadsheet must tolerate a person's mistake; a program must not tolerate
					its own.
				</li>
				<li>
					Notice that <code>C2</code>, which reads four cells, is evaluated once per change, never
					four times. That is what <em>glitch-free</em> means, and both sides have it.
				</li>
			</ul>
		</div>
	</Section>
</div>

<style>
	.twins {
		display: grid;
		gap: var(--space-4);
	}

	.mini {
		border-collapse: collapse;
	}

	.mini td {
		padding: var(--space-1);
		border: 1px solid var(--grid-line);
		vertical-align: top;
	}

	.cell {
		width: 7.5rem;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
	}

	.shown {
		display: block;
		min-height: 1.4em;
		padding: 0 var(--space-2);
		font-size: var(--fs-sm);
		font-variant-numeric: tabular-nums;
	}

	.error {
		color: var(--danger);
	}

	@media (min-width: 64rem) {
		.twins {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
