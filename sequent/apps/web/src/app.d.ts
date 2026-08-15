import type { Viewer } from '@sequent/store';

declare global {
	namespace App {
		interface Locals {
			viewer: Viewer | null;
		}
		interface Error {
			message: string;
			id?: string;
		}
	}
}

export {};
