/**
 * Chapters 1–6: foundations, for someone who has never written code.
 *
 * These exist so the rest of the course can assume nothing. They are not a
 * complete introduction to programming — they are exactly the parts you need to
 * understand the project we are about to build, explained properly rather than
 * hand-waved.
 */

export const part0 = [
	/* ============================================================ 01 */
	{
		slug: 'what-a-website-is',
		title: 'What a website actually is',
		summary:
			'Before any code: what happens between typing a web address and seeing a page, and which of the three languages does what.',
		goal: 'You will be able to explain what a browser, a server, HTML, CSS and JavaScript each do — and what we are going to build.',
		blocks: [
			{
				type: 'p',
				text: "This course assumes you have never written a line of code. That is genuinely fine. What it does assume is that you are willing to read carefully, because I am going to explain **why** things are done a certain way, not just what to type."
			},
			{
				type: 'p',
				text: "Everyone can copy code. The valuable skill — the one that separates a professional from someone who assembles tutorials — is knowing why one approach is correct and another quietly breaks in six months. That is what I am actually teaching."
			},
			{ type: 'h3', id: 'what-we-build', text: "What we're building" },
			{
				type: 'p',
				text: "**StrikeFlow** — a marketing website for a made-up company that sells real-time options trading data. Marketing pages only: no dashboard, no user accounts. The one thing it does is collect an email address in exchange for a free PDF guide."
			},
			{
				type: 'p',
				text: "It sounds small. By the end you will have built a design system, a search-engine optimisation layer, a live financial chart, a secure gated download, film-quality animation, and an automated test suite that drives a real browser."
			},
			{ type: 'h3', id: 'request', text: 'What happens when you visit a page' },
			{
				type: 'p',
				text: 'Type an address, press enter, and roughly this happens:'
			},
			{
				type: 'ol',
				items: [
					'**Your browser** — Chrome, Safari, Firefox — is a program on your machine. It looks up the address and asks a computer somewhere on the internet for a page.',
					'**A server** — just another computer, one that is always on and whose job is to answer requests — sends back a file of text.',
					'That text is **HTML**. It describes the content and structure of the page: this is a heading, this is a paragraph, this is a link.',
					'The HTML mentions other files it needs. The browser fetches those too: **CSS** (how it should look) and **JavaScript** (how it should behave).',
					'The browser reads all of it and paints pixels on your screen.'
				]
			},
			{
				type: 'note',
				text: 'A "server" is not a special kind of machine. It is a normal computer running a program that listens for requests and answers them. Your own laptop will be a server later in this course, when you run `pnpm run dev`.'
			},
			{ type: 'h3', id: 'three-languages', text: 'The three languages, and what each is for' },
			{
				type: 'p',
				text: 'Every website is built from three, and they have genuinely different jobs. Keeping them separate is one of the oldest and most useful ideas in web development.'
			},
			{
				type: 'ul',
				items: [
					'**HTML** — the *content and structure*. What things are. "This is the main heading." "This is a button." Think of it as the skeleton.',
					'**CSS** — the *presentation*. What things look like. Colours, sizes, spacing, layout. The skin and clothes.',
					'**JavaScript** — the *behaviour*. What happens when you interact. Click this and a menu opens. The muscles.'
				]
			},
			{
				type: 'why',
				title: 'Why separating them matters',
				text: 'You can redesign a site entirely by changing only CSS, without touching the content. A search engine or a screen reader can understand your page by reading only the HTML, ignoring how it looks. And if the JavaScript fails to load — which happens more often than you would think — a well-built page still shows its content. Mixing the three is how you end up with a site where changing a colour breaks a feature.'
			},
			{ type: 'h3', id: 'client-server', text: 'Client and server' },
			{
				type: 'p',
				text: 'You will see these two words constantly, and the distinction matters enormously for security.'
			},
			{
				type: 'ul',
				items: [
					'**Client-side** means code that runs in the visitor\'s browser, on their machine. They can read all of it. Right-click, "view source", and it is there.',
					'**Server-side** means code that runs on your computer before anything is sent. The visitor never sees it — they only see the result.'
				]
			},
			{
				type: 'warn',
				text: 'Anything on the client is public. Not "hard to find" — **public**. Passwords, API keys and database credentials must only ever exist on the server. This project has a whole mechanism (chapter 15) that makes the build *fail* if you accidentally use a secret in client code, because "just be careful" is not a security strategy.'
			},
			{ type: 'h3', id: 'framework', text: 'What a framework is, and why we use one' },
			{
				type: 'p',
				text: 'You could build this site with nothing but HTML, CSS and JavaScript files. People did for years. It becomes painful quickly: every page repeats the same header and footer, so changing a nav link means editing twelve files and missing one.'
			},
			{
				type: 'p',
				text: 'A **framework** is a set of tools and conventions that handle the repetitive parts. We use **SvelteKit**, which is built on **Svelte**.'
			},
			{
				type: 'ul',
				items: [
					'**Svelte** lets you build *components* — reusable pieces of interface. A button, a card, a header. Write it once, use it everywhere.',
					'**SvelteKit** adds everything around that: pages and URLs, fetching data, handling forms, and turning it all into a real website you can deploy.'
				]
			},
			{
				type: 'why',
				title: 'Why Svelte specifically',
				text: 'Most frameworks ship a runtime — a chunk of the framework itself — to the browser, and do their work while the page is running. Svelte is a *compiler*: it does its work on your machine ahead of time and outputs plain JavaScript. The result is less code sent to your visitor and a faster page. For a marketing site, where speed directly affects both search ranking and how many people bother to stay, that is the whole argument.'
			},
			{
				type: 'checkpoint',
				text: 'You can say in one sentence each what HTML, CSS and JavaScript do, and explain why a secret must never appear in client-side code.'
			}
		]
	},

	/* ============================================================ 02 */
	{
		slug: 'html-basics',
		title: 'HTML: the skeleton',
		summary:
			'Tags, attributes, nesting — and the reason professionals care so much about which tag you choose.',
		goal: 'You will read HTML comfortably and understand why semantic elements matter more than they appear to.',
		blocks: [
			{
				type: 'p',
				text: 'HTML is written as **tags**. A tag is a word in angle brackets. Most come in pairs, wrapping content:'
			},
			{
				type: 'code',
				lang: 'html',
				file: 'the basic shape',
				code: `<p>This is a paragraph.</p>`
			},
			{
				type: 'ul',
				items: [
					'`<p>` is the **opening tag** — it starts a paragraph.',
					'`</p>` is the **closing tag** — the slash means "end this". ',
					'Everything between them is the **content**.',
					'The whole thing together is an **element**.'
				]
			},
			{ type: 'h3', id: 'attributes', text: 'Attributes' },
			{
				type: 'p',
				text: 'Tags can carry extra information, written inside the opening tag as `name="value"`. These are **attributes**.'
			},
			{
				type: 'code',
				lang: 'html',
				file: 'attributes',
				code: `<a href="/pricing">See our pricing</a>

<img src="/logo.png" alt="StrikeFlow logo" width="120" height="40" />`
			},
			{
				type: 'ul',
				items: [
					'`href` on a link says where it goes.',
					'`src` on an image says which file to load.',
					'`alt` is a text description of the image, read aloud to blind users and shown if the image fails to load. **It is not optional.**',
					'`width` and `height` tell the browser how much space to reserve before the image arrives — without them the page jumps when it loads.'
				]
			},
			{
				type: 'note',
				text: 'Some tags have no content and so no closing tag — `<img>`, `<input>`, `<br>`. These are called *void elements*. You will often see them written with a trailing slash (`<img />`); in HTML that slash is ignored, but it is required in Svelte and JSX, so we write it consistently.'
			},
			{ type: 'h3', id: 'nesting', text: 'Nesting' },
			{
				type: 'p',
				text: 'Elements go inside other elements, forming a tree. Indentation shows the structure:'
			},
			{
				type: 'code',
				lang: 'html',
				file: 'nesting',
				code: `<section>
	<h2>Pricing</h2>
	<p>Three plans, all with a free trial.</p>
	<ul>
		<li>Starter</li>
		<li>Pro</li>
		<li>Desk</li>
	</ul>
</section>`
			},
			{
				type: 'warn',
				text: 'Elements must nest cleanly — close them in the reverse order you opened them. `<b><i>text</b></i>` is wrong; `<b><i>text</i></b>` is right. Browsers will guess at broken nesting and the guess is often not what you meant.'
			},
			{ type: 'h3', id: 'semantics', text: 'The part that separates amateurs from professionals' },
			{
				type: 'p',
				text: 'There is a tag called `<div>`. It means nothing at all — it is a generic box. You could build an entire website out of `<div>` elements and it would look identical to one built properly.'
			},
			{ type: 'p', text: 'Do not do that. Here is why it matters:' },
			{
				type: 'ul',
				items: [
					'**Screen readers** — software that reads pages aloud to blind users — navigate by structure. A user can jump between headings, or list every link on the page. `<div>` gives them nothing to navigate.',
					'**Search engines** read your structure to understand what the page is about. `<h1>` says "this is what this page is about" in a way no `<div>` ever will.',
					'**Keyboards.** A real `<button>` can be focused with Tab and activated with Enter or Space, automatically. A clickable `<div>` cannot, unless you rebuild all of that by hand — and almost nobody does it correctly.'
				]
			},
			{
				type: 'why',
				title: 'The one rule to take from this chapter',
				text: 'Choose the element that describes what the thing **is**, then make it look how you want with CSS. Never choose an element because of how it looks by default. If it navigates somewhere, it is an `<a>`. If it performs an action, it is a `<button>`. If it is a heading, it is an `<h1>`–`<h6>`.'
			},
			{ type: 'h3', id: 'elements-we-use', text: 'The elements this project uses' },
			{
				type: 'ul',
				items: [
					'`<html>`, `<head>`, `<body>` — the outermost structure. `<head>` holds information *about* the page (title, description); `<body>` holds what you see.',
					'`<header>`, `<nav>`, `<main>`, `<footer>`, `<section>`, `<article>`, `<aside>` — **landmarks**. They say which part of the page is which. Screen reader users jump between them.',
					'`<h1>` to `<h6>` — headings, in order of importance. Exactly one `<h1>` per page, and never skip a level.',
					'`<p>` paragraph, `<ul>`/`<ol>` unordered/ordered list, `<li>` list item.',
					'`<a>` link, `<button>` button, `<form>`, `<input>`, `<label>`, `<select>`.',
					'`<img>`, `<svg>` — images. `<figure>` and `<figcaption>` for an image plus its caption.',
					'`<dl>`, `<dt>`, `<dd>` — a description list: a term and its definition. We use it for statistics, where the label and the number genuinely are a pair.',
					'`<details>` and `<summary>` — a native expand/collapse. We build the entire FAQ from these, with no JavaScript at all.',
					'`<dialog>` — a native pop-up. We build the mobile menu from it and get focus handling free.',
					'`<time>` — a date, in a format machines can read.',
					'`<div>` and `<span>` — the meaningless ones. Use only when no meaningful element fits, purely for layout.'
				]
			},
			{
				type: 'note',
				text: 'That list is short on purpose. Roughly twenty elements build almost every website in existence. You do not need to memorise them — you will meet each one in context, and I will say what it does when we do.'
			},
			{
				type: 'checkpoint',
				text: 'You can explain the difference between a tag, an attribute and an element, and say why `<button>` is better than a clickable `<div>`.'
			}
		]
	},

	/* ============================================================ 03 */
	{
		slug: 'css-basics',
		title: 'CSS: the paint',
		summary:
			'Selectors, the box model, the cascade, and custom properties — the four ideas that explain almost everything CSS does.',
		goal: 'You will read CSS confidently and understand why our styling is organised the way it is.',
		blocks: [
			{
				type: 'p',
				text: 'CSS answers: which elements, and what should they look like? Every rule has the same shape.'
			},
			{
				type: 'code',
				lang: 'css',
				file: 'anatomy of a rule',
				code: `h1 {
	color: white;
	font-size: 3rem;
}`
			},
			{
				type: 'ul',
				items: [
					'`h1` is the **selector** — which elements this applies to.',
					'Everything in the braces is the **declaration block**.',
					'`color` is a **property**; `white` is its **value**. Each pair ends with a semicolon.'
				]
			},
			{ type: 'h3', id: 'selectors', text: 'Selectors' },
			{
				type: 'code',
				lang: 'css',
				file: 'the selectors we use',
				code: `h1            { }  /* every <h1> element */
.card         { }  /* every element with class="card" */
#main         { }  /* the element with id="main" — ids must be unique */
.card p       { }  /* every <p> anywhere inside a .card */
.card > p     { }  /* every <p> that is a DIRECT child of .card */
a:hover       { }  /* a link, while the mouse is over it */
input:focus   { }  /* an input, while it is selected */
.btn.is-large { }  /* an element with BOTH classes */`
			},
			{
				type: 'note',
				text: 'A **class** is a label you put on elements: `<div class="card">`. You can use the same class on as many elements as you like, and one element can have several. Classes are the workhorse of CSS.'
			},
			{ type: 'h3', id: 'box-model', text: 'The box model' },
			{
				type: 'p',
				text: 'Every element is a rectangle with four layers, from the inside out:'
			},
			{
				type: 'ul',
				items: [
					'**Content** — the text or image itself.',
					'**Padding** — space *inside* the box, between the content and the border. Background colour extends through it.',
					'**Border** — a line around the padding.',
					'**Margin** — space *outside* the box, pushing other elements away. Always transparent.'
				]
			},
			{
				type: 'why',
				title: 'Padding or margin?',
				text: 'Padding is space the element owns — it makes the element itself bigger. Margin is space between this element and its neighbours. If you want a button to feel roomier, that is padding. If you want two buttons further apart, that is margin.'
			},
			{
				type: 'code',
				lang: 'css',
				file: 'the one line every project needs',
				code: `*, *::before, *::after {
	box-sizing: border-box;
}`
			},
			{
				type: 'warn',
				text: 'By default, `width: 300px` means the *content* is 300px, and any padding and border are **added on top** — so your 300px box is actually 340px and your layout breaks. `border-box` makes width mean the whole box, which is what everyone assumes it means. It is not the default only for historical reasons. Put this in every project.'
			},
			{ type: 'h3', id: 'cascade', text: 'The cascade: which rule wins' },
			{
				type: 'p',
				text: 'CSS stands for *Cascading* Style Sheets. When two rules target the same element, the conflict is settled in this order:'
			},
			{
				type: 'ol',
				items: [
					'**Specificity.** A more specific selector wins. An id (`#main`) beats a class (`.card`), which beats an element (`p`).',
					'**Order.** If specificity ties, whichever comes later in the file wins.',
					'**`!important`.** Overrides everything. Almost always a sign something has gone wrong — you are fighting your own stylesheet.'
				]
			},
			{
				type: 'note',
				text: "This project writes `!important` exactly three times, all in one place: the reduced-motion kill-switch in `reset.css`, which must override every animation on the site no matter how specific the selector that set it — the one canonical legitimate use. If you reach for it anywhere else, the real problem is usually a selector that is more specific than it needs to be somewhere else."
			},
			{ type: 'h3', id: 'variables', text: 'Custom properties (CSS variables)' },
			{
				type: 'p',
				text: 'You can store a value and reuse it. This is the single most important CSS feature for keeping a large project coherent.'
			},
			{
				type: 'code',
				lang: 'css',
				file: 'defining and using',
				code: `:root {
	--brand-blue: #4f7dff;
	--space-4: 1rem;
}

.button {
	background-color: var(--brand-blue);
	padding: var(--space-4);
}`
			},
			{
				type: 'ul',
				items: [
					'A custom property must start with two dashes: `--name`.',
					'`:root` means the whole document — define them there and they are available everywhere.',
					'`var(--name)` reads the value back.'
				]
			},
			{
				type: 'why',
				title: 'Why this matters so much',
				text: 'Change `--brand-blue` in one place and every button, link and border using it updates. Without variables, changing a brand colour means find-and-replacing a hex code across fifty files, missing three, and creating a site where two blues are almost-but-not-quite the same. Chapter 12 builds our entire design system out of these.'
			},
			{ type: 'h3', id: 'units', text: 'Units' },
			{
				type: 'ul',
				items: [
					'`px` — pixels. Fixed. Fine for borders, bad for text.',
					'`rem` — relative to the browser\'s base font size (normally 16px, so `1rem` = 16px). **Use this for text and spacing.** If a user increases their default font size for readability, `rem` respects it and `px` ignores it.',
					'`em` — relative to the *current element\'s* font size. Useful for spacing that should scale with its own text.',
					'`%` — relative to the parent.',
					'`vw` / `vh` — 1% of the viewport width / height.',
					'`ch` — the width of a `0` character. `max-width: 70ch` caps a paragraph at about 70 characters, which is the readable range.'
				]
			},
			{
				type: 'warn',
				text: 'Use `rem` rather than `px` for font sizes. Setting text in `px` overrides a user\'s accessibility settings — for someone with low vision who has increased their default size, your site simply ignores them. It is also a WCAG failure.'
			},
			{ type: 'h3', id: 'layout', text: 'Flexbox and Grid, briefly' },
			{
				type: 'p',
				text: 'Two layout systems. You will use both, and the rule of thumb is simple.'
			},
			{
				type: 'code',
				lang: 'css',
				file: 'flexbox — one dimension',
				code: `.row {
	display: flex;
	align-items: center;      /* vertical alignment */
	justify-content: space-between;  /* horizontal distribution */
	gap: 1rem;                /* space between children */
}`
			},
			{
				type: 'code',
				lang: 'css',
				file: 'grid — two dimensions',
				code: `.cards {
	display: grid;
	grid-template-columns: repeat(3, 1fr);  /* three equal columns */
	gap: 1.5rem;
}`
			},
			{
				type: 'note',
				text: '**Flexbox** for a row or a column — one direction. **Grid** when you need rows *and* columns. `gap` works in both and is far better than putting margins on children, because it never leaves a stray margin on the last item.'
			},
			{
				type: 'checkpoint',
				text: 'You can explain padding vs margin, why `box-sizing: border-box` matters, and what `var(--something)` does.'
			}
		]
	},

	/* ============================================================ 04 */
	{
		slug: 'javascript-basics',
		title: 'JavaScript: the behaviour',
		summary:
			'Variables, functions, arrays, objects and async — exactly the parts of the language this project uses, and nothing else.',
		goal: 'You will read the JavaScript in this project and understand what each line is doing.',
		blocks: [
			{
				type: 'p',
				text: 'This is not a complete JavaScript course. It is the subset we actually use, explained properly. If you have programmed in any other language, skim it — the ideas will be familiar and only the syntax is new.'
			},
			{ type: 'h3', id: 'variables', text: 'Variables' },
			{
				type: 'code',
				lang: 'js',
				file: 'storing values',
				code: `const name = 'StrikeFlow';   // cannot be reassigned
let count = 0;                // can be reassigned
count = count + 1;            // fine

// name = 'Something else';   // ERROR — const cannot be reassigned`
			},
			{
				type: 'why',
				title: 'Default to const',
				text: 'Use `const` unless you have a specific reason to reassign. It is not about performance — it is about reading. When you see `const`, you know that value never changes anywhere below, which is one less thing to hold in your head. Reach for `let` only when you genuinely reassign. (You may see `var` in old code. It has confusing scoping rules. Never use it.)'
			},
			{ type: 'h3', id: 'types', text: 'The types we use' },
			{
				type: 'code',
				lang: 'js',
				file: 'types',
				code: `const text = 'hello';          // string  — text, in quotes
const number = 42;             // number  — no separate integer/decimal type
const yes = true;              // boolean — true or false
const nothing = null;          // deliberately empty
let notSet;                    // undefined — never assigned

const list = ['a', 'b', 'c'];  // array  — an ordered list
const thing = {                // object — named values
	name: 'Pro',
	price: 149
};`
			},
			{
				type: 'note',
				text: '`null` and `undefined` both mean "no value", and the distinction is real: `undefined` means nobody ever set it; `null` means someone deliberately set it to nothing. In practice, use `null` when *you* mean "empty", and treat `undefined` as "missing".'
			},
			{ type: 'h3', id: 'strings', text: 'Template literals' },
			{
				type: 'code',
				lang: 'js',
				file: 'building strings',
				code: `const plan = 'Pro';
const price = 149;

// Backticks, not quotes. \${...} inserts a value.
const message = \`The \${plan} plan costs $\${price} per month.\`;
// "The Pro plan costs $149 per month."`
			},
			{
				type: 'warn',
				text: 'Those are **backticks** (the key above Tab on most keyboards), not apostrophes. A template literal can also span multiple lines, which normal quotes cannot. Watch out for stray backticks inside one — that ends the string early, and we hit exactly that bug when building the PDF (chapter 29).'
			},
			{ type: 'h3', id: 'functions', text: 'Functions' },
			{
				type: 'p',
				text: 'A function is a named piece of work you can run whenever you want, optionally giving it inputs and getting something back.'
			},
			{
				type: 'code',
				lang: 'js',
				file: 'declaring and calling',
				code: `function addTax(amount) {
	return amount * 1.2;
}

const total = addTax(100);   // 120`
			},
			{
				type: 'ul',
				items: [
					'`addTax` is the **name**.',
					'`amount` is a **parameter** — a placeholder for the value you pass in.',
					'`return` sends a value back. Without it, a function returns `undefined`.',
					'`addTax(100)` **calls** it. `100` is the **argument** — the actual value.'
				]
			},
			{
				type: 'code',
				lang: 'js',
				file: 'arrow functions',
				code: `// The same thing, written as an arrow function
const addTax = (amount) => {
	return amount * 1.2;
};

// One expression? Drop the braces and the return.
const addTax = (amount) => amount * 1.2;`
			},
			{
				type: 'note',
				text: 'Arrow functions are extremely common in modern JavaScript, particularly when passing a function to another function. Both forms are correct; we use whichever reads better.'
			},
			{ type: 'h3', id: 'arrays', text: 'Working with arrays' },
			{
				type: 'p',
				text: 'Three array methods do most of the work in this project. All three take a function and apply it to each item.'
			},
			{
				type: 'code',
				lang: 'js',
				file: 'map, filter, find',
				code: `const plans = [
	{ name: 'Starter', price: 49 },
	{ name: 'Pro', price: 149 },
	{ name: 'Desk', price: 499 }
];

// map — transform every item into something else. Same length out.
const names = plans.map((plan) => plan.name);
// ['Starter', 'Pro', 'Desk']

// filter — keep only the items that pass a test. Same or fewer.
const affordable = plans.filter((plan) => plan.price < 200);
// [{ name: 'Starter', ... }, { name: 'Pro', ... }]

// find — the FIRST item that passes, or undefined if none do.
const pro = plans.find((plan) => plan.name === 'Pro');
// { name: 'Pro', price: 149 }`
			},
			{
				type: 'note',
				text: '`===` compares two values and is what you should always use. There is also `==`, which converts types before comparing and produces genuinely surprising results (`"1" == 1` is true). Never use `==`.'
			},
			{ type: 'h3', id: 'objects', text: 'Objects, destructuring and spread' },
			{
				type: 'code',
				lang: 'js',
				file: 'reading values out',
				code: `const plan = { name: 'Pro', price: 149, featured: true };

// The long way
const name = plan.name;

// Destructuring — pull several out at once
const { name, price } = plan;

// With a default, used when the property is missing
const { currency = 'USD' } = plan;`
			},
			{
				type: 'code',
				lang: 'js',
				file: 'spread',
				code: `// ... copies everything from one object into a new one
const discounted = { ...plan, price: 99 };
// { name: 'Pro', price: 99, featured: true }

// Also works on arrays
const more = [...plans, { name: 'Enterprise', price: 999 }];`
			},
			{
				type: 'why',
				title: 'Why copy instead of change',
				text: 'Creating a new object rather than modifying the original means nothing else that holds a reference to it is surprised by the change. Accidental shared mutation is one of the most common sources of "why did that value change?" bugs, and copying costs nothing at this scale.'
			},
			{ type: 'h3', id: 'optional', text: 'Two operators worth knowing by name' },
			{
				type: 'code',
				lang: 'js',
				file: '?. and ??',
				code: `// Optional chaining — stop safely if something is missing
const city = user?.address?.city;
// undefined if user or address is missing, instead of crashing

// Nullish coalescing — a fallback for null/undefined only
const label = plan.label ?? 'Untitled';`
			},
			{
				type: 'warn',
				text: 'Use `??` rather than `||` for defaults. `||` treats `0` and `""` as missing, so `count || 10` gives you 10 when count is legitimately zero. `??` only falls back for `null` and `undefined`. This distinction causes real bugs.'
			},
			{ type: 'h3', id: 'async', text: 'Asynchronous code' },
			{
				type: 'p',
				text: 'Some things take time — fetching a file, reading a database. JavaScript does not sit and wait; it carries on and deals with the result when it arrives.'
			},
			{
				type: 'code',
				lang: 'js',
				file: 'async / await',
				code: `async function loadPosts() {
	const response = await fetch('/api/posts');
	const posts = await response.json();
	return posts;
}`
			},
			{
				type: 'ul',
				items: [
					'`async` marks a function as one that does slow work.',
					'`await` means "pause here until this finishes, then carry on". It can only be used inside an `async` function.',
					'A function marked `async` always returns a **Promise** — an object representing "a value that will exist later".'
				]
			},
			{
				type: 'note',
				text: 'Svelte 5 lets you use `await` directly inside a component, which is unusual and very convenient. We use it for the chart and the data fetching.'
			},
			{ type: 'h3', id: 'modules', text: 'Modules: import and export' },
			{
				type: 'code',
				lang: 'js',
				file: 'sharing code between files',
				code: `// ---- src/lib/data/plans.js ----
export const plans = [ /* ... */ ];
export function cheapest() { /* ... */ }

// ---- somewhere else ----
import { plans, cheapest } from '#lib/data/plans.js';`
			},
			{
				type: 'note',
				text: 'A file can also have one `export default`, imported without braces. We avoid default exports for anything but components, because a named export cannot be silently renamed by whoever imports it — which makes the code searchable.'
			},
			{
				type: 'checkpoint',
				text: 'You can read a function, explain what `.map()` does, and say why `??` is safer than `||` for defaults.'
			}
		]
	},

	/* ============================================================ 05 */
	{
		slug: 'terminal-node-packages',
		title: 'The terminal, Node and packages',
		summary:
			'The command line, what Node.js is, and what actually happens when you install a package.',
		goal: 'You will be comfortable running commands, and understand what `pnpm install` does to your project.',
		blocks: [
			{ type: 'h3', id: 'terminal', text: 'The terminal' },
			{
				type: 'p',
				text: 'A text interface to your computer. You type a command, press enter, it runs. It looks intimidating and is genuinely simpler than it looks — you will use about six commands in this entire course.'
			},
			{
				type: 'ul',
				items: [
					'**macOS** — Terminal (in Applications → Utilities), or iTerm2.',
					'**Windows** — Windows Terminal, or the terminal built into VS Code.',
					'**Linux** — you already know.'
				]
			},
			{
				type: 'terminal',
				code: `pwd              # print working directory — where am I?
ls               # list files here  (dir on Windows cmd)
cd my-folder     # change directory — go into a folder
cd ..            # go up one level
mkdir new-thing  # make a directory`
			},
			{
				type: 'note',
				text: 'Anything after `#` is a comment for your benefit, not part of the command. When you see a terminal block in this course, type the command without the comment.'
			},
			{ type: 'h3', id: 'node', text: 'Node.js' },
			{
				type: 'p',
				text: 'JavaScript was invented to run inside browsers. **Node.js** is a program that runs JavaScript *outside* a browser, directly on your machine.'
			},
			{
				type: 'p',
				text: 'That is what makes everything else possible: your build tools, your test runner and your development server are all JavaScript programs run by Node.'
			},
			{
				type: 'terminal',
				code: `node -v
# v24.20.0  — this project requires 24.20.0 or higher`
			},
			{
				type: 'warn',
				text: 'SvelteKit 3 itself runs on Node 22.17 or newer, but this project sets its floor at the current LTS — its `package.json` declares `"engines": { "node": ">=24.20.0" }`. If yours is older, get the LTS from [nodejs.org](https://nodejs.org). "LTS" means Long Term Support — the stable version, which is what you want.'
			},
			{ type: 'h3', id: 'packages', text: 'Packages and the package manager' },
			{
				type: 'p',
				text: 'A **package** is code somebody else wrote and published for you to use. Rather than writing your own animation engine, you install GSAP. Rather than your own charting library, you install Lightweight Charts.'
			},
			{
				type: 'p',
				text: 'A **package manager** downloads them and keeps track of versions. We use **pnpm**.'
			},
			{ type: 'terminal', code: `npm install -g pnpm\npnpm -v` },
			{
				type: 'why',
				title: 'Why pnpm rather than npm',
				text: 'npm gives every project its own full copy of every package — on a machine with ten projects you have ten copies of the same library on disk. pnpm stores one copy globally and links to it, which is faster and dramatically smaller. It is also stricter: it only lets you import packages you actually declared, which catches a real class of bug where your code works locally by accident and breaks in production. Everything here works with npm too — just translate `pnpm run x` to `npm run x`.'
			},
			{ type: 'h3', id: 'package-json', text: 'package.json' },
			{
				type: 'p',
				text: "Every project has one. It is the project's identity card and instruction manual."
			},
			{
				type: 'code',
				lang: 'json',
				file: 'package.json',
				code: `{
	"name": "strikeflow-site",
	"type": "module",
	"scripts": {
		"dev": "vite dev",
		"build": "vite build"
	},
	"dependencies": {
		"gsap": "^3.15.0"
	},
	"devDependencies": {
		"vite": "^8.2.2"
	}
}`
			},
			{
				type: 'ul',
				items: [
					'`scripts` — named shortcuts. `pnpm run dev` runs whatever `dev` says. This is how you avoid memorising long commands.',
					'`dependencies` — packages your *running site* needs.',
					'`devDependencies` — packages only needed while *building and testing*. They are not shipped to visitors.',
					'`"type": "module"` — use modern `import`/`export` syntax rather than the older `require()`.'
				]
			},
			{ type: 'h3', id: 'versions', text: 'Version numbers' },
			{
				type: 'p',
				text: 'Packages use **semantic versioning**: `MAJOR.MINOR.PATCH`, for example `3.15.0`.'
			},
			{
				type: 'ul',
				items: [
					'**PATCH** (3.15.**0** → 3.15.1) — a bug fix. Safe.',
					'**MINOR** (3.**15** → 3.16) — a new feature, nothing broken. Safe.',
					'**MAJOR** (**3** → 4) — something changed that will break your code. Read the migration guide.'
				]
			},
			{
				type: 'note',
				text: 'The `^` in `^3.15.0` means "3.15.0 or newer, but stay below 4.0.0" — accept fixes and features, never a breaking change. That is why the lockfile matters: `pnpm-lock.yaml` records the *exact* versions installed, so every machine and your production server get byte-identical code. **Always commit the lockfile.**'
			},
			{ type: 'h3', id: 'node-modules', text: 'node_modules' },
			{
				type: 'p',
				text: '`pnpm install` reads `package.json` and downloads everything into a folder called `node_modules`. It gets large — often hundreds of megabytes.'
			},
			{
				type: 'warn',
				text: '**Never commit `node_modules` to version control.** It is generated, it is enormous, and anyone can recreate it exactly from `package.json` plus the lockfile by running `pnpm install`. Every project template puts it in `.gitignore` for this reason. If you ever see a repository with `node_modules` committed, that is a red flag.'
			},
			{
				type: 'checkpoint',
				text: '`node -v` shows 24.20.0+, `pnpm -v` shows 10+, and you can explain what the `^` in a version number means.'
			}
		]
	},

	/* ============================================================ 06 */
	{
		slug: 'vite-build-tools',
		title: 'Vite: what a build tool is for',
		summary:
			'Why modern sites need a build step at all, what Vite does in development versus production, and how to read its config.',
		goal: 'You will understand what happens between saving a file and seeing it in the browser.',
		blocks: [
			{
				type: 'p',
				text: 'The code you write is not the code the browser runs. Something sits in between, transforming one into the other. That something is **Vite**, and understanding it removes most of the mystery from modern web development.'
			},
			{ type: 'h3', id: 'why', text: 'Why a build step exists at all' },
			{
				type: 'p',
				text: 'Browsers understand HTML, CSS and JavaScript. They do not understand:'
			},
			{
				type: 'ul',
				items: [
					'**Svelte components** (`.svelte` files) — these must be compiled into JavaScript.',
					'**TypeScript** (`.ts`) — the type annotations have to be stripped out.',
					'**Importing CSS from JavaScript** — `import "./styles.css"` is not a thing a browser does.',
					'**Package imports** — `import { gsap } from "gsap"` means nothing to a browser; it needs a real file path.'
				]
			},
			{
				type: 'p',
				text: 'A build tool resolves all of that. It also does things that are merely *desirable*: bundling many files into few, removing code nobody uses, minifying, and adding a content hash to filenames so browsers cache aggressively but still get updates instantly.'
			},
			{ type: 'h3', id: 'dev-vs-prod', text: 'Vite works completely differently in dev and production' },
			{
				type: 'p',
				text: 'This surprises people, and it is the key insight about Vite.'
			},
			{
				type: 'why',
				title: 'In development: almost no bundling at all',
				text: 'Older tools rebuilt your entire project on every keystroke — a wait that grew with your codebase. Vite instead serves your files nearly as-is over native browser module support, transforming only the single file you just changed. Start-up is near-instant and stays that way at any project size. This is the reason Vite took over.'
			},
			{
				type: 'why',
				title: 'In production: bundled aggressively',
				text: 'Serving hundreds of separate files to a real visitor would mean hundreds of network requests. So `vite build` bundles, tree-shakes (removes unused code), minifies, and splits the result into chunks that can be cached independently. Different job, different tool path, same config.'
			},
			{
				type: 'note',
				text: 'This is why "it works in dev but breaks in the build" happens. The two paths are genuinely different. Always run `pnpm run build` before you believe something works.'
			},
			{ type: 'h3', id: 'hmr', text: 'Hot Module Replacement' },
			{
				type: 'p',
				text: 'Save a file and the browser updates without reloading the page. Crucially, **state is preserved** — a menu you opened stays open, a form you half-filled keeps its text.'
			},
			{
				type: 'p',
				text: 'That matters more than it sounds. Without it, testing the fifth step of a form means redoing the first four after every change.'
			},
			{ type: 'h3', id: 'config', text: 'Reading vite.config.ts' },
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `import { defineConfig } from 'vitest/config';
// …
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { sveltePhosphorOptimize } from 'phosphor-svelte/vite';

// …
export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// …
				experimental: { async: true }
			},

			adapter: adapter(),

			experimental: {
				// …
				remoteFunctions: true
			},

			// …
		}),

		// …
		sveltePhosphorOptimize()
	],

	// …
});`
			},
			{
				type: 'ul',
				items: [
					'`defineConfig` is a helper that does nothing at runtime — it exists purely so your editor can autocomplete the options.',
					'`plugins` is an array of things that transform your code. **Order matters** — they run in sequence.',
					'`sveltekit()` is the big one: it compiles `.svelte` files, sets up routing, and handles the server build. In SvelteKit 3, *all* framework configuration lives inside this call.'
				]
			},
			{
				type: 'warn',
				text: 'Plugin order is a real source of bugs. `sveltePhosphorOptimize()` **must** come after `sveltekit()`, because it parses its input as JavaScript. Put it first and it receives raw `.svelte` files — markup and all — and dies on the first `<h1>` with "Unexpected JSX expression". We hit exactly this while building the project.'
			},
			{ type: 'h3', id: 'imports', text: 'What Vite lets you import' },
			{
				type: 'code',
				lang: 'ts',
				file: 'non-standard imports Vite makes work',
				code: `import '#lib/styles/app.css';        // CSS — injected into the page
import favicon from '#lib/assets/favicon.svg';  // a URL to the file
import Button from './Button.svelte';           // a compiled component

// Dynamic import — loaded only when this line runs, and split into
// its own file so the initial page load never downloads it.
const { gsap } = await import('gsap');`
			},
			{
				type: 'why',
				title: 'That last one is a performance tool, not just syntax',
				text: 'A normal `import` at the top of a file means the code is part of your main bundle and every visitor downloads it. `await import(...)` tells Vite to split it into a separate file fetched only when needed. We use it for GSAP (~90kB) and the charting library (~48kB) — together nearly 140kB that the initial page load never touches.'
			},
			{ type: 'h3', id: 'commands', text: 'The three commands' },
			{
				type: 'terminal',
				code: `pnpm run dev      # dev server with hot reloading, on localhost:5173
pnpm run build    # production build into .svelte-kit/ and build/
pnpm run preview  # serve the production build locally, on localhost:4173`
			},
			{
				type: 'note',
				text: '`preview` is the one people skip and should not. It serves the *real* build, so it is the only way to catch problems that exist only in production — which, as above, is a genuine category.'
			},
			{
				type: 'checkpoint',
				text: 'You can explain why a build step is necessary, how dev and production differ, and what `await import()` buys you.'
			}
		]
	}
];
