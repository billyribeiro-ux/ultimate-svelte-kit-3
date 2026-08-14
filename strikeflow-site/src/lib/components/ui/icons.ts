/**
 * ICON REGISTRY
 *
 * Our data files store icons as strings (`icon: 'PulseIcon'`) rather than as imported
 * components, because a `.ts` data file shouldn't be importing `.svelte` files — that
 * couples pure data to the view layer and makes the data untestable in plain Node.
 *
 * This module is the bridge: a lookup table from those strings to real components.
 *
 * In Svelte 5 you render a component held in a variable by just using it as a tag —
 * `<Icon />`. The old `<svelte:component this={Icon} />` is legacy and unnecessary.
 *
 * Importing by name from 'phosphor-svelte' looks like it pulls the whole library, but
 * `sveltePhosphorOptimize()` in `vite.config.ts` rewrites these into per-icon deep
 * imports before Vite resolves them. Readable source, minimal bundle.
 */

import {
	PulseIcon,
	CrosshairIcon,
	FunctionIcon,
	EyeIcon,
	BellRingingIcon,
	RewindIcon
} from 'phosphor-svelte';
import type { Component } from 'svelte';
import type { IconName } from '#lib/data/features.ts';

/**
 * Typed as a full Record keyed by `IconName`.
 *
 * That's the important bit: add a new icon name to the `IconName` union in
 * `features.ts` and forget to register it here, and TypeScript fails the build.
 * The alternative — a plain object and a runtime lookup — fails silently with an
 * invisible icon in production.
 */
export const featureIcons: Record<IconName, Component<Record<string, unknown>>> = {
	PulseIcon,
	CrosshairIcon,
	FunctionIcon,
	EyeIcon,
	BellRingingIcon,
	RewindIcon
} as Record<IconName, Component<Record<string, unknown>>>;
