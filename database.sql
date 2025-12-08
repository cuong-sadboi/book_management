-- Tạo database & bảng sách (phiên bản mới có is_rental và shelf_location)
CREATE DATABASE IF NOT EXISTS `books` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `books`;

DROP TABLE IF EXISTS `books`;
CREATE TABLE `books` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `isbn` VARCHAR(50) NOT NULL UNIQUE,
  `title` VARCHAR(255) NOT NULL,
  `author` VARCHAR(255) DEFAULT NULL,
  `publisher` VARCHAR(255) DEFAULT NULL,
  `year` INT DEFAULT NULL,
  `genre` VARCHAR(100) DEFAULT NULL,
  `price` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `stock` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(50) NOT NULL DEFAULT 'available', -- available, out_of_print, discontinued
  `is_rental` TINYINT(1) NOT NULL DEFAULT 0, -- 0 = không cho thuê, 1 = có cho thuê
  `shelf_location` VARCHAR(100) DEFAULT NULL, -- ví dụ: "A3-12" hoặc "Kệ 2 / Hàng trên"
  `cover_image` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_isbn` (`isbn`),
  KEY `idx_author` (`author`),
  KEY `idx_genre` (`genre`),
  KEY `idx_is_rental` (`is_rental`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed sample data (cập nhật thêm is_rental và shelf_location)
INSERT INTO `books` (`isbn`,`title`,`author`,`publisher`,`year`,`genre`,`price`,`stock`,`status`,`is_rental`,`shelf_location`,`cover_image`)
VALUES
('978-0143127741','Sapiens: A Brief History of Humankind','Yuval Noah Harari','Harper',2015,'History',14.99,12,'available',0,'A1-05','static/covers/sapiens.jpg'),
('978-0062316110','The Alchemist','Paulo Coelho','HarperOne',2014,'Fiction',9.99,5,'available',1,'B2-01','static/covers/alchemist.jpg'),
('978-0590353427','Harry Potter and the Sorcerer''s Stone','J.K. Rowling','Scholastic',1998,'Fantasy',8.99,0,'out_of_print',1,'C3-12','static/covers/hp1.jpg'),
('978-0131103627','The C Programming Language','Kernighan & Ritchie','Prentice Hall',1988,'Programming',55.00,3,'available',0,'D4-02','static/covers/cprog.jpg');