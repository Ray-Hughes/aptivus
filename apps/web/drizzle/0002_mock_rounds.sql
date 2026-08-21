CREATE TABLE `mock_round_problems` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`solved` integer DEFAULT false NOT NULL,
	`time_spent_ms` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`first_run_at` integer,
	`solved_at` integer,
	`stopped` integer DEFAULT false NOT NULL,
	`code` text,
	`scratch` text,
	`checks_passed` integer,
	`checks_total` integer,
	FOREIGN KEY (`round_id`) REFERENCES `mock_rounds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mock_round_problems_round_idx` ON `mock_round_problems` (`round_id`,`order_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `mock_round_problems_uniq_idx` ON `mock_round_problems` (`round_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `mock_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_slug` text,
	`pack` text,
	`shape` text DEFAULT 'split' NOT NULL,
	`duration_seconds` integer DEFAULT 2700 NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ended_at` integer,
	`activity` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mock_rounds_user_idx` ON `mock_rounds` (`user_id`,`started_at`);