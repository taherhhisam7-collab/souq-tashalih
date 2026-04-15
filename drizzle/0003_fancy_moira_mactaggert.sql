CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`requestId` int NOT NULL,
	`offerId` int NOT NULL,
	`supplierUserId` int NOT NULL,
	`type` enum('new_offer') NOT NULL DEFAULT 'new_offer',
	`title` varchar(255) NOT NULL,
	`body` text,
	`isRead` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
