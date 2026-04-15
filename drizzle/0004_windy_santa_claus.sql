CREATE TABLE `damaged_cars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`location` varchar(128) NOT NULL,
	`vehicleBrand` varchar(128) NOT NULL,
	`vehicleModel` varchar(128) NOT NULL,
	`askingPriceSar` int NOT NULL,
	`imageUrls` text,
	`damageDescription` text,
	`status` enum('جديد','منشور','مباع','مؤرشف') NOT NULL DEFAULT 'منشور',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `damaged_cars_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `requests` MODIFY COLUMN `status` enum('pending','offered','accepted','completed','cancelled','rejected','جديد','تم تقديم عروض','تم قبول العرض','مكتمل','ملغي','مرفوض') NOT NULL DEFAULT 'جديد';--> statement-breakpoint
ALTER TABLE `offers` ADD `warranty` varchar(255);--> statement-breakpoint
ALTER TABLE `reviews` ADD `qualityRating` int DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `responseSpeedRating` int DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `priceRating` int DEFAULT 5 NOT NULL;