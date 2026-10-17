/**
 * A STREAMED VALUE, READ AS STATE
 * ===============================
 *
 * A `load` can return a promise without awaiting it, and SvelteKit streams it:
 * the page goes out at once and the value follows in a later chunk. The usual
 * way to read one is `{#await promise then value}`, and that has two costs
 * worth knowing. On the server an `{#await}` block renders only its pending
 * branch, so whatever sits in the `then` branch is missing from the server's
 * HTML. And when the promise lands in the browser, the `then` branch is drawn
 * from scratch, with whatever focus and caret were inside it lost.
 *
 * Neither is right for a control that is merely *improved* by the value. The
 * query editor works without the list of services; the list only feeds its
 * completion. So the editor should be in the first paint, and stay mounted —
 * caret, focus and all — when the list arrives.
 *
 * This is the smallest thing that does that: a stand-in until the promise
 * resolves, then the value, in a `$state.raw` field that anything reading
 * `current` follows. Raw, because the value is replaced whole and never
 * mutated, so a deep proxy around it would be work for nothing.
 *
 * WHY A CLASS, AND NOT AN EFFECT THAT COPIES THE VALUE INTO STATE
 * --------------------------------------------------------------
 * Because the promise *is* the source, and a class is where a promise and the
 * state it settles into can live together. A component writes
 * `$derived(new Streamed(data.services, []))`: when `data` changes — a
 * navigation back to the same page streams a new list — the derived makes a
 * new one, and the old one is dropped with the promise it was waiting for. An
 * `$effect` doing the copying would need a flag to ignore a promise that
 * landed after it had been replaced, and it would be an effect writing state,
 * which the Svelte documentation asks you not to use effects for.
 *
 * A rejection keeps the stand-in. Deciding what a failed stream means is the
 * `load`'s job — the explore page's turns a failure into an empty list — and a
 * component that reads `current` has nowhere to put an error anyway.
 */
export class Streamed<T> {
	current: T;

	constructor(promise: Promise<T>, standIn: T) {
		this.current = $state.raw(standIn);

		promise.then(
			(value) => {
				this.current = value;
			},
			() => {}
		);
	}
}
