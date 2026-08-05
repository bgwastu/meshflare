CREATE TABLE `dns_filter_domains` (
	`source_url` text NOT NULL,
	`position` integer NOT NULL,
	`domain` text NOT NULL,
	PRIMARY KEY(`source_url`, `position`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`offline_days` integer DEFAULT 7 NOT NULL,
	`dns_filter_enabled` integer DEFAULT false NOT NULL,
	`dns_filter_status` text DEFAULT 'idle' NOT NULL,
	`dns_filter_url` text NOT NULL,
	`dns_filter_last_synced_at` text,
	`dns_filter_cursor` integer DEFAULT 0 NOT NULL,
	`mesh_suffix` text DEFAULT 'mesh' NOT NULL,
	`last_dns_sync_at` text,
	`last_cleanup_at` text,
	`dns_missing_since_json` text DEFAULT '{}' NOT NULL
);
