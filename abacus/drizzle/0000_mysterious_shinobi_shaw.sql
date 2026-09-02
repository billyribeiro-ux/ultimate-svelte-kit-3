CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`challenge` text NOT NULL,
	`name` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text DEFAULT '[]' NOT NULL,
	`device_type` text DEFAULT 'singleDevice' NOT NULL,
	`backed_up` integer DEFAULT false NOT NULL,
	`label` text DEFAULT 'Passkey' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `credentials_user` ON `credentials` (`user_id`);--> statement-breakpoint
CREATE TABLE `ops` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sheet_id` text NOT NULL,
	`version` integer NOT NULL,
	`user_id` text,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`sheet_id`) REFERENCES `sheets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ops_sheet_version` ON `ops` (`sheet_id`,`version`);--> statement-breakpoint
CREATE TABLE `sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`access` text DEFAULT 'private' NOT NULL,
	`doc` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`cell_count` integer DEFAULT 0 NOT NULL,
	`published` text,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sheets_owner` ON `sheets` (`owner_id`);--> statement-breakpoint
CREATE INDEX `sheets_updated` ON `sheets` (`updated_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`locale` text DEFAULT 'en-US' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
