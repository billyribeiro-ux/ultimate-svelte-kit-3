/**
 * PART 8 — The rest of the product
 * (chapters 36–41)
 *
 * Six features, each chosen because it needs a different part of the platform:
 * progressive forms, a fold over a log, a Web Worker, a custom element, a
 * service worker, and an accessibility story that had to be designed rather
 * than retrofitted.
 */

export const part8 = [
	{
		slug: 'collaborative-text-in-place',
		title: 'Typing into a shape somebody else is typing into',
		summary:
			'A textarea over an RGA: the prefix/suffix diff, the caret anchored to a character, and the IME rule that stops other replicas watching you think.',
		goal: 'Bridge a `<textarea>`’s "here is the whole new string" to a CRDT’s "insert this after that".',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/components/LabelEditor.svelte',
				lang: 'svelte',
				code: `
/**
 * IN-PLACE COLLABORATIVE TEXT
 * ===========================
 *
 * A plain \`<textarea>\`, not a contenteditable.
 *
 * Contenteditable gives you rich text you did not ask for, a different DOM in
 * every browser, and an IME story that has to be rebuilt by hand. A textarea
 * gives you \`value\`, \`selectionStart\`, native spellcheck, native undo inside
 * the field, and composition events that already work. A node label is one run
 * of plain text; anything more is a feature nobody requested.
 *
 * THE DIFF
 * --------
 * The textarea reports the whole new string, and the CRDT wants "insert these
 * characters after that one". Bridging the two is a common-prefix and
 * common-suffix scan, which is exactly right for how people actually edit: a
 * keystroke, a paste, a selection replaced. It is wrong for a change that
 * happens to move text around inside the field, and that is a trade worth
 * making — the alternative is a real diff algorithm running on every keystroke.
 */`
			},
			{
				type: 'why',
				title: 'A textarea, not a contenteditable',
				text: 'Contenteditable gives you rich text you did not ask for, a different DOM in every browser, and an IME story that has to be rebuilt by hand. A textarea gives you `value`, `selectionStart`, native spellcheck, native undo *inside the field*, and composition events that already work. A node label is one run of plain text; anything more is a feature nobody requested.'
			},
			{
				type: 'code',
				file: 'src/lib/components/LabelEditor.svelte',
				lang: 'svelte',
				code: `
let field = $state<HTMLTextAreaElement | null>(null);

/**
 * Take focus, and select what is there.
 *
 * Without this the field appears and the keystrokes go to the board, where
 * they are tool shortcuts — so naming a new shape "Ledger" silently switches
 * to the external-system tool twice and creates nothing. Selecting the
 * existing text is what makes typing *replace* a name, which is what everybody
 * expects from a rename.
 *
 * Declared as a \`const\` rather than written inline in the template. An
 * attachment re-runs whenever its expression produces a new function, and an
 * arrow function written in markup is new on every render — so an inline
 * version would grab focus and reselect the text on every keystroke, including
 * somebody else's.
 */
const takeFocus: Attachment<HTMLTextAreaElement> = (node) => {
	node.focus();
	node.select();`
			},
			{
				type: 'p',
				text: 'Without the focus grab, the field appears and the keystrokes go to the *board*, where they are tool shortcuts — so naming a new shape "Ledger" silently switches to the external-system tool twice and creates nothing.'
			},
			{
				type: 'warn',
				text: 'The attachment is a `const`, not an inline arrow. An attachment re-runs whenever its expression produces a new function, and an arrow written in markup is new on **every render** — so an inline version would grab focus and reselect the text on every keystroke, including somebody else’s. This is the single most common attachment mistake, and it is invisible until two people are in the same label.'
			},

			{ type: 'h3', id: 'ime', text: 'The composition rule' },
			{
				type: 'code',
				file: 'src/lib/components/LabelEditor.svelte',
				lang: 'svelte',
				code: `
/**
 * True between \`compositionstart\` and \`compositionend\`.
 *
 * Japanese, Chinese and Korean input builds a word from several keystrokes,
 * and the textarea's value during that time is provisional — pre-edit text the
 * person has not committed. Diffing it produces a stream of insertions and
 * deletions that other replicas watch flicker, and it breaks the IME's own
 * candidate window. So nothing is sent until composition ends.
 */
let composing = $state(false);`
			},
			{
				type: 'p',
				text: 'Japanese, Chinese and Korean input builds a word from several keystrokes, and the textarea’s value during that time is **provisional** — pre-edit text the person has not committed. Diffing it produces a stream of insertions and deletions that other replicas watch flicker, and it breaks the IME’s own candidate window.'
			},
			{
				type: 'p',
				text: 'This is a good example of a feature you cannot find by testing in English. It is also why `ja` is one of the three languages: having it in the catalogue means somebody actually types Japanese into the thing at some point.'
			},

			{ type: 'h3', id: 'the-caret', text: 'A remote edit, and where the caret goes' },
			{
				type: 'code',
				file: 'src/lib/components/LabelEditor.svelte',
				lang: 'svelte',
				code: `
/**
 * The last text we know the document holds.
 *
 * Tracked separately from \`value\` because the diff must be against what the
 * *document* had, not what the textarea last rendered — those differ for one
 * frame after a remote edit lands.
 */
// svelte-ignore state_referenced_locally
// Intentional. \`mirror\` is seeded from the current text once and then tracks
// what the *document* holds, which is not the same thing as what this prop
// last rendered — the two differ for one frame after a remote edit lands, and
// that frame is exactly when the diff must not use the newer value.
let mirror = $state(value);

$effect(() => {
	// A remote edit arrived. Update the field without disturbing the caret more
	// than the change itself requires.
	if (!field || field.value === value) {
		mirror = value;
		return;
	}

	const anchor = board.label(target).idBefore(field.selectionStart);
	field.value = value;
	mirror = value;

	const offset = board.label(target).offsetAfter(anchor);
	const caret = offset ?? Math.min(field.selectionStart, value.length);
	field.setSelectionRange(caret, caret);
});`
			},
			{
				type: 'p',
				text: 'Five lines, and they are chapter 11’s `idBefore`/`offsetAfter` pair doing the job they exist for. Remember the character id under the caret **before** the value changes, then ask the RGA where that character is now. Somebody inserting three characters above you does not move your cursor, because the character it is anchored to has not moved.'
			},
			{
				type: 'note',
				text: '`mirror` is tracked separately from the `value` prop, and the `svelte-ignore state_referenced_locally` is intentional rather than a suppression. The diff must be against what the *document* had, not what the textarea last rendered — those differ for exactly one frame after a remote edit lands, and that frame is precisely when the diff must not use the newer value.'
			},

			{ type: 'h3', id: 'the-diff', text: 'The diff' },
			{
				type: 'code',
				file: 'src/lib/components/LabelEditor.svelte',
				lang: 'svelte',
				code: `
function commit(next: string) {
	if (next === mirror) return;

	// Common prefix, then common suffix, then the difference between them.
	let start = 0;
	while (start < mirror.length && start < next.length && mirror[start] === next[start])
		start += 1;

	let end = 0;
	while (
		end < mirror.length - start &&
		end < next.length - start &&
		mirror[mirror.length - 1 - end] === next[next.length - 1 - end]
	) {
		end += 1;
	}

	const removed = mirror.length - start - end;
	const added = next.slice(start, next.length - end);

	// Delete first, then insert. The other order would make the insertion's
	// anchor a character that is about to be tombstoned — which works, and
	// leaves the new text on the wrong side of it.
	if (removed > 0) board.deleteText(target, start, start + removed);
	if (added) board.insertText(target, start, added);

	mirror = next;
}`
			},
			{
				type: 'p',
				text: 'Common prefix, common suffix, and the difference between them. That is exactly right for how people actually edit — a keystroke, a paste, a selection replaced — and wrong for a change that moves text around inside the field. Accepting that is a much better trade than a real diff algorithm running on every keystroke.'
			},
			{
				type: 'warn',
				text: 'Delete first, then insert. The other order makes the insertion’s anchor a character that is about to be tombstoned — which *works*, and leaves the new text on the wrong side of it. Two orderings, both plausible, one correct, and the incorrect one produces text that is subtly scrambled only when you replace a selection.'
			},

			{
				type: 'checkpoint',
				items: [
					'Two people typing at opposite ends of a label both keep their text.',
					'Somebody typing above your caret does not move it.',
					'Typing Japanese sends nothing until the word is committed.'
				]
			}
		]
	},

	{
		slug: 'comments',
		title: 'Comments',
		summary:
			'The feature that deliberately does not use the CRDT, and the form instance per thread that stops one failure from decorating every thread.',
		goal: 'Know when a collaborative feature should be rows in a table instead.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/remote/comments.remote.ts',
				lang: 'ts',
				code: `
/**
 * COMMENTS
 * ========
 *
 * Threads anchored to a shape, in their own table rather than in the CRDT.
 *
 * A comment is an event with an author and a time, not a value two people edit
 * into a merged state — "we both replied at once" wants both replies, which is
 * two rows and not a register. Keeping them out of the document also means a
 * \`commenter\` can be given comment rights without being handed the ability to
 * write to the board at all.
 */`
			},
			{
				type: 'why',
				title: 'When not to reach for the CRDT you just built',
				text: 'A comment is an **event** with an author and a time, not a value two people edit into a merged state. "We both replied at once" wants both replies — which is two rows, not a register with a winner. Building it on the document would mean inventing an append-only list inside a structure designed for mergeable values, to get behaviour a table gives you for nothing. Keeping comments out also means a `commenter` can be given comment rights without being handed write access to the board at all, which is the entire reason that role exists.'
			},
			{
				type: 'code',
				file: 'src/lib/remote/comments.remote.ts',
				lang: 'ts',
				code: `
/** Every thread on a board, oldest first, with its replies. */
export const threads = query(boardId, async (id): Promise<Thread[]> => {
	const who = requireUser();
	await requireAccess(id, who.id, 'viewer').catch(rethrow);

	const rows = await db
		.select({
			id: comment.id,
			anchor: comment.anchor,
			parentId: comment.parentId,
			body: comment.body,
			createdAt: comment.createdAt,
			resolvedAt: comment.resolvedAt,
			author: user.name
		})
		.from(comment)
		.innerJoin(user, eq(user.id, comment.authorId))
		.where(eq(comment.boardId, id))
		.orderBy(asc(comment.createdAt))
		.limit(500);

	/*
	 * One query, assembled in memory.
	 *
	 * The alternative is a query for roots and one for each root's replies, which
	 * on a board with forty threads is forty-one round trips to answer a question
	 * the database could answer once. Threads are one level deep by design, so the
	 * assembly is a single pass.
	 */
	const roots = new Map<string, Thread>();

	for (const row of rows) {
		if (row.parentId === null) {
			roots.set(row.id, { ...row, replies: [] });
		}
	}

	for (const row of rows) {
		if (row.parentId === null) continue;
		roots.get(row.parentId)?.replies.push({
			id: row.id,
			author: row.author,
			body: row.body,
			createdAt: row.createdAt
		});
	}

	return [...roots.values()];
});`
			},
			{
				type: 'p',
				text: 'One query, assembled in memory. The alternative is a query for roots and one per root’s replies, which on a board with forty threads is forty-one round trips to answer a question the database could answer once. Threads are one level deep by design, so the assembly is a single pass.'
			},
			{
				type: 'code',
				file: 'src/lib/remote/comments.remote.ts',
				lang: 'ts',
				code: `
/**
 * Start a thread, or reply to one.
 *
 * A \`form()\` so that it works without JavaScript, and so the reply boxes can be
 * created with \`postComment.for(threadId)\` — one form instance per thread, each
 * with its own pending state and its own validation issues, from one definition.
 */
export const postComment = form(
	v.object({
		boardId,
		body,
		anchor: v.optional(v.string()),
		parentId: v.optional(v.string())
	}),
	async ({ boardId: id, body: text, anchor, parentId }) => {
		const who = requireUser();

		// \`commenter\` is enough. That is the whole point of the role.
		await requireAccess(id, who.id, 'commenter').catch(rethrow);

		await db.insert(comment).values({
			id: crypto.randomUUID(),
			boardId: id,
			anchor: anchor || null,
			parentId: parentId || null,
			authorId: who.id,
			body: text
		});

		await threads(id).refresh();
	}`
			},
			{
				type: 'p',
				text: 'A `form()` rather than a `command()`, for the reason from chapter 32 — it works without JavaScript — and for a second reason specific to this shape: `postComment.for(threadId)` gives every reply box its own instance from one definition.'
			},
			{
				type: 'code',
				file: 'src/lib/components/Comments.svelte',
				lang: 'svelte',
				code: `
/*
 * \`$derived\`, not a plain \`const\`.
 *
 * \`threads(boardId)\` called once captures whichever board was open when this
 * component mounted. Deriving it means navigating to another board re-runs the
 * query — and, less obviously, it is what makes the compiler stop warning that
 * the reference only captures the initial value, which is a warning worth
 * listening to rather than silencing.
 */
const list = $derived(threads(boardId));
const open = $derived((list.current ?? []).filter((thread) => thread.resolvedAt === null));`
			},
			{
				type: 'warn',
				text: '`$derived`, not a plain `const`. `threads(boardId)` called once captures whichever board was open when the component mounted. Deriving it means navigating to another board re-runs the query — and, less obviously, it is what makes the compiler stop warning that the reference only captures the initial value, which is a warning worth listening to rather than silencing.'
			},

			{ type: 'h3', id: 'per-thread', text: 'One definition, independent state' },
			{
				type: 'code',
				file: 'src/lib/components/Comments.svelte',
				lang: 'svelte',
				code: `
{#each open as thread (thread.id)}
	{@const reply = postComment.for(thread.id)}
	<article class="thread">
		<header class="thread__head">
			<strong>{thread.author}</strong>
			{#if thread.anchor}<span class="thread__anchor">on a shape</span>{/if}
		</header>
		<p class="thread__body">{thread.body}</p>

		{#each thread.replies as item (item.id)}
			<p class="thread__reply"><strong>{item.author}</strong> {item.body}</p>
		{/each}

		<!--
			\`postComment.for(thread.id)\` — one form instance per thread, from one
			definition. Each keeps its own pending state and its own validation
			issues, so a failed reply in one thread does not put an error message
			under every other one. Spreading the bare \`postComment\` into a loop
			gives every thread the same instance and exactly that bug.
		-->
		<form {...reply} class="thread__reply-form">
			<input {...reply.fields.boardId.as('hidden', boardId)} />
			<input {...reply.fields.parentId.as('hidden', thread.id)} />
			<label class="visually-hidden" for="reply-{thread.id}">Reply</label>
			<input id="reply-{thread.id}" {...reply.fields.body.as('text')} placeholder="Reply…" />
			<Button size="sm" type="submit">{t.comments.post}</Button>
		</form>

		<Button
			size="sm"
			variant="ghost"
			onclick={() => resolveThread({ boardId, id: thread.id, resolved: true })}
		>
			{t.comments.resolve}
		</Button>`
			},
			{
				type: 'p',
				text: 'Spread the bare `postComment` into the loop and every thread shares one instance: a failed reply in one thread puts its error message under all of them, and the pending spinner appears on every button at once. `.for(id)` is the fix and it is four characters.'
			},
			{
				type: 'note',
				text: 'Note `resolveThread`’s `where` clause: `and(eq(comment.id, id), isNull(comment.parentId))`. Only a root comment can be resolved, because a reply has no independent state — and expressing that in the query rather than in a check above it means there is no path that forgets.'
			},

			{
				type: 'checkpoint',
				items: [
					'A colleague’s comment appears without a refresh.',
					'A failed reply shows its error under one thread only.',
					'A `commenter` can comment and cannot move a box.'
				]
			}
		]
	},

	{
		slug: 'version-history',
		title: 'Version history, where restore is an edit',
		summary:
			'A fold over the log, a diff between two documents, and why a rewind would be a lie the moment somebody reconnects.',
		goal: 'Put a board back the way it was, collaboratively, without deleting anything.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/server/history.ts',
				lang: 'ts',
				code: `
/**
 * TIME TRAVEL
 * ===========
 *
 * Replaying a board to a point in its log, and working out what would have to
 * happen for the present to look like the past.
 *
 * RESTORE IS AN EDIT, NOT A REWIND
 * --------------------------------
 * Nothing here deletes an operation. "Restore to Tuesday" computes the
 * difference between now and Tuesday and appends it as ordinary operations —
 * so the restore is itself in the history, can itself be undone, and merges with
 * whatever a colleague is doing at the same moment like any other edit.
 *
 * A rewind cannot do any of that. It would also be a lie the moment somebody
 * else's replica, which still holds the operations you deleted, reconnects.
 *
 * WHY THIS RUNS ON THE SERVER
 * ---------------------------
 * The rest of the system keeps the server out of the document's business. This
 * is the deliberate exception: a restore has to compare two full states, one of
 * which the client does not have, and it is an explicit administrative action
 * rather than something that happens sixty times a second. It is authored under
 * the requesting user's id and lands in the log like any other batch.
 */`
			},
			{
				type: 'why',
				title: 'Why a rewind is not an option',
				text: 'Deleting operations would make the restore invisible in the history, impossible to undo, and unable to merge with what a colleague is doing at that moment. Worse, it would be **a lie**: somebody else’s replica still holds the operations you deleted, and the moment they reconnect they push them back. An append-only log cannot be rewound by one participant, and a restore is one participant’s decision.'
			},
			{
				type: 'p',
				text: 'This is also the one place the server is allowed an opinion about the document, and the comment says so out loud. A restore has to compare two full states, one of which the client does not have, and it is an explicit administrative action rather than something happening sixty times a second.'
			},
			{
				type: 'code',
				file: 'src/lib/server/history.ts',
				lang: 'ts',
				code: `
/** Replay a board up to and including \`seq\`. Pass \`Infinity\` for the present. */
export async function documentAt(boardId: string, seq: number): Promise<BoardDocument> {
	const rows = await db
		.select({ snapshot: board.snapshot, snapshotSeq: board.snapshotSeq })
		.from(board)
		.where(eq(board.id, boardId))
		.limit(1);

	const found = rows[0];
	if (!found) throw new Error(\`No such board: \${boardId}\`);

	/*
	 * The stored snapshot is only usable when it is not already past the point we
	 * are aiming for. Compaction moves it forward, so a board compacted this
	 * morning cannot be used to reconstruct last week — that replay starts from
	 * nothing, which is slower and correct.
	 */
	const usable = found.snapshot && found.snapshotSeq <= seq;

	const document = BoardDocument.fromSnapshot(
		newActorId(),
		usable ? parseSnapshot(JSON.parse(found.snapshot!)) : emptySnapshot()
	);

	let cursor = usable ? found.snapshotSeq : 0;

	for (;;) {
		const page = await db
			.select({ seq: operation.seq, payload: operation.payload })
			.from(operation)
			.where(
				and(
					eq(operation.boardId, boardId),
					gt(operation.seq, cursor),
					Number.isFinite(seq) ? lte(operation.seq, seq) : undefined
				)
			)
			.orderBy(operation.seq)
			.limit(1_000);

		if (page.length === 0) break;

		document.applyAll(page.map((row) => JSON.parse(row.payload) as Operation));
		cursor = page.at(-1)!.seq;

		if (page.length < 1_000) break;
	}

	return document;
}`
			},
			{
				type: 'p',
				text: 'The snapshot is only usable when it is **not already past** the point being aimed for. Compaction moves it forward, so a board compacted this morning cannot be used to reconstruct last week — that replay starts from nothing, which is slower and correct. One boolean, and getting it backwards would produce a "restore" that silently returned the present.'
			},
			{
				type: 'code',
				file: 'src/lib/server/history.ts',
				lang: 'ts',
				code: `
/**
 * The operations that would make \`present\` look like \`past\`.
 *
 * Written against the reactive projections rather than the CRDT internals,
 * because what a person means by "restore" is "the picture I had", not "the
 * merge history I had".
 */
export function diffToward(
	present: BoardDocument,
	past: BoardDocument,
	actor: ActorId,
	clock: Clock
): Operation[] {
	const ops: Operation[] = [];

	/* Nodes that exist now and did not exist then: remove them. */
	for (const node of present.nodes.values()) {
		if (past.nodes.has(node.id)) continue;
		ops.push({
			kind: 'node.remove',
			stamp: clock.tick(),
			target: node.id,
			observed: present.observedNodeAdds(node.id)
		});
	}

	for (const wanted of past.nodes.values()) {
		const current = present.nodes.get(wanted.id);
		const fields: NodeFields = {
			kind: wanted.kind,
			x: wanted.x,
			y: wanted.y,
			w: wanted.w,
			h: wanted.h,
			fill: wanted.fill,
			order: wanted.order,
			parent: wanted.parent
		};

		if (!current) {
			// Gone since: bring it back with the same id, so every edge that pointed
			// at it points at it again.
			ops.push({ kind: 'node.add', stamp: clock.tick(), id: wanted.id, fields });
			ops.push(...textOps(clock, wanted.id, '', wanted.label));
			continue;
		}`
			},
			{
				type: 'p',
				text: 'Written against the **reactive projections** rather than the CRDT internals, because what a person means by "restore" is "the picture I had", not "the merge history I had". And a node that has been deleted since comes back with the *same id*, so every edge that pointed at it points at it again.'
			},
			{
				type: 'code',
				file: 'src/lib/server/history.ts',
				lang: 'ts',
				code: `
/**
 * Replace a label wholesale.
 *
 * Deliberately not a character diff. A restore is a coarse action — "put it back
 * how it was" — and a minimal edit script would interleave with whatever
 * somebody is typing right now in a way nobody could predict. Deleting the
 * current text and inserting the old text is blunt, obvious, and produces the
 * result the button promises.
 */
function textOps(
	clock: Clock,
	target: string,
	from: string,
	to: string,
	present?: BoardDocument
): Operation[] {`
			},
			{
				type: 'note',
				text: 'Deliberately not a character diff. A restore is a coarse action — "put it back how it was" — and a minimal edit script would interleave with whatever somebody is typing *right now* in a way nobody could predict. Deleting the current text and inserting the old text is blunt, obvious, and produces the result the button promises.'
			},

			{ type: 'h3', id: 'the-commands', text: 'The remote functions' },
			{
				type: 'code',
				file: 'src/lib/remote/history.remote.ts',
				lang: 'ts',
				code: `
export const saveCheckpoint = form(
	v.object({ boardId, label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)) }),
	async ({ boardId: id, label }) => {
		const user = requireUser();
		await requireAccess(id, user.id, 'editor').catch(rethrow);

		await db.insert(checkpoint).values({
			id: crypto.randomUUID(),
			boardId: id,
			label,
			// The board's current sequence. Recorded rather than computed later,
			// because "the checkpoint I saved at 3pm" must not drift as the board does.
			seq: await watermarkOf(id),
			authorId: user.id
		});

		await revisions(id).refresh();
	}
);

/**
 * Put the board back the way it was, by writing the difference as new operations.
 *
 * The log is never rewound. A restore is an ordinary batch of edits that happens
 * to undo a lot at once, so it appears in the history, can itself be restored
 * past, and merges with whatever somebody else is doing at that moment.
 */
export const restoreTo = command(
	v.object({ boardId, seq: v.pipe(v.number(), v.integer(), v.minValue(0)) }),
	async ({ boardId: id, seq }) => {
		const user = requireUser();
		const access = await requireAccess(id, user.id, 'editor').catch(rethrow);

		const [present, past] = await Promise.all([documentAt(id, Infinity), documentAt(id, seq)]);

		const { actor, clock } = serverClock();
		const ops = diffToward(present, past, actor, clock);

		if (ops.length === 0) return { applied: 0 };

		await ingest({ boardId: id, userId: user.id, role: access.role, actor, ops });
		await revisions(id).refresh();

		return { applied: ops.length };
	}
);`
			},
			{
				type: 'p',
				text: 'A checkpoint records the board’s sequence **at the moment it is saved** rather than computing it later, because "the checkpoint I saved at 3pm" must not drift as the board does.'
			},
			{
				type: 'p',
				text: 'And the restore goes through `ingest` — the same function every client’s edits go through, with the same per-operation permission check and the same broadcast. That is what makes a restore arrive on everybody else’s screen as an ordinary batch of edits, live, while they are working.'
			},
			{
				type: 'terminal',
				code: `
[features] version history › restores a board to a checkpoint

  draw "Before"          → checkpoint "Just the one box"
  draw "After"           → two shapes
  restore                → "After" disappears, "Before" remains
  reload the page        → still one shape

  the restore is in the log, not in this tab's memory`
			},

			{
				type: 'checkpoint',
				items: [
					'A restore appears on a colleague’s screen as it happens.',
					'A restore survives a reload.',
					'A restore can itself be restored past.'
				]
			}
		]
	},

	{
		slug: 'export-in-a-worker',
		title: 'Export, off the main thread',
		summary:
			'SVG on the main thread because strings are cheap, PNG in a worker because rasterising is not — and the `new URL` form Vite needs.',
		goal: 'Produce a PNG of a large board without dropping a frame.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/export/index.ts',
				lang: 'ts',
				code: `
/**
 * Export a board as SVG or PNG.
 *
 * The SVG is produced on the main thread — it is string building, and it is
 * fast. The PNG goes to a worker, because rasterising is not.
 */`
			},
			{
				type: 'p',
				text: 'Six lines that make the whole decision. String building is fast; rasterising a large diagram is tens of milliseconds of decode and draw — and on the main thread that is several dropped frames at the exact moment somebody has pressed a button and is watching for a response.'
			},
			{
				type: 'code',
				file: 'src/lib/export/raster.worker.ts',
				lang: 'ts',
				code: `
/**
 * SVG TO PNG, OFF THE MAIN THREAD
 * ===============================
 *
 * Rasterising a large diagram is tens of milliseconds of decode and draw. On the
 * main thread that is several dropped frames at the exact moment somebody has
 * pressed a button and is watching for a response — the worst possible time to
 * be busy.
 *
 * \`OffscreenCanvas\` is what makes this possible at all: a \`<canvas>\` element
 * cannot exist in a worker, and without one there is nothing to draw into.
 *
 * The worker is deliberately tiny and knows nothing about boards. It takes a
 * string of SVG and gives back PNG bytes, which makes it testable by hand and
 * means a change to how a diagram looks never touches this file.
 */

export interface RasterRequest {
	readonly svg: string;
	readonly width: number;
	readonly height: number;
	/** Device pixel ratio, so an export looks right on a high-density screen. */
	readonly scale: number;
}

export interface RasterResponse {
	readonly ok: boolean;
	readonly blob?: Blob;
	readonly error?: string;
}`
			},
			{
				type: 'why',
				title: 'A worker that knows nothing about boards',
				text: 'It takes a string of SVG and gives back PNG bytes. That makes it testable by hand — paste any SVG in — and it means a change to how a diagram *looks* never touches this file. The temptation is to pass it the nodes and let it render, which couples the worker to the document model and turns every design change into a two-file change.'
			},
			{
				type: 'p',
				text: '`OffscreenCanvas` is what makes this possible at all: a `<canvas>` element cannot exist in a worker, and without one there is nothing to draw into. `createImageBitmap` is used rather than an `Image` with a data URL because `Image` does not exist in a worker either — and it decodes off the thread that called it, so even this work does not block the worker’s own message queue.'
			},

			{ type: 'h3', id: 'the-url-form', text: 'The `new URL` form' },
			{
				type: 'code',
				file: 'src/lib/export/index.ts',
				lang: 'ts',
				code: `
/*
 * \`new Worker(new URL(...), { type: 'module' })\`.
 *
 * The \`import.meta.url\` form is what Vite recognises: it bundles the worker as
 * a separate entry point and rewrites the URL. A bare string path works in dev
 * and produces a 404 in production, which is the most annoying category of
 * bug — it only exists in the artefact you ship.
 */
const worker = new Worker(new URL('./raster.worker.ts', import.meta.url), { type: 'module' });`
			},
			{
				type: 'warn',
				text: '`new Worker(new URL(\'./raster.worker.ts\', import.meta.url), { type: \'module\' })` is what Vite recognises: it bundles the worker as a separate entry point and rewrites the URL. A bare string path **works in dev and 404s in production**, which is the most annoying category of bug — it exists only in the artefact you ship.'
			},
			{
				type: 'code',
				file: 'src/lib/export/index.ts',
				lang: 'ts',
				code: `
	try {
		return await new Promise<Blob>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('The export timed out.')), TIMEOUT_MS);

			worker.onmessage = (event: MessageEvent<RasterResponse>) => {
				clearTimeout(timer);
				if (event.data.ok && event.data.blob) resolve(event.data.blob);
				else reject(new Error(event.data.error ?? 'The export failed.'));
			};

			worker.onerror = (event) => {
				clearTimeout(timer);
				reject(new Error(event.message || 'The export worker failed to start.'));
			};

			worker.postMessage({
				svg,
				width,
				height,
				scale: Math.min(options.scale ?? globalThis.devicePixelRatio ?? 1, 2)
			} satisfies RasterRequest);
		});
	} finally {
		// Always, including on the timeout path. A worker left running holds its
		// module graph and its OffscreenCanvas for the life of the tab.
		worker.terminate();
	}
}`
			},
			{
				type: 'p',
				text: 'A timeout, and a `finally` that terminates the worker on **every** path including the timeout — a worker left running holds its module graph and its `OffscreenCanvas` for the life of the tab. And the scale is capped at 2, so a 5K screen does not produce a file five times larger than anybody wanted.'
			},
			{
				type: 'note',
				text: 'The cross-origin isolation headers from chapter 34 are what make `SharedArrayBuffer` available to this worker. They are scoped to the application’s own pages rather than set globally, because `require-corp` also forbids loading any cross-origin resource that does not opt in — and the embed route deliberately renders inside other people’s sites.'
			},

			{
				type: 'checkpoint',
				items: [
					'Exporting a two-hundred-node board does not stutter the canvas.',
					'The worker loads in a production build, not only in dev.',
					'A failed export cleans up after itself.'
				]
			}
		]
	},

	{
		slug: 'the-custom-element',
		title: 'A board on somebody else’s page',
		summary:
			'`<svelte:options customElement>`, one file compiled differently from the other sixty, and a `svelte-check` warning that means "your element does not exist".',
		goal: 'Ship `<tessera-board board="…">` as a real custom element, with no framework on the host.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/embed/TesseraBoard.svelte',
				lang: 'svelte',
				code: `
<svelte:options
	customElement={{
		tag: 'tessera-board',
		/*
			An open shadow root.

			Closed would be tidier and would make the element impossible to style or
			inspect from the host page — which, for something people embed in a wiki
			we do not control, is the wrong trade. Open still isolates the styles; it
			just does not pretend the internals are secret.
		*/
		shadow: 'open',
		props: {
			board: { attribute: 'board', reflect: true },
			height: { attribute: 'height', type: 'Number' }
		}
	}}
/>`
			},
			{
				type: 'p',
				text: '`shadow: \'open\'` rather than closed. Closed would be tidier and would make the element impossible to style or inspect from the host page — which, for something people embed in a wiki we do not control, is the wrong trade. Open still isolates the styles; it just does not pretend the internals are secret.'
			},

			{ type: 'h3', id: 'compiling-one-file', text: 'Compiling one file differently' },
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `
	},

	/*
	 * ONE COMPONENT COMPILED AS A CUSTOM ELEMENT
	 * =========================================
	 *
	 * \`<svelte:options customElement>\` is what actually produces the element.
	 * In Svelte 5 the client compile emits
	 * \`customElements.define('tessera-board', …)\` from that tag whether or
	 * not \`customElement: true\` is set — identical output, byte for byte,
	 * either way. What the compile option changes is whether the compiler
	 * warns:
	 *
	 *     The \`customElement\` option is used when generating a custom
	 *     element. Did you forget the \`customElement: true\` compile option?
	 *
	 * That is a question worth answering rather than muting, because it is
	 * the compiler asking whether this file was *meant* to be an element.
	 * Setting the option here answers yes for this folder only; setting it
	 * globally would answer yes for every component in the application.
	 *
	 * \`dynamicCompileOptions\` is the seam that makes "this folder only"
	 * expressible: it is called per file, and — since vite-plugin-svelte
	 * 7.3.0 — per environment.
	 */
	dynamicCompileOptions({ filename, environment }) {
		/*
		 * \`environment\` as well as \`filename\`, since vite-plugin-svelte 7.3.0.
		 *
		 * BE HONEST ABOUT WHAT THIS LINE DOES: today, nothing to the output.
		 * The Svelte compiler already ignores \`customElement\` when generating
		 * for the server, and emits the element for the client either way,
		 * because \`<svelte:options customElement>\` is what actually drives it:
		 *
		 *   generate: 'server'  customElement: false → 5,209 bytes, no wrapper
		 *   generate: 'server'  customElement: true  → 5,209 bytes, no wrapper
		 *   generate: 'client'  customElement: false → 7,732 bytes, wrapper
		 *   generate: 'client'  customElement: true  → 7,732 bytes, wrapper
		 *
		 * What the option changes here is the *warning*, and what this guard
		 * changes is the claim. \`customElement: true\` says "compile this as a
		 * custom element", and a custom element is a browser thing — it
		 * registers with \`customElements.define\` and has no server-rendered
		 * form. Asking for one in the SSR pass is asking for something that
		 * cannot exist, and it worked only because the compiler quietly
		 * declined. That is a behaviour to depend on deliberately or not at
		 * all, and the second argument is what makes "not at all" expressible.
		 */
		if (environment.name !== 'client') return {};
		if (filename.split(/[/\\\\]/).includes('embed')) return { customElement: true };
		return {};
	}
}),`
			},
			{
				type: 'p',
				text: 'Measure before you believe a comment. `<svelte:options customElement>` is what **emits** the element: compile this component for the client with `customElement: false` and with `customElement: true` and you get the same 7,732 bytes, `customElements.define(\'tessera-board\', …)` included. Compile it for the server and you get the same 5,209 bytes, with no element either way. What the compile option changes is the *warning* — and a warning that asks "did you mean this?" is worth answering rather than muting. `dynamicCompileOptions` is what lets the answer be scoped: per file, and — since vite-plugin-svelte 7.3.0 — per environment.'
			},
			{
				type: 'code',
				file: 'src/lib/embed/TesseraBoard.svelte',
				lang: 'svelte',
				code: `
<!--
	A NOTE ON \`options_missing_custom_element\`
	=========================================

	The compile option *is* set — just not anywhere \`svelte-check\` looks.

	\`vite.config.ts\` turns \`customElement\` on for this folder only, through
	\`dynamicCompileOptions\`, so nothing else in the application is asked to
	compile as an element. \`svelte-check\` resolves compiler options for itself
	and does not run the Vite plugin, so it sees the options below with the flag
	apparently off and warns.

	What the warning does *not* mean is that the element is missing. The
	\`customElement\` attribute below is what emits it, and the client compile
	produces \`customElements.define('tessera-board', …)\` either way — identical
	output, byte for byte, with the option on or off. The warning is the compiler
	asking whether this file was meant to be an element; the answer is yes, and
	\`vite.config.ts\` is where it is given.

	A \`svelte-ignore\` comment does not help: the warning is attached to the
	\`customElement\` attribute inside \`<svelte:options>\`, which is analysed before
	the element tree the ignore would apply to. The supported answer is
	\`--compiler-warnings "options_missing_custom_element:ignore"\`, which the
	\`check\` script in \`package.json\` passes.
-->`
			},
			{
				type: 'warn',
				text: 'A `svelte-ignore` comment does not help here, because the warning attaches to the `customElement` attribute inside `<svelte:options>`, which is analysed before the element tree an ignore would apply to. The supported answer is the `--compiler-warnings "options_missing_custom_element:ignore"` flag, which the `check` script passes — and it is the right answer *only* because `vite.config.ts` has already set the option for the real build. Silencing a warning nothing else answers is how a project ends up with a compile flag it needs and does not have.'
			},

			{ type: 'h3', id: 'no-crdt', text: 'What the embed deliberately does not have' },
			{
				type: 'p',
				text: 'No CRDT, no sync engine, no IndexedDB, no session. It fetches one JSON document and renders SVG. That is a hard boundary, and it is what keeps the embed bundle small enough to justify existing.'
			},
			{
				type: 'code',
				file: 'src/routes/api/boards/[board]/snapshot/+server.ts',
				lang: 'ts',
				code: `
/**
 * THE CURRENT STATE OF A BOARD, AS ONE BLOB
 * =========================================
 *
 * The editor never asks for this: it takes the stored snapshot and replays the
 * operations itself, because it has to be able to do that anyway. The embed
 * cannot — it has no CRDT — so this endpoint does the replay on its behalf.
 *
 * That makes it the one place on the server that holds an opinion about a
 * document's contents, and it is confined to a read. It writes nothing back
 * except a compacted snapshot, which is a cache of what the log already says.
 */

import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { BoardDocument, emptySnapshot, parseSnapshot } from '#lib/board/index.ts';
import { newActorId } from '#lib/crdt/index.ts';
import { db } from '#lib/server/db/index.ts';
import { board } from '#lib/server/db/schema.ts';
import { since } from '#lib/server/ingest.ts';
import { AccessError, requireAccess } from '#lib/server/rbac.ts';

/**
 * Past this many operations, the rebuilt state is written back as the board's
 * snapshot so the next reader replays far fewer.
 *
 * Compaction happens here rather than in a scheduled job because this is the
 * only place that already pays for the replay — and a board nobody reads does
 * not need compacting.
 */`
			},
			{
				type: 'p',
				text: 'This endpoint is the one place on the server that holds an opinion about a document’s contents, and it is confined to a read. It writes nothing back except a compacted snapshot — which is a cache of what the log already says.'
			},
			{
				type: 'note',
				text: 'Compaction happens *here* rather than in a scheduled job, because this is the only place that already pays for the replay — and a board nobody reads does not need compacting. That is a nice example of putting maintenance work where the cost has already been incurred.'
			},

			{ type: 'h3', id: 'ssr', text: 'The host page, and one dynamic import' },
			{
				type: 'code',
				file: 'src/routes/embed/[board]/+page.svelte',
				lang: 'svelte',
				code: `
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	/**
	 * The embed host page.
	 *
	 * Its whole job is to define the custom element and put one on the page, so
	 * that \`<iframe src="/embed/…">\` works for hosts that cannot run a script, and
	 * so the element itself has somewhere to be exercised in the end-to-end tests.
	 *
	 * The import is dynamic and inside \`onMount\` for a reason: a Svelte custom
	 * element calls \`customElements.define\` at module scope, and \`customElements\`
	 * does not exist during server rendering. A static import crashes the SSR pass
	 * with \`customElements is not defined\`, which is a confusing error to get from
	 * a component you never rendered.
	 */
	let ready = $state(false);

	onMount(async () => {
		await import('#lib/embed/TesseraBoard.svelte');
		ready = true;
	});
</script>

<svelte:head>
	<title>Board embed</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if ready}
	<!--
		The element is used exactly as a host page would use it: an unknown tag with
		plain attributes. Svelte has no idea what this is, which is the point.
	-->
	<tessera-board board={page.params.board} height="420"></tessera-board>
{/if}`
			},
			{
				type: 'warn',
				text: 'The import is dynamic and inside `onMount` for a reason: a Svelte custom element calls `customElements.define` at **module scope**, and `customElements` does not exist during server rendering. A static import crashes the SSR pass with `customElements is not defined`, which is a confusing error to get from a component you never rendered.'
			},
			{
				type: 'p',
				text: 'And note how the element is used in the markup: an unknown tag with plain attributes. Svelte has no idea what it is, which is exactly the point — that is how a host page will use it.'
			},

			{
				type: 'checkpoint',
				items: [
					'`<tessera-board board="x">` renders a board on a page with no framework.',
					'Server rendering the host page does not crash.',
					'The embed route is not cross-origin isolated, so it can be embedded.'
				]
			}
		]
	},

	{
		slug: 'offline-and-accessible',
		title: 'Starting offline, and using it without a mouse',
		summary:
			'A service worker with one job, the three cache rules, `role="application"` and the obligation that comes with it.',
		goal: 'Open the application with no network, and do everything on the canvas from the keyboard.',
		blocks: [
			{
				type: 'code',
				file: 'src/service-worker.ts',
				lang: 'ts',
				code: `
/**
 * THE SERVICE WORKER
 * ==================
 *
 * Tessera already works offline: the document lives in IndexedDB and edits queue
 * in an outbox. What it *cannot* do without this file is start while offline —
 * the browser has no HTML, no JavaScript and no CSS to run any of that with.
 *
 * So this worker has exactly one job: make the application shell available with
 * no network. Everything about the *data* is somebody else's problem, and
 * deliberately so; a worker that also cached API responses would become a third
 * cache with its own idea of the truth, alongside IndexedDB and the server.
 *
 * THREE RULES
 * -----------
 *   \`immutable\`, \`assets\`  cache-first, forever. Vite's output carries a content
 *                          hash in the URL, so a changed file is a *different*
 *                          file and a cached one can never be stale.
 *   navigations            network first, shell from cache on failure. The other
 *                          order serves yesterday's HTML to somebody who is
 *                          online, which is the classic way a deployed fix
 *                          appears not to have deployed.
 *   everything else        straight to the network, never cached. That is the
 *                          rule that keeps the operation stream and the remote
 *                          functions out of here.
 *
 * WHERE THESE LISTS COME FROM
 * ---------------------------
 * SvelteKit 3 split the old \`$service-worker\` module apart: the build manifest
 * is \`$app/manifest\` (\`immutable\`, \`assets\`, \`prerendered\`, \`routes\`), the build
 * id is \`version\` from \`$app/env\`, and \`$app/service-worker\` now exports only a
 * correctly-typed \`self\`. Bringing the SvelteKit 2 import forward gives four
 * "has no exported member" errors at once, which at least says so plainly.
 */`
			},
			{
				type: 'p',
				text: 'Tessera already works offline — the document is in IndexedDB and edits queue in an outbox. What it cannot do without this file is **start** while offline: the browser has no HTML, no JavaScript and no CSS to run any of that with.'
			},
			{
				type: 'why',
				title: 'One job, and the discipline to keep it',
				text: 'A worker that also cached API responses would become a **third cache** with its own idea of the truth, alongside IndexedDB and the server. The three rules are what keep it out: hashed assets cache-first forever, navigations network-first, and everything else straight through. That last rule is what keeps the operation stream and the remote functions out of here entirely.'
			},
			{
				type: 'warn',
				text: 'SvelteKit 3 split the old `$service-worker` module apart. The build manifest is `$app/manifest` (`immutable`, `assets`, `prerendered`, `routes`), the build id is `version` from `$app/env`, and `$app/service-worker` now exports only a correctly-typed `self`. Bringing the SvelteKit 2 import forward gives four "has no exported member" errors at once, which at least says so plainly.'
			},
			{
				type: 'code',
				file: 'src/service-worker.ts',
				lang: 'ts',
				code: `
/*
 * \`version\` is unique per build, so a new deployment gets a new cache and the
 * old one is deleted on activate. Naming the cache anything stable is how a
 * service worker ends up serving an application from two releases ago with no
 * way to clear it short of asking people to open devtools.
 */
const CACHE = \`tessera-\${version}\`;

/**
 * Everything the shell needs, known at build time.
 *
 * \`immutable\` is Vite's hashed output; \`assets\` is whatever is in \`static/\`,
 * which for this application is the two font files. Both arrive as
 * \`{ path }\` objects rather than bare strings.
 */
const PRECACHE = [...immutable, ...assets].map((entry) => entry.path);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			// Activate immediately rather than waiting for every tab to close. The
			// alternative leaves somebody on an old shell for as long as they keep a
			// tab open, which for a tool people leave open all day is forever.
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => self.clients.claim())
	);
});`
			},
			{
				type: 'p',
				text: 'The cache is named after `version`, which is unique per build, so a new deployment gets a new cache and the old one is deleted on activate. Naming it anything stable is how a service worker ends up serving an application from two releases ago with no way to clear it short of asking people to open devtools.'
			},
			{
				type: 'code',
				file: 'src/service-worker.ts',
				lang: 'ts',
				code: `
async function respond(request: Request, url: URL): Promise<Response> {
	const cache = await caches.open(CACHE);

	// Hashed assets: cache first, and never revalidate.
	if (PRECACHE.includes(url.pathname)) {
		const hit = await cache.match(url.pathname);
		if (hit) return hit;
	}

	try {
		const response = await fetch(request);

		/*
		 * \`response.status === 200\` and nothing else.
		 *
		 * A redirect, a 206 range response or an opaque cross-origin response all
		 * break \`cache.put\` in ways that surface much later as a blank page. This
		 * is one of the few places where being conservative costs nothing.
		 */
		if (response.status === 200 && request.mode === 'navigate') {
			cache.put(request, response.clone());
		}

		return response;
	} catch (thrown) {
		const hit = await cache.match(request);
		if (hit) return hit;

		// A navigation with nothing cached: fall back to the root shell, which the
		// client router can take over from.
		if (request.mode === 'navigate') {
			const shell = await cache.match('/');
			if (shell) return shell;
		}

		throw thrown;`
			},
			{
				type: 'p',
				text: '`response.status === 200` and nothing else. A redirect, a 206 range response or an opaque cross-origin response all break `cache.put` in ways that surface much later as a blank page. This is one of the few places where being conservative costs nothing at all.'
			},

			{ type: 'h3', id: 'application-role', text: 'The strongest claim in ARIA' },
			{
				type: 'code',
				file: 'src/lib/components/Board.svelte',
				lang: 'svelte',
				code: `
<!--
	A11Y NOTE, and the two suppressions below
	=========================================

	\`role="application"\` tells a screen reader to stop interpreting keystrokes
	itself and pass them through, which is required for a canvas whose entire
	interface is keys. It is a strong claim, and the obligation that comes with it
	is to offer the same capabilities another way: \`Outline.svelte\` is that — a
	real tree of real buttons over the same document, where a screen reader's own
	navigation works normally.

	The two rules being suppressed are correct in general and wrong here. This
	element *is* the interactive control, and it has to be focusable for any of its
	shortcuts to reach it.

	Note the comma in the directive. In runes mode the compiler reads codes
	separated by commas and treats everything after the first gap as prose, so a
	space-separated list silently suppresses only the first warning. And the
	directive carries codes and nothing else: \`eslint-plugin-svelte\` reads every
	word after \`svelte-ignore\` as a code and reports each one it cannot match, so
	prose belongs in a comment of its own — this one.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	bind:this={surface}
	class="board"
	class:board--connecting={editor.tool === 'connect'}
	data-canvas
	role="application"
	aria-label={t.a11y.canvas}
	tabindex="0"
	{@attach attachViewport}
	{@attach attachPanZoom}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	ondblclick={onDoubleClick}
	onkeydown={onKeyDown}
	onpointerleave={() => announce(null)}
>
	<div class="board__grid" style={gridStyle} aria-hidden="true"></div>`
			},
			{
				type: 'why',
				title: 'What `role="application"` obliges you to do',
				text: 'It tells a screen reader to **stop interpreting keystrokes itself** and pass them through, which a canvas whose entire interface is keys genuinely needs. It is also the strongest claim in ARIA: you have taken away the navigation somebody relies on everywhere else. The obligation that comes with it is to offer the same capabilities another way — and if you cannot, you should not use the role.'
			},
			{
				type: 'code',
				file: 'src/lib/components/Outline.svelte',
				lang: 'svelte',
				code: `
/**
 * THE BOARD, AS A TREE
 * ====================
 *
 * This is not a summary of the canvas. It is the same document, rendered as
 * something a screen reader and a keyboard can already use, and every action
 * available here is available there.
 *
 * That is what makes \`role="application"\` on the canvas an honest claim rather
 * than an excuse. Declaring that role tells assistive technology to stop
 * interpreting keys and hand them over — which is only defensible if there is
 * a path through the same content where it does not have to.
 *
 * It is also genuinely useful with a mouse, which is the sign the design is
 * right: a list of every shape, grouped, that scrolls to and selects one.
 */
const roots = $derived(editor.ordered.filter((node) => node.parent === null));

function childrenOf(parent: NodeView): NodeView[] {
	return editor.ordered.filter((node) => node.parent === parent.id);
}

function focus(node: NodeView) {
	editor.selectOnly([node.id]);
	void editor.camera.centreOn({ x: node.x + node.w / 2, y: node.y + node.h / 2 });
}`
			},
			{
				type: 'p',
				text: 'The outline is not a summary of the canvas. It is the **same document**, rendered as a real tree of real buttons that a screen reader’s own navigation works on normally, and every action available there is available here. That is what makes the `application` role an honest claim rather than an excuse.'
			},
			{
				type: 'note',
				text: 'It is also genuinely useful with a mouse — a list of every shape, grouped, that scrolls to and selects one. That is usually the sign an accessibility design is right rather than bolted on: it makes the tool better for everybody.'
			},

			{ type: 'h3', id: 'svelte-ignore', text: 'Two suppressions, and a comma' },
			{
				type: 'warn',
				text: 'In runes mode the compiler reads `svelte-ignore` codes separated by **commas**, and treats everything after the first gap as prose — so a space-separated list silently suppresses only the first warning. And `eslint-plugin-svelte` reads every word after `svelte-ignore` as a code and reports each one it cannot match, so explanatory prose belongs in a comment of its own. Both of those are five-minute puzzles that look like tooling being broken.'
			},

			{
				type: 'checkpoint',
				items: [
					'Load the app, go offline, reload: it still opens.',
					'A deployed fix appears immediately rather than after closing every tab.',
					'You can add, name, select and move a shape without touching the mouse.'
				]
			}
		]
	}
];
