import type { Messages } from './en';

/**
 * Japanese.
 *
 * The catalogue that justifies making every pluralised message a function.
 * Japanese has no grammatical plural, so `count === 1 ? … : …` would produce two
 * identical strings — and a library-based `{count, plural, one{…} other{…}}`
 * would force a distinction the language does not make. Here the function simply
 * ignores the branch, which is the correct translation.
 *
 * There is also no word spacing, so anything relying on `word-break` to wrap has
 * to be checked against this catalogue rather than the French one.
 */
export const ja = {
	app: {
		name: 'Tessera',
		tagline: '常に同期する図'
	},

	nav: {
		boards: 'ボード',
		signIn: 'ログイン',
		signOut: 'ログアウト',
		language: '言語'
	},

	board: {
		untitled: '無題のボード',
		create: '新しいボード',
		open: '開く',
		empty: 'まだ何もありません。N キーで最初のボックスを追加します。',
		nodes: (count: number) => `${count} 個の図形`,
		lastEdited: (when: string) => `${when}に編集`
	},

	sync: {
		live: 'すべての変更を保存しました',
		offline: 'オフライン — 作業はこの端末に保存されています',
		connecting: '再接続しています…',
		pending: (count: number) => `${count} 件の変更が待機中`,
		refused: 'サーバーが変更を拒否しました。再読み込みして最新のボードを表示してください。'
	},

	presence: {
		alone: 'あなただけ',
		others: (count: number) => `他 ${count} 人`,
		follow: (name: string) => `${name}をフォロー`,
		stopFollowing: 'フォローをやめる'
	},

	tools: {
		select: '選択',
		service: 'サービス',
		datastore: 'データストア',
		queue: 'キュー',
		external: '外部システム',
		note: 'メモ',
		group: 'グループ',
		connect: '接続'
	},

	editing: {
		undo: '元に戻す',
		redo: 'やり直す',
		duplicate: '複製',
		delete: '削除',
		bringForward: '前面へ',
		sendBackward: '背面へ',
		rename: '名前を変更',
		colour: '色'
	},

	comments: {
		heading: 'コメント',
		placeholder: 'コメントを入力',
		post: '投稿',
		resolve: '解決済みにする',
		reopen: '再開',
		resolved: '解決済み',
		none: 'コメントはありません'
	},

	history: {
		heading: '履歴',
		checkpoint: 'チェックポイントを保存',
		restore: 'このバージョンを復元',
		viewing: '以前のバージョンを表示しています',
		exit: '現在に戻る',
		operations: (count: number) => `${count} 件の変更`
	},

	a11y: {
		canvas: 'ボードのキャンバス。矢印キーで選択を移動し、Tab で図形を切り替えます。',
		outline: 'ボードのアウトライン',
		selected: (label: string) => `${label}、選択中`,
		joined: (name: string) => `${name}が参加しました`,
		left: (name: string) => `${name}が退出しました`,
		skip: 'ボードへスキップ'
	},

	errors: {
		notFound: 'そのボードは存在しないか、アクセス権がありません。',
		forbidden: 'その操作を行う権限がありません。',
		generic: '問題が発生しました。この端末のボードは変更されていません。'
	}
} satisfies Messages;
