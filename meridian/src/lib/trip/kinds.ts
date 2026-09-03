import {
	BedIcon,
	ForkKnifeIcon,
	LightbulbIcon,
	MapPinIcon,
	TicketIcon,
	TrainIcon
} from 'phosphor-svelte';
import { m } from '#lib/paraglide/messages.js';
import type { StopKind } from '#lib/domain/schemas.ts';

/** One icon and one label per kind of stop, used by the list, the dialog and the map legend. */
export const KIND_ICONS: Record<StopKind, typeof MapPinIcon> = {
	place: MapPinIcon,
	lodging: BedIcon,
	food: ForkKnifeIcon,
	transport: TrainIcon,
	activity: TicketIcon,
	idea: LightbulbIcon
};

export const KIND_LABELS: Record<StopKind, () => string> = {
	place: m.stop_kind_place,
	lodging: m.stop_kind_lodging,
	food: m.stop_kind_food,
	transport: m.stop_kind_transport,
	activity: m.stop_kind_activity,
	idea: m.stop_kind_idea
};
