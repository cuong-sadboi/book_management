CREATE TABLE IF NOT EXISTS `authors` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `nationality` VARCHAR(120) DEFAULT NULL,
  `birth_year` INT UNSIGNED DEFAULT NULL,
  `bio` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_authors_email` (`email`),
  KEY `idx_authors_name` (`name`),
  KEY `idx_authors_nationality` (`nationality`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration (run once on existing DB before applying NOT NULL + UNIQUE):
-- ALTER TABLE `authors` ADD COLUMN `email` VARCHAR(255) NULL AFTER `name`;
-- UPDATE `authors` SET `email` = CONCAT('temp+', id, '@example.com') WHERE `email` IS NULL OR `email` = '';
-- ALTER TABLE `authors` MODIFY `email` VARCHAR(255) NOT NULL;
-- ALTER TABLE `authors` ADD UNIQUE INDEX `uniq_authors_email` (`email`);

-- Run these statements on your existing DB to avoid duplicate '' errors:
-- 1) Add the column as nullable so existing rows pass
ALTER TABLE `authors` ADD COLUMN `email` VARCHAR(255) NULL AFTER `name`;
-- 2) Fill any NULL/blank emails with unique placeholders
UPDATE `authors`
SET `email` = CONCAT('temp+', id, '@example.com')
WHERE `email` IS NULL OR `email` = '';
-- 3) Enforce NOT NULL
ALTER TABLE `authors` MODIFY `email` VARCHAR(255) NOT NULL;
-- 4) Add unique constraint
ALTER TABLE `authors` ADD UNIQUE INDEX `uniq_authors_email` (`email`);

-- To enforce unique publisher names:
-- ALTER TABLE `publishers` ADD UNIQUE INDEX `uniq_publishers_name` (`name`);
