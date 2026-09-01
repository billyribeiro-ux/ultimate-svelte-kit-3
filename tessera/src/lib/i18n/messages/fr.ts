import type { Messages } from './en';

/**
 * French.
 *
 * `satisfies Messages` rather than `: Messages`. The annotation would widen
 * every string to `string` and lose the literal types the source catalogue
 * exports; `satisfies` checks the shape and keeps them. A missing key is an
 * error here, at build time, in this file.
 */
export const fr = {
	app: {
		name: 'Tessera',
		tagline: 'Des schémas toujours synchronisés'
	},

	nav: {
		boards: 'Tableaux',
		signIn: 'Se connecter',
		signOut: 'Se déconnecter',
		language: 'Langue'
	},

	board: {
		untitled: 'Tableau sans titre',
		create: 'Nouveau tableau',
		open: 'Ouvrir',
		empty: 'Rien pour l’instant. Appuyez sur N pour ajouter une première boîte.',
		nodes: (count: number) => (count === 1 ? '1 forme' : `${count} formes`),
		lastEdited: (when: string) => `Modifié ${when}`
	},

	sync: {
		live: 'Toutes les modifications sont enregistrées',
		offline: 'Hors ligne — votre travail est conservé sur cet appareil',
		connecting: 'Reconnexion…',
		pending: (count: number) =>
			count === 1 ? '1 modification en attente' : `${count} modifications en attente`,
		refused: 'Le serveur a refusé une modification. Rechargez pour voir le tableau actuel.'
	},

	presence: {
		alone: 'Vous seul',
		others: (count: number) => (count === 1 ? '1 autre personne' : `${count} autres personnes`),
		follow: (name: string) => `Suivre ${name}`,
		stopFollowing: 'Ne plus suivre'
	},

	tools: {
		select: 'Sélectionner',
		service: 'Service',
		datastore: 'Base de données',
		queue: 'File d’attente',
		external: 'Système externe',
		note: 'Note',
		group: 'Groupe',
		connect: 'Relier'
	},

	editing: {
		undo: 'Annuler',
		redo: 'Rétablir',
		duplicate: 'Dupliquer',
		delete: 'Supprimer',
		bringForward: 'Avancer d’un plan',
		sendBackward: 'Reculer d’un plan',
		rename: 'Renommer',
		colour: 'Couleur'
	},

	comments: {
		heading: 'Commentaires',
		placeholder: 'Laisser un commentaire',
		post: 'Publier',
		resolve: 'Résoudre',
		reopen: 'Rouvrir',
		resolved: 'Résolu',
		none: 'Aucun commentaire'
	},

	history: {
		heading: 'Historique',
		checkpoint: 'Enregistrer un point de repère',
		restore: 'Restaurer cette version',
		viewing: 'Vous consultez une version antérieure',
		exit: 'Revenir au présent',
		operations: (count: number) => (count === 1 ? '1 modification' : `${count} modifications`)
	},

	a11y: {
		canvas:
			'Canevas du tableau. Utilisez les flèches pour déplacer la sélection, Tab pour parcourir les formes.',
		outline: 'Plan du tableau',
		selected: (label: string) => `${label}, sélectionné`,
		joined: (name: string) => `${name} a rejoint le tableau`,
		left: (name: string) => `${name} a quitté le tableau`,
		skip: 'Aller au tableau'
	},

	errors: {
		notFound: 'Ce tableau n’existe pas, ou vous n’y avez pas accès.',
		forbidden: 'Vous n’avez pas la permission de faire cela.',
		generic: 'Une erreur est survenue. Le tableau sur cet appareil est intact.'
	}
} satisfies Messages;
