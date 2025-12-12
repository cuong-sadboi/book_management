CREATE TABLE IF NOT EXISTS rental_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rental_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  book_id INT UNSIGNED NOT NULL,
  start_date DATETIME DEFAULT NULL,
  end_date DATETIME DEFAULT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- prevent duplicate same book row per rental if desired (optional)
  UNIQUE KEY ux_rental_book (rental_id, book_id),
  KEY idx_rental (rental_id),
  KEY idx_user (user_id),
  KEY idx_book (book_id),
  KEY idx_status (status),
  CONSTRAINT fk_rental_items_rental FOREIGN KEY (rental_id) REFERENCES book_rentals(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rental_items_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rental_items_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
