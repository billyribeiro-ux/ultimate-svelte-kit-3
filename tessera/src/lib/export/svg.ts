/**
 * A BOARD AS SVG
 * ==============
 *
 * A pure function from the document's views to a string. No DOM, no camera, no
 * component — which is what lets it run identically in a worker, on the server,
 * and in a unit test.
 *
 * Serialising the *live* DOM would be easier and wrong twice over: the DOM only
 * contains the shapes the viewport has not culled, and it carries the editor's
 * selection outlines, guides and cursors. An export is of the document, not of
 * the screen.
 */

import { bounds, roundedPath, route, type EdgeView, type NodeView } from '#lib/board/index.ts';

/** The six fills as hues, matching `tokens.css`. Resolved here because an
 * exported file has no stylesheet to inherit from. */
const HUES: Record<string, number> = {
	slate: 220,
	indigo: 255,
	jade: 162,
	amber: 38,
	rose: 348,
	cyan: 194
};

export interface ExportOptions {
	/** Blank space around the diagram, in board units. */
	readonly padding?: number;
	readonly theme?: 'light' | 'dark';
}

/** XML-escape. Runs on every label, so it is a replace chain rather than a parser. */
function escape(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function toSvg(
	nodes: readonly NodeView[],
	edges: readonly EdgeView[],
	options: ExportOptions = {}
): string {
	const padding = options.padding ?? 48;
	const dark = options.theme === 'dark';

	const frame = bounds(nodes.map((node) => node.rect)) ?? { x: 0, y: 0, w: 320, h: 200 };
	const width = frame.w + padding * 2;
	const eight = frame.h + padding * 2;

	const byId = new Map(nodes.map((node) => [node.id, node]));

	const paths = edges
		.flatMap((edge) => {
			const from = byId.get(edge.from);
			const to = byId.get(edge.to);
			if (!from || !to) return [];
			const d = roundedPath(route(from.rect, to.rect, edge.fromPort, edge.toPort));
			const dash = edge.kind === 'async' ? ' stroke-dasharray="6 5"' : '';
			return [
				`<path d="${d}" fill="none" stroke="${dark ? '#5a6472' : '#a3acb8'}" stroke-width="1.5"${dash} marker-end="url(#arrow)" />`
			];
		})
		.join('\n\t\t');

	const shapes = nodes
		.map((node) => {
			const hue = HUES[node.fill] ?? 220;
			const fill = dark ? `hsl(${hue} 30% 20%)` : `hsl(${hue} 40% 92%)`;
			const stroke = dark ? `hsl(${hue} 40% 60%)` : `hsl(${hue} 40% 45%)`;
			const text = dark ? '#e3e8ee' : '#171d27';

			return [
				`<g>`,
				`\t<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`,
				`\t<text x="${node.x + node.w / 2}" y="${node.y + node.h / 2}" text-anchor="middle" dy="0.35em" font-size="13" fill="${text}">${escape(node.label)}</text>`,
				`</g>`
			].join('\n\t\t');
		})
		.join('\n\t\t');

	/*
	 * `font-family` is a stack of generics rather than the interface's own faces.
	 *
	 * An exported SVG is opened somewhere else — a wiki, a slide, a browser with
	 * no access to our fonts — and a missing family falls back unpredictably,
	 * changing every text width. Generic names render close to the original
	 * everywhere and identically nowhere, which is the better failure.
	 */
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${frame.x - padding} ${frame.y - padding} ${width} ${eight}" width="${width}" height="${eight}" font-family="ui-sans-serif, system-ui, sans-serif">
	<defs>
		<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
			<path d="M0 1 L9 5 L0 9 z" fill="${dark ? '#5a6472' : '#a3acb8'}" />
		</marker>
	</defs>
	<rect x="${frame.x - padding}" y="${frame.y - padding}" width="${width}" height="${eight}" fill="${dark ? '#08090b' : '#ffffff'}" />
	<g>
		${paths}
	</g>
	<g>
		${shapes}
	</g>
</svg>`;
}
