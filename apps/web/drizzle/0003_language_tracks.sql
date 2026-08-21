CREATE TABLE `language_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_language` text NOT NULL,
	`known_languages` text,
	`job_title` text NOT NULL,
	`job_context` text,
	`company_slug` text,
	`rationale` text,
	`status` text DEFAULT 'generating' NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ready_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `language_tracks_user_idx` ON `language_tracks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `track_lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`relevance` text NOT NULL,
	`estimated_minutes` integer DEFAULT 8 NOT NULL,
	`body` text NOT NULL,
	`verified_at` integer,
	`verify_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `language_tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `track_lessons_track_idx` ON `track_lessons` (`track_id`,`position`);--> statement-breakpoint
CREATE TABLE `track_progress` (
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`status` text DEFAULT 'started' NOT NULL,
	`code` text,
	`hints_used` integer DEFAULT 0 NOT NULL,
	`solution_revealed` integer DEFAULT false NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `lesson_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `track_lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
