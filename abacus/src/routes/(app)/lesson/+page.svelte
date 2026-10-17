<script lang="ts">
	import { Engine } from '#lib/engine/engine.ts';
	import { ErrorValue, type Scalar } from '#lib/formula/values.ts';
	import Section from '#lib/components/Section.svelte';
	import { ReactiveSheet } from '#lib/lesson/reactive.svelte.ts';
	import { parseA1 } from '#lib/sheet/address.ts';

	/**
	 * THE LESSON PAGE
	 * ===============
	 *
	 * Two three-by-three sheets with the same formulas. The left one is the
	 * hand-written engine; the right one is nine `$derived`s. Type into either
	 * and both update — and each says how many formulas it evaluated to do so,
	 * counted the same way on both sides, which is the number that makes the
	 * point.
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

	function edit(name: string, input: string) {
		const { row, col } = parseA1(name)!;
		const before = reactive.evaluations;
		reactive.set(name, input);
		engineEvaluated = engine.set(row, col, input).evaluated;
		engineVersion = engine.version;
		// Read every reactive value so that the deriveds run now, then count.
		for (const cell of reactive.cells.values()) void cell.value;
		reactiveEvaluated = reactive.evaluations - before;
	}

	/**
	 * What was typed into an engine cell, and what it comes to. The engine is
	 * not reactive, so both read `engineVersion` first: the number `edit` bumps
	 * is what makes the template ask again — the same one-signal contract the
	 * grid has with the sheet.
	 */
	function engineInput(row: number, col: number): string {
		void engineVersion;
		return engine.get(row, col)?.input ?? '';
	}

	function engineValue(row: number, col: number): Scalar {
		void engineVersion;
		return engine.value(row, col);
	}

	const show = (value: unknown) =>
		value === null ? '' : value instanceof ErrorValue ? value.code : String(value);
</script>

<svelte:head>
	<title>The lesson — Abacus</title>
</svelte:head>

<div class="page">
	<Section eyebrow="The lesson" title="A spreadsheet is a reactivity graph">
		<p class="prose">
			On the left, the engine this project wrote by hand: cells in a <code>Map</code>, edges
			recorded when a formula is parsed, a dirty set, a topological sort. On the right, nine
			<code>$derived</code>s that read each other through a lookup function, and nothing else to put
			them in order. Change a cell in either and watch the other follow — and watch the count of
			formulas each one evaluated. They agree, because they are the same algorithm: Svelte's runtime
			is a spreadsheet engine with the cells hidden.
		</p>

		<div class="twins">
			<div class="twin card stack">
				<h3>The engine, by hand</h3>
				<table class="mini">
					<tbody>
						{#each [1, 2, 3] as r (r)}
							<tr>
								{#each ['A', 'B', 'C'] as c (c)}
									{const name = `${c}${r}`}
									{const a = parseA1(name)!}
									{const value = $derived(engineValue(a.row, a.col))}
									<td>
										<label>
											<span class="visually-hidden">{name}</span>
											<input
												class="cell"
												value={engineInput(a.row, a.col)}
												onchange={(e) => edit(name, e.currentTarget.value)}
											/>
										</label>
										<output class={['shown', { error: value instanceof ErrorValue }]}>
											{show(value)}
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
									{const name = `${c}${r}`}
									{const cell = reactive.cells.get(name)!}
									<td>
										<label>
											<span class="visually-hidden">{name}</span>
											<input
												class="cell"
												value={cell.input}
												onchange={(e) => edit(name, e.currentTarget.value)}
											/>
										</label>
										<!--
											No <svelte:boundary> around this. A cycle is a value (see
											`reachesItself` in reactive.svelte.ts), and an exception thrown inside
											a $derived goes to the boundary of the effect that created it — this
											page — not to one around the markup that read it.
										-->
										<output class={['shown', { error: cell.value instanceof ErrorValue }]}
											>{show(cell.value)}</output
										>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="hint" role="status">
					Last edit evaluated <strong>{reactiveEvaluated}</strong> formula cells.
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
					Type <code>5.0</code> into <code>A2</code> while it holds 5. Different text, the same number.
					The engine evaluates the five formulas downstream of an edited cell regardless; the deriveds
					evaluate none, because Svelte compares each new value with the old one and an equal value notifies
					nobody. That is the one place the two part ways on a sheet with no cycle, and it is Svelte doing
					less.
				</li>
				<li>
					Type <code>=C3</code> into <code>A1</code>. Both sides mark the cycle as
					<code>#CYCLE!</code>, and both need a graph to do it. Svelte's own answer to a derived
					that reads itself is an exception — <code>derived_references_self</code> in development;
					in a production build the deriveds call each other until the stack runs out — so each cell
					on the right also derives, from the formulas' references, whether it is on a cycle, and a
					cell that is answers <code>#CYCLE!</code> without reading another. That is the engine's bookkeeping
					again. Both counts drop to two: the six cells on the cycle are marked, not evaluated, and only
					A3 and B3, which read the cycle from outside it, are worked out. A spreadsheet must tolerate
					a person's mistake; a program must not tolerate its own.
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
