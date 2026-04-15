CREATE TABLE `carsForSale` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`vehicleBrand` varchar(128) NOT NULL,
	`vehicleModel` varchar(128) NOT NULL,
	`vehicleYear` int NOT NULL,
	`conditionSummary` varchar(255) NOT NULL,
	`priceSar` int NOT NULL,
	`city` varchar(128),
	`description` text,
	`imageUrls` text,
	`status` enum('draft','published','sold','archived') NOT NULL DEFAULT 'published',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `carsForSale_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`supplierUserId` int NOT NULL,
	`priceSar` int NOT NULL,
	`partCondition` enum('new','used','refurbished') NOT NULL DEFAULT 'used',
	`offerDescription` text,
	`offerImageUrls` text,
	`status` enum('pending','accepted','rejected','completed','withdrawn') NOT NULL DEFAULT 'pending',
	`whatsappNumber` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerUserId` int NOT NULL,
	`vehicleBrand` varchar(128) NOT NULL,
	`vehicleModel` varchar(128) NOT NULL,
	`vehicleYear` int NOT NULL,
	`partName` varchar(255) NOT NULL,
	`partDescription` text,
	`partImageUrls` text,
	`city` varchar(128),
	`status` enum('pending','offered','accepted','completed','cancelled','rejected') NOT NULL DEFAULT 'pending',
	`acceptedOfferId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`offerId` int NOT NULL,
	`reviewerUserId` int NOT NULL,
	`supplierUserId` int NOT NULL,
	`rating` int NOT NULL,
	`comment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','customer','supplier') NOT NULL DEFAULT 'customer';--> statement-breakpoint
ALTER TABLE `users` ADD `firebaseUid` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `phoneNumber` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `city` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD `businessName` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `supportedBrands` text;--> statement-breakpoint
ALTER TABLE `users` ADD `isProfileCompleted` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_firebaseUid_unique` UNIQUE(`firebaseUid`);