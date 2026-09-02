/**
 * What the CSV worker and the page say to each other. Both sides import
 * this, so a message the worker sends is a message the page expects — the
 * compiler checks the conversation.
 */

export interface ParseRequest {
	type: 'parse';
	file: File;
	delimiter?: string;
}

export type WorkerRequest = ParseRequest;

export type WorkerResponse =
	| { type: 'progress'; bytes: number; total: number; rows: number }
	| { type: 'rows'; rows: string[][] }
	| { type: 'done'; rows: number; delimiter: string }
	| { type: 'error'; message: string };
