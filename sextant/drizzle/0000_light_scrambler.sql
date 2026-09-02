CREATE TABLE `alert_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`query` text NOT NULL,
	`window_ms` integer DEFAULT 300000 NOT NULL,
	`interval_ms` integer DEFAULT 60000 NOT NULL,
	`threshold` real NOT NULL,
	`clears_at` real,
	`for_ms` integer DEFAULT 0 NOT NULL,
	`direction` text DEFAULT 'above' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alert_rule_tenant_idx` ON `alert_rule` (`tenant_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `alert_status` (
	`rule_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'ok' NOT NULL,
	`since` integer,
	`firing_since` integer,
	`value` real,
	`evaluated_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rule`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `api_key` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`hash` text NOT NULL,
	`scopes` text DEFAULT 'ingest' NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_hash_uidx` ON `api_key` (`hash`);--> statement-breakpoint
CREATE INDEX `api_key_tenant_idx` ON `api_key` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`received_at` integer NOT NULL,
	`service` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`host` text DEFAULT '' NOT NULL,
	`trace_id` text,
	`span_id` text,
	`attributes` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_tenant_time_idx` ON `event` (`tenant_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `event_tenant_service_time_idx` ON `event` (`tenant_id`,`service`,`timestamp`);--> statement-breakpoint
CREATE INDEX `event_tenant_trace_idx` ON `event` (`tenant_id`,`trace_id`);--> statement-breakpoint
CREATE INDEX `event_received_idx` ON `event` (`received_at`);--> statement-breakpoint
CREATE TABLE `membership` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_tenant_user_uidx` ON `membership` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `membership_user_idx` ON `membership` (`user_id`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`delivered_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `outbox_pending_idx` ON `outbox` (`delivered_at`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `rollup` (
	`tenant_id` text NOT NULL,
	`metric` text NOT NULL,
	`series_key` text NOT NULL,
	`resolution` integer NOT NULL,
	`bucket` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`sum` real DEFAULT 0 NOT NULL,
	`min` real,
	`max` real,
	`sketch` text,
	`hll` text,
	PRIMARY KEY(`tenant_id`, `metric`, `series_key`, `resolution`, `bucket`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rollup_range_idx` ON `rollup` (`tenant_id`,`metric`,`resolution`,`bucket`);--> statement-breakpoint
CREATE TABLE `sample` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`metric` text NOT NULL,
	`series_key` text NOT NULL,
	`timestamp` integer NOT NULL,
	`received_at` integer NOT NULL,
	`value` real NOT NULL,
	`service` text DEFAULT '' NOT NULL,
	`labels` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sample_tenant_metric_time_idx` ON `sample` (`tenant_id`,`metric`,`timestamp`);--> statement-breakpoint
CREATE INDEX `sample_tenant_series_time_idx` ON `sample` (`tenant_id`,`series_key`,`timestamp`);--> statement-breakpoint
CREATE INDEX `sample_received_idx` ON `sample` (`received_at`);--> statement-breakpoint
CREATE TABLE `series` (
	`tenant_id` text NOT NULL,
	`metric` text NOT NULL,
	`series_key` text NOT NULL,
	`labels` text DEFAULT '{}' NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`tenant_id`, `metric`, `series_key`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `series_tenant_metric_idx` ON `series` (`tenant_id`,`metric`);--> statement-breakpoint
CREATE TABLE `span` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`trace_id` text NOT NULL,
	`span_id` text NOT NULL,
	`parent_id` text DEFAULT '' NOT NULL,
	`timestamp` integer NOT NULL,
	`received_at` integer NOT NULL,
	`duration` real NOT NULL,
	`service` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`attributes` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `span_tenant_span_uidx` ON `span` (`tenant_id`,`span_id`);--> statement-breakpoint
CREATE INDEX `span_tenant_trace_idx` ON `span` (`tenant_id`,`trace_id`);--> statement-breakpoint
CREATE INDEX `span_tenant_time_idx` ON `span` (`tenant_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `span_tenant_service_time_idx` ON `span` (`tenant_id`,`service`,`timestamp`);--> statement-breakpoint
CREATE INDEX `span_received_idx` ON `span` (`received_at`);--> statement-breakpoint
CREATE TABLE `tenant` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`ingest_rate_per_minute` integer,
	`retention_days` integer,
	`series_limit` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_slug_unique` ON `tenant` (`slug`);--> statement-breakpoint
CREATE TABLE `view` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`query` text NOT NULL,
	`range` text DEFAULT '-1h' NOT NULL,
	`author_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `view_tenant_idx` ON `view` (`tenant_id`,`name`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);