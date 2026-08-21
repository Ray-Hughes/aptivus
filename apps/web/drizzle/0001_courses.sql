CREATE TABLE `course_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_slug` text NOT NULL,
	`module_id` text NOT NULL,
	`status` text DEFAULT 'started' NOT NULL,
	`completed_at` integer,
	`checkpoint_score` real,
	`checkpoint_at` integer,
	`checkpoint_answers` text,
	`marked_problems` text,
	`attested` integer DEFAULT false NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_progress_uniq_idx` ON `course_progress` (`user_id`,`course_slug`,`module_id`);--> statement-breakpoint
CREATE INDEX `course_progress_user_idx` ON `course_progress` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text NOT NULL,
	`audience` text NOT NULL,
	`level` text,
	`estimated_hours` real DEFAULT 0 NOT NULL,
	`time_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`module_count` integer DEFAULT 0 NOT NULL,
	`problem_count` integer DEFAULT 0 NOT NULL,
	`tags` text,
	`body` text NOT NULL,
	`is_published` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_slug_idx` ON `courses` (`slug`);