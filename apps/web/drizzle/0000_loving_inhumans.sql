CREATE TABLE `accounts` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`icon` text,
	`tier` text DEFAULT 'bronze' NOT NULL,
	`gem_reward` integer DEFAULT 0 NOT NULL,
	`rule` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievements_slug_idx` ON `achievements` (`slug`);--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`language` text DEFAULT 'python' NOT NULL,
	`status` text NOT NULL,
	`code` text,
	`tests_passed` integer DEFAULT 0 NOT NULL,
	`tests_total` integer DEFAULT 0 NOT NULL,
	`hint_level_used` integer DEFAULT 0 NOT NULL,
	`solution_revealed` integer DEFAULT false NOT NULL,
	`duration_ms` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attempts_user_idx` ON `attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `attempts_problem_idx` ON `attempts` (`user_id`,`problem_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`meta` text,
	`ip` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_log` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_ip` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_hash_idx` ON `auth_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_tokens_user_idx` ON `auth_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`industry` text,
	`profile` text,
	`is_published` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_slug_idx` ON `companies` (`slug`);--> statement-breakpoint
CREATE TABLE `daily_usage` (
	`user_id` text NOT NULL,
	`day_utc` text NOT NULL,
	`hints_used` integer DEFAULT 0 NOT NULL,
	`solutions_used` integer DEFAULT 0 NOT NULL,
	`generations_used` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `day_utc`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`rollout_percent` integer DEFAULT 0 NOT NULL,
	`allow_user_ids` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gem_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`problem_id` text,
	`stripe_ref` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gem_ledger_user_idx` ON `gem_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `problems` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`pack` text DEFAULT 'general' NOT NULL,
	`company_id` text,
	`kind` text DEFAULT 'python' NOT NULL,
	`title` text NOT NULL,
	`difficulty` text DEFAULT 'medium' NOT NULL,
	`pattern` text,
	`minutes` integer DEFAULT 15 NOT NULL,
	`body` text NOT NULL,
	`source` text DEFAULT 'curated' NOT NULL,
	`owner_user_id` text,
	`verified_at` integer,
	`is_published` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `problems_slug_idx` ON `problems` (`slug`);--> statement-breakpoint
CREATE INDEX `problems_pack_idx` ON `problems` (`pack`);--> statement-breakpoint
CREATE INDEX `problems_company_idx` ON `problems` (`company_id`);--> statement-breakpoint
CREATE TABLE `processed_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`processed_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`target_company` text,
	`target_role` text,
	`target_round` text,
	`experience_level` text,
	`primary_language` text DEFAULT 'python' NOT NULL,
	`interview_date` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reveals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`kind` text NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`paid_with` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reveals_uniq_idx` ON `reveals` (`user_id`,`problem_id`,`kind`,`level`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`status` text DEFAULT 'none' NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`current_period_end` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_achievements` (
	`user_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`earned_at` integer,
	PRIMARY KEY(`user_id`, `achievement_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`achievement_id`) REFERENCES `achievements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_verified_at` integer,
	`password_hash` text,
	`display_name` text,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`gem_balance` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
