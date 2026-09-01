/**
 * The CRDT layer.
 *
 * Five small, independent structures and nothing that knows what a diagram is.
 * Everything here is pure: no Svelte, no storage, no network, no clock beyond
 * the one it is handed. That is what makes `crdt.spec.ts` able to run ten
 * thousand random histories in a second, and what makes the convergence proof
 * mean anything.
 *
 * The board built on top lives in `../board/`.
 */

export {
	Clock,
	ClockDriftError,
	MAX_DRIFT_MS,
	actorOf,
	compare,
	decode,
	encode,
	max,
	newActorId,
	wallOf,
	type ActorId,
	type Hlc,
	type Stamp
} from './clock';

export {
	dominates,
	empty as emptyVersion,
	equal as equalVersion,
	fromJSON as versionFromJSON,
	has as versionHas,
	merge as mergeVersion,
	observe as observeVersion,
	toJSON as versionToJSON,
	unseen,
	type EncodedVersion,
	type VersionVector
} from './version';

export { mergeRegister, register, write, type Lww } from './register';
export { OrSet, type ElementHistory } from './orset';
export { RgaText, type RgaItem, type RgaSnapshot } from './rga';
export { MIDDLE, between, betweenMany, compareOrder, isOrderKey, type OrderKey } from './fracdex';
