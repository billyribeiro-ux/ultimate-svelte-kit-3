<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { OrbitControls, Stars, interactivity } from '@threlte/extras';
	import { BackSide, BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
	import type { PerspectiveCamera } from 'three';
	import type { FeatureCollection, Geometry, Position } from 'geojson';
	import { arc, distance, interpolate, type LngLat } from '@meridian/waypoint/geo';

	/**
	 * THE SCENE
	 * =========
	 *
	 * Threlte is Svelte for three.js: `<T.Mesh>` is a `THREE.Mesh`, its
	 * attributes are the object's properties, and its children attach to it
	 * — a geometry and a material inside a mesh become that mesh's geometry
	 * and material. Nothing here is imperative except the two things that
	 * genuinely are: building vertex buffers and moving the camera per frame.
	 *
	 * What is on the globe:
	 *   - the sphere, and a faint back-facing shell for an atmosphere;
	 *   - every coastline as line segments, from the same TopoJSON the map
	 *     draws (so the two agree about where Portugal is);
	 *   - one great-circle arc per leg, lifted off the surface by an amount
	 *     that grows with the leg's length;
	 *   - a marker per stop, clickable through Threlte's `interactivity`.
	 *
	 * The flyover is a `useTask`: each frame, advance along the current leg
	 * by `delta / seconds`, put the camera above the interpolated point and
	 * look at the centre. `interpolate` is the geodesy library's great-circle
	 * interpolation, so the camera follows the line it draws.
	 */
	export interface GlobeStop {
		readonly id: string;
		readonly name: string;
		readonly lng: number;
		readonly lat: number;
	}

	interface Props {
		stops: readonly GlobeStop[];
		selected: string | null;
		world: FeatureCollection<Geometry>;
		flying: boolean;
		reduced: boolean;
		onselect: (id: string) => void;
		onlanded: () => void;
	}

	let { stops, selected, world, flying, reduced, onselect, onlanded }: Props = $props();

	interactivity();

	const RADIUS = 1;
	const FLIGHT_ALTITUDE = 2.3;

	/** Longitude and latitude to a point on the sphere. 0°E faces the default camera. */
	function toVector(point: LngLat, radius = RADIUS): Vector3 {
		const lat = (point.lat * Math.PI) / 180;
		const lng = (point.lng * Math.PI) / 180;
		return new Vector3(
			radius * Math.cos(lat) * Math.sin(lng),
			radius * Math.sin(lat),
			radius * Math.cos(lat) * Math.cos(lng)
		);
	}

	const asLngLat = ([lng = 0, lat = 0]: readonly number[]): LngLat => ({ lng, lat });

	/* Coastlines: every ring of every polygon becomes pairs of points. */
	const outlines = $derived.by(() => {
		const positions: number[] = [];
		const push = (ring: Position[]) => {
			for (let i = 0; i + 1 < ring.length; i += 1) {
				const a = ring[i];
				const b = ring[i + 1];
				if (!a || !b) continue;
				const va = toVector(asLngLat(a), RADIUS + 0.002);
				const vb = toVector(asLngLat(b), RADIUS + 0.002);
				positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
			}
		};
		for (const feature of world.features) {
			const geometry = feature.geometry;
			if (geometry.type === 'Polygon') geometry.coordinates.forEach(push);
			else if (geometry.type === 'MultiPolygon') {
				for (const polygon of geometry.coordinates) polygon.forEach(push);
			}
		}
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
		return geometry;
	});

	interface Leg {
		readonly a: GlobeStop;
		readonly b: GlobeStop;
		readonly seconds: number;
	}

	const legs: Leg[] = $derived(
		stops.slice(1).flatMap((b, i) => {
			const a = stops[i];
			if (!a) return [];
			// Fifteen hundred kilometres a second, between one and a half and four seconds.
			const seconds = Math.min(4, Math.max(1.5, distance(a, b) / 1_500_000));
			return [{ a, b, seconds }];
		})
	);

	/* One arc per leg, lifted off the surface in proportion to its length. */
	const arcs = $derived(
		legs.map(({ a, b }) => {
			const lift = Math.min(0.12, distance(a, b) / 40_000_000);
			const points = arc(a, b, 48).map((position, index, all) => {
				const t = index / (all.length - 1);
				return toVector(asLngLat(position), RADIUS + 0.004 + lift * Math.sin(Math.PI * t));
			});
			const geometry = new BufferGeometry().setFromPoints(points);
			return geometry;
		})
	);

	// Buffers are GPU memory; dispose the previous set when the legs change.
	$effect(() => {
		const current = [outlines, ...arcs];
		return () => current.forEach((geometry) => geometry.dispose());
	});

	const markers = $derived(stops.map((stop) => ({ stop, at: toVector(stop, RADIUS + 0.006) })));

	let camera = $state<PerspectiveCamera>();

	/* Flight state: plain variables, advanced by the task and never rendered. */
	let leg = 0;
	let progress = 0;

	$effect(() => {
		if (flying) {
			leg = 0;
			progress = 0;
		}
	});

	const selectedStop = $derived(stops.find((stop) => stop.id === selected) ?? null);
	const target = $derived(selectedStop ? toVector(selectedStop, FLIGHT_ALTITUDE) : null);

	/* Reduced motion: a change of selection is a cut, not an ease. */
	$effect(() => {
		if (!reduced || !camera || !target) return;
		camera.position.copy(target);
		camera.lookAt(0, 0, 0);
	});

	useTask((delta) => {
		if (!camera) return;

		if (flying) {
			const current = legs[leg];
			if (!current) {
				onlanded();
				return;
			}
			progress += delta / current.seconds;
			if (progress >= 1) {
				progress = 0;
				leg += 1;
				if (leg >= legs.length) {
					onlanded();
					return;
				}
			}
			const point = interpolate(current.a, current.b, Math.min(progress, 1));
			camera.position.copy(toVector(point, FLIGHT_ALTITUDE));
			camera.lookAt(0, 0, 0);
			return;
		}

		if (target && !reduced && camera.position.distanceTo(target) > 0.003) {
			// Frame-rate independent ease: cover 99.9% of the way per second.
			camera.position.lerp(target, 1 - Math.pow(0.001, delta));
			camera.lookAt(0, 0, 0);
		}
	});
</script>

<T.PerspectiveCamera
	makeDefault
	fov={42}
	position={[0, 0.7, 2.7]}
	bind:ref={camera}
	oncreate={(ref) => ref.lookAt(0, 0, 0)}
>
	<OrbitControls
		enabled={!flying}
		enablePan={false}
		enableDamping={false}
		minDistance={1.4}
		maxDistance={4}
		rotateSpeed={0.5}
	/>
</T.PerspectiveCamera>

<T.AmbientLight intensity={0.7} />
<T.DirectionalLight position={[3, 2, 4]} intensity={1.3} />

<Stars count={1200} depth={30} factor={2} speed={reduced ? 0 : 0.4} fade />

<!-- The globe -->
<T.Mesh>
	<T.SphereGeometry args={[RADIUS, 64, 64]} />
	<T.MeshStandardMaterial color="#10273f" roughness={0.9} metalness={0} />
</T.Mesh>

<!-- A faint atmosphere: a slightly larger shell drawn from the inside. -->
<T.Mesh scale={1.04}>
	<T.SphereGeometry args={[RADIUS, 48, 48]} />
	<T.MeshBasicMaterial color="#7fb8d8" transparent opacity={0.09} side={BackSide} />
</T.Mesh>

<!-- Coastlines -->
<T.LineSegments geometry={outlines}>
	<T.LineBasicMaterial color="#9cc4dc" transparent opacity={0.55} />
</T.LineSegments>

<!-- The route -->
{#each arcs as geometry, index (index)}
	<T.Line {geometry}>
		<T.LineBasicMaterial color="#f2a65a" linewidth={2} />
	</T.Line>
{/each}

<!-- The stops -->
{#each markers as { stop, at } (stop.id)}
	<T.Mesh
		position={[at.x, at.y, at.z]}
		scale={stop.id === selected ? 1.8 : 1}
		onclick={() => onselect(stop.id)}
	>
		<T.SphereGeometry args={[0.011, 16, 16]} />
		<T.MeshBasicMaterial color={stop.id === selected ? '#ffffff' : '#ff6b57'} />
	</T.Mesh>
{/each}
