/**
 * An image imported with directives before `enhanced` — `hero.png?w=640;1280&enhanced`
 * — is the same `Picture` as a bare `?enhanced` import: a `srcset` per format and
 * the fallback `<img>`. `@sveltejs/enhanced-img` declares only the bare form
 * (`*?enhanced`), and a query with widths in it does not end that way, so this
 * file declares the other. The shape is the one `vite-imagetools` returns.
 */
declare module '*&enhanced' {
	const picture: {
		readonly sources: Readonly<Record<string, string>>;
		readonly img: { readonly src: string; readonly w: number; readonly h: number };
	};
	export default picture;
}
