ALTER TABLE `users` DROP INDEX `users_firebaseUid_unique`;--> statement-breakpoint
ALTER TABLE `users` ADD `supabaseUserId` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_supabaseUserId_unique` UNIQUE(`supabaseUserId`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `firebaseUid`;