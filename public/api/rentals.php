<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Set timezone to Vietnam
date_default_timezone_set('Asia/Ho_Chi_Minh');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$config = require __DIR__ . '/config.php';
$dsn = "mysql:host={$config['db_host']};dbname={$config['db_name']};charset={$config['db_charset']}";
$options = [
	PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
	PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
	PDO::ATTR_EMULATE_PREPARES => false,
];

try {
	$pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], $options);
} catch (PDOException $e) {
	http_response_code(500);
	echo json_encode(['error' => 'DB connection failed: ' . $e->getMessage()]);
	exit;
}

function respond($data, int $code = 200) {
	http_response_code($code);
	echo json_encode($data, JSON_UNESCAPED_UNICODE);
	exit;
}

// Function to auto-update overdue rentals
function updateOverdueRentals($pdo) {
	try {
		// Update book_rentals that are past due date and still active
		$stmt = $pdo->prepare("
			UPDATE book_rentals 
			SET status = 'overdue' 
			WHERE status = 'active' 
			AND due_date IS NOT NULL 
			AND due_date < NOW()
			AND deleted_at IS NULL
		");
		$stmt->execute();
		
		// Also update rental_items that are past end_date and still active
		$stmt2 = $pdo->prepare("
			UPDATE rental_items 
			SET status = 'overdue' 
			WHERE status = 'active' 
			AND end_date IS NOT NULL 
			AND end_date < NOW()
		");
		$stmt2->execute();
	} catch (Exception $e) {
		// Log error but don't stop execution
		error_log('Failed to update overdue rentals: ' . $e->getMessage());
	}
}

$method = $_SERVER['REQUEST_METHOD'];
$body = json_decode(file_get_contents('php://input'), true) ?? [];

// GET - List or single rental (header + items)
if ($method === 'GET') {
	// Auto-update overdue status before fetching
	updateOverdueRentals($pdo);
	
	$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
	if ($id) {
		$stmt = $pdo->prepare('
			SELECT r.*, u.name as user_name, u.email as user_email,
			       (SELECT GROUP_CONCAT(b.title SEPARATOR \', \')
			        FROM rental_items ri
			        JOIN books b ON ri.book_id = b.id
			        WHERE ri.rental_id = r.id
			       ) AS book_titles
			FROM book_rentals r
			LEFT JOIN users u ON r.user_id = u.id
			WHERE r.id = :id LIMIT 1
		');
		$stmt->execute([':id' => $id]);
		$r = $stmt->fetch();
		if (!$r) respond(['success' => false, 'error' => 'Rental not found'], 404);

		$it = $pdo->prepare('SELECT ri.*, b.title as book_title, b.isbn as book_isbn, b.author as book_author FROM rental_items ri LEFT JOIN books b ON ri.book_id = b.id WHERE ri.rental_id = :rid ORDER BY ri.id');
		$it->execute([':rid' => $id]);
		$r['items'] = $it->fetchAll();

		respond(['success' => true, 'data' => $r]);
	}

	$page = max(1, (int)($_GET['page'] ?? 1));
	$per = min(100, max(1, (int)($_GET['per_page'] ?? 10)));
	$q = trim($_GET['q'] ?? '');
	$status = $_GET['status'] ?? null;
	$userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
	$bookId = isset($_GET['book_id']) ? (int)$_GET['book_id'] : null;
	$offset = ($page - 1) * $per;

	$where = [];
	$params = [];

	// Search across multiple columns
	if ($q !== '') {
		$likeTerm = "%{$q}%";
		$searchConditions = [];
		$searchColumns = ['u.name', 'u.email', 'r.notes'];
		foreach ($searchColumns as $column) {
			$paramName = ":term_" . str_replace('.', '_', $column);
			$searchConditions[] = "{$column} LIKE {$paramName}";
			$params[$paramName] = $likeTerm;
		}
		$where[] = '(' . implode(' OR ', $searchConditions) . ')';
	}

	if ($status) {
		$where[] = 'r.status = :status';
		$params[':status'] = $status;
	}
	if ($userId) {
		$where[] = 'r.user_id = :user_id';
		$params[':user_id'] = $userId;
	}

	$bookJoin = '';
	if ($bookId) {
		$bookJoin = 'INNER JOIN rental_items ri_filter ON ri_filter.rental_id = r.id AND ri_filter.book_id = :filter_book_id';
		$params[':filter_book_id'] = $bookId;
	}

	$whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

	try {
		$countSql = "SELECT COUNT(DISTINCT r.id) FROM book_rentals r LEFT JOIN users u ON r.user_id = u.id {$bookJoin} {$whereSql}";
		$count = $pdo->prepare($countSql);
		$count->execute($params);
		$total = (int)$count->fetchColumn();

		$sql = "
			SELECT DISTINCT r.*, u.name as user_name, u.email as user_email,
			       (SELECT GROUP_CONCAT(b2.title SEPARATOR ', ')
			        FROM rental_items ri2
			        JOIN books b2 ON ri2.book_id = b2.id
			        WHERE ri2.rental_id = r.id
			       ) AS book_titles
			FROM book_rentals r
			LEFT JOIN users u ON r.user_id = u.id
			{$bookJoin}
			{$whereSql}
			ORDER BY r.id DESC
			LIMIT :limit OFFSET :offset
		";
		$stmt = $pdo->prepare($sql);
		foreach ($params as $k => $v) {
			$stmt->bindValue($k, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
		}
		$stmt->bindValue(':limit', $per, PDO::PARAM_INT);
		$stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
		$stmt->execute();
		$rentals = $stmt->fetchAll();

		// existing logic to fetch items map remains unchanged
		$rentalIds = array_column($rentals, 'id');
		$itemsMap = [];
		if ($rentalIds) {
			$ph = implode(',', array_fill(0, count($rentalIds), '?'));
			$it = $pdo->prepare("SELECT ri.*, b.title as book_title FROM rental_items ri LEFT JOIN books b ON ri.book_id = b.id WHERE ri.rental_id IN ($ph) ORDER BY ri.id");
			$it->execute($rentalIds);
			$allItems = $it->fetchAll();
			foreach ($allItems as $itm) {
				$itemsMap[$itm['rental_id']][] = $itm;
			}
		}
		foreach ($rentals as &$r) {
			$r['items'] = $itemsMap[$r['id']] ?? [];
			// if UI expects single book_title field, keep compatibility:
			if (empty($r['book_titles']) && !empty($r['items'])) {
				$r['book_titles'] = implode(', ', array_column($r['items'], 'book_title'));
			}
		}

		respond([
			'data' => $rentals,
			'meta' => [
				'total' => $total,
				'per_page' => $per,
				'current_page' => $page,
				'last_page' => (int)ceil($total / $per),
			],
		]);
	} catch (PDOException $e) {
		respond(['error' => 'Database error: ' . $e->getMessage()], 500);
	}
}

// --- ADD ITEM to existing rental (POST with action=add_item) ---
if ($method === 'POST' && isset($body['action']) && $body['action'] === 'add_item') {
	$rentalId = isset($body['rental_id']) ? (int)$body['rental_id'] : 0;
	$bookId = isset($body['book_id']) ? (int)$body['book_id'] : 0;
	$qty = isset($body['quantity']) ? max(1, (int)$body['quantity']) : 1;
	$start = $body['start_date'] ?? null;
	$end = $body['end_date'] ?? null;
	$notes = $body['notes'] ?? null;

	if (!$rentalId) respond(['error' => 'rental_id required'], 422);
	if (!$bookId) respond(['error' => 'book_id required'], 422);

	// validate rental
	$stmt = $pdo->prepare('SELECT * FROM book_rentals WHERE id = :id');
	$stmt->execute([':id' => $rentalId]);
	$rental = $stmt->fetch();
	if (!$rental) respond(['error' => 'Rental not found'], 404);

	// check book
	$bookCheck = $pdo->prepare('SELECT id, stock, is_rental FROM books WHERE id = :id');
	$bookCheck->execute([':id' => $bookId]);
	$book = $bookCheck->fetch();
	if (!$book) respond(['error' => 'Book not found'], 404);
	if (!$book['is_rental']) respond(['error' => 'Book is not available for rental'], 422);
	if ($book['stock'] < $qty) respond(['error' => 'Not enough stock'], 422);

	$pdo->beginTransaction();
	try {
		$ins = $pdo->prepare('INSERT INTO rental_items (rental_id, user_id, book_id, start_date, end_date, quantity, status, notes) VALUES (:rental_id, :user_id, :book_id, :start_date, :end_date, :quantity, :status, :notes)');
		$ins->execute([
			':rental_id' => $rentalId,
			':user_id' => $rental['user_id'],
			':book_id' => $bookId,
			':start_date' => $start,
			':end_date' => $end,
			':quantity' => $qty,
			':status' => 'active',
			':notes' => $notes,
		]);
		$itemId = (int)$pdo->lastInsertId();

		$pdo->prepare('UPDATE books SET stock = stock - :qty WHERE id = :id')->execute([':qty' => $qty, ':id' => $bookId]);

		$pdo->commit();

		// return created item with book info
		$it = $pdo->prepare('SELECT ri.*, b.title as book_title, b.isbn as book_isbn, b.author as book_author FROM rental_items ri LEFT JOIN books b ON ri.book_id = b.id WHERE ri.id = :id');
		$it->execute([':id' => $itemId]);
		$item = $it->fetch();
		respond(['success' => true, 'data' => $item], 201);
	} catch (Exception $e) {
		$pdo->rollBack();
		respond(['error' => 'Failed to add item: ' . $e->getMessage()], 500);
	}
}

// POST - Create rental header + items
if ($method === 'POST') {
	$userId = isset($body['user_id']) ? (int)$body['user_id'] : 0;
	$items = $body['items'] ?? [];
	$notes = $body['notes'] ?? null;
	$rentalDate = $body['rental_date'] ?? date('Y-m-d H:i:s');
	$dueDate = $body['due_date'] ?? null;

	if (!$userId) respond(['error' => 'user_id required'], 422);
	if (!is_array($items) || empty($items)) respond(['error' => 'items required'], 422);

	$userCheck = $pdo->prepare('SELECT id FROM users WHERE id = :id');
	$userCheck->execute([':id' => $userId]);
	if (!$userCheck->fetch()) respond(['error' => 'User not found'], 404);

	$booksNeeded = [];
	foreach ($items as $idx => $it) {
		$bookId = isset($it['book_id']) ? (int)$it['book_id'] : 0;
		$qty = isset($it['quantity']) ? max(1, (int)$it['quantity']) : 1;
		if (!$bookId) respond(['error' => "items[$idx].book_id required"], 422);
		$booksNeeded[$bookId] = ($booksNeeded[$bookId] ?? 0) + $qty;
	}

	$bookIds = array_keys($booksNeeded);
	$ph = implode(',', array_fill(0, count($bookIds), '?'));
	$stmt = $pdo->prepare("SELECT id, title, stock, is_rental FROM books WHERE id IN ($ph)");
	$stmt->execute($bookIds);
	$dbBooks = [];
	foreach ($stmt->fetchAll() as $b) $dbBooks[$b['id']] = $b;
	foreach ($booksNeeded as $bid => $needed) {
		if (!isset($dbBooks[$bid])) respond(['error' => "Book {$bid} not found"], 404);
		if (!$dbBooks[$bid]['is_rental']) respond(['error' => "Book {$bid} is not available for rental"], 422);
		if ($dbBooks[$bid]['stock'] < $needed) respond(['error' => "Book {$bid} out of stock (needed {$needed})"], 422);
	}

	$pdo->beginTransaction();
	try {
		$ins = $pdo->prepare('INSERT INTO book_rentals (user_id, rental_date, due_date, notes, status) VALUES (:user_id, :rental_date, :due_date, :notes, "active")');
		$ins->execute([':user_id' => $userId, ':rental_date' => $rentalDate, ':due_date' => $dueDate, ':notes' => $notes]);
		$rentalId = (int)$pdo->lastInsertId();

		$itemStmt = $pdo->prepare('INSERT INTO rental_items (rental_id, user_id, book_id, start_date, end_date, quantity, status, notes) VALUES (:rental_id, :user_id, :book_id, :start_date, :end_date, :quantity, :status, :notes)');
		$updateBook = $pdo->prepare('UPDATE books SET stock = stock - :qty WHERE id = :id');

		foreach ($items as $it) {
			$bookId = (int)$it['book_id'];
			$qty = isset($it['quantity']) ? max(1, (int)$it['quantity']) : 1;
			$start = $it['start_date'] ?? $rentalDate;
			$end = $it['end_date'] ?? $dueDate;
			$itemStmt->execute([
				':rental_id' => $rentalId,
				':user_id' => $userId,
				':book_id' => $bookId,
				':start_date' => $start,
				':end_date' => $end,
				':quantity' => $qty,
				':status' => 'active',
				':notes' => $it['notes'] ?? null,
			]);
			$updateBook->execute([':qty' => $qty, ':id' => $bookId]);
		}

		$pdo->commit();

		$stmt = $pdo->prepare('SELECT r.*, u.name as user_name FROM book_rentals r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = :id');
		$stmt->execute([':id' => $rentalId]);
		$r = $stmt->fetch();
		$it = $pdo->prepare('SELECT ri.*, b.title as book_title FROM rental_items ri LEFT JOIN books b ON ri.book_id = b.id WHERE ri.rental_id = :rid');
		$it->execute([':rid' => $rentalId]);
		$r['items'] = $it->fetchAll();
		respond($r, 201);
	} catch (Exception $e) {
		$pdo->rollBack();
		respond(['error' => 'Failed to create rental: ' . $e->getMessage()], 500);
	}
}

// PUT - Update rental header or return all items
if ($method === 'PUT') {
	if (!isset($body['id'])) respond(['error' => 'id required'], 422);
	$id = (int)$body['id'];

	$rental = $pdo->prepare('SELECT * FROM book_rentals WHERE id = :id');
	$rental->execute([':id' => $id]);
	$rentalData = $rental->fetch();
	if (!$rentalData) respond(['error' => 'Rental not found'], 404);

	$pdo->beginTransaction();
	try {
		$fields = [];
		$params = [':id' => $id];
		$statusChanged = false;
		$newStatus = null;

		if (array_key_exists('user_id', $body)) {
			$newUser = (int)$body['user_id'];
			$userCheck = $pdo->prepare('SELECT id FROM users WHERE id = :id');
			$userCheck->execute([':id' => $newUser]);
			if (!$userCheck->fetch()) { $pdo->rollBack(); respond(['error'=>'User not found'],404); }
			$fields[] = 'user_id = :user_id';
			$params[':user_id'] = $newUser;
		}
		if (array_key_exists('notes', $body)) {
			$fields[] = 'notes = :notes';
			$params[':notes'] = $body['notes'];
		}

		// Check if status is being changed
		if (array_key_exists('status', $body)) {
			$newStatus = $body['status'];
			
			// Prevent manually changing from 'active' to 'overdue'
			// Overdue status should only be set automatically by the system
			if ($rentalData['status'] === 'active' && $newStatus === 'overdue') {
				$pdo->rollBack();
				respond(['error' => 'Cannot manually change status from Active to Overdue. Overdue status is set automatically when due date passes.'], 422);
			}
			
			$statusChanged = ($rentalData['status'] === 'overdue' && $newStatus === 'active');
		}

		// Handle due_date update
		$newDueDate = null;
		$dueDateProvided = array_key_exists('due_date', $body) && !empty($body['due_date']);
		
		if ($dueDateProvided) {
			$newDueDate = $body['due_date'];
		}
		
		// If changing from overdue to active, auto-extend due_date by 1 day from now
		if ($statusChanged && $newStatus === 'active') {
			// Always extend due_date by 1 day when reactivating from overdue
			$extendedDueDate = date('Y-m-d H:i:s', strtotime('+1 day'));
			$newDueDate = $extendedDueDate;
			
			$fields[] = 'due_date = :due_date';
			$params[':due_date'] = $newDueDate;
			
			$fields[] = 'status = :status';
			$params[':status'] = 'active';
			
			// Also update rental_items to active and extend end_date
			$pdo->prepare("
				UPDATE rental_items 
				SET status = 'active', end_date = :new_end_date 
				WHERE rental_id = :rid AND status = 'overdue'
			")->execute([':new_end_date' => $newDueDate, ':rid' => $id]);
			
		} else {
			// Normal due_date update (not reactivating from overdue)
			if ($dueDateProvided) {
				$fields[] = 'due_date = :due_date';
				$params[':due_date'] = $newDueDate;
				
				// If current status is 'overdue' and new due_date is in the future, revert to 'active'
				if ($rentalData['status'] === 'overdue') {
					$newDueDateTimestamp = strtotime($newDueDate);
					$nowTimestamp = time();
					
					if ($newDueDateTimestamp > $nowTimestamp) {
						// Due date is extended to future - revert status to active
						if (!array_key_exists('status', $body) || $body['status'] === 'overdue') {
							$fields[] = 'status = :status';
							$params[':status'] = 'active';
							
							// Also update rental_items to active if they were overdue
							$pdo->prepare("
								UPDATE rental_items 
								SET status = 'active', end_date = :new_end_date 
								WHERE rental_id = :rid AND status = 'overdue'
							")->execute([':new_end_date' => $newDueDate, ':rid' => $id]);
						}
					}
				}
			}
		}

		// Handle return_date field
		$returnDate = $body['return_date'] ?? null;
		if (!$returnDate && ((array_key_exists('return_all', $body) && $body['return_all']) || (array_key_exists('status', $body) && $body['status'] === 'returned'))) {
			$returnDate = date('Y-m-d H:i:s');
		}

		// Return whole rental: restore stock for active/overdue items and mark items returned
		if ((array_key_exists('return_all', $body) && $body['return_all']) || (array_key_exists('status', $body) && $body['status'] === 'returned')) {
			$it = $pdo->prepare("SELECT book_id, quantity, id FROM rental_items WHERE rental_id = :rid AND status IN ('active', 'overdue')");
			$it->execute([':rid' => $id]);
			$activeItems = $it->fetchAll();
			foreach ($activeItems as $ai) {
				$pdo->prepare('UPDATE books SET stock = stock + :qty WHERE id = :id')->execute([':qty' => $ai['quantity'], ':id' => $ai['book_id']]);
				$pdo->prepare('UPDATE rental_items SET status = "returned", end_date = :end_date WHERE id = :iid')->execute([':end_date' => $returnDate, ':iid' => $ai['id']]);
			}
			// Remove any previously set status field to avoid conflict
			$fields = array_filter($fields, fn($f) => strpos($f, 'status =') === false);
			unset($params[':status']);
			
			$fields[] = 'status = :status';
			$params[':status'] = 'returned';
			$fields[] = 'return_date = :return_date';
			$params[':return_date'] = $returnDate;
		} elseif (array_key_exists('status', $body) && !in_array('status = :status', $fields)) {
			// Only add status if not already added
			$fields[] = 'status = :status';
			$params[':status'] = $body['status'];
		}

		// Allow updating return_date independently
		if (array_key_exists('return_date', $body) && !in_array('return_date = :return_date', $fields)) {
			$fields[] = 'return_date = :return_date';
			$params[':return_date'] = $body['return_date'];
		}

		if ($fields) {
			$sql = 'UPDATE book_rentals SET ' . implode(', ', $fields) . ' WHERE id = :id';
			$pdo->prepare($sql)->execute($params);
		}

		$pdo->commit();
	} catch (Exception $e) {
		$pdo->rollBack();
		respond(['error' => 'Failed to update rental: ' . $e->getMessage()], 500);
	}

	$stmt = $pdo->prepare('SELECT r.*, u.name as user_name FROM book_rentals r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = :id');
	$stmt->execute([':id' => $id]);
	$r = $stmt->fetch();
	$it = $pdo->prepare('SELECT ri.*, b.title as book_title FROM rental_items ri LEFT JOIN books b ON ri.book_id = b.id WHERE ri.rental_id = :rid');
	$it->execute([':rid' => $id]);
	$r['items'] = $it->fetchAll();
	respond($r);
}

// DELETE
if ($method === 'DELETE') {
	// Delete single rental item (with action=delete_item)
	if (isset($body['action']) && $body['action'] === 'delete_item') {
		$itemId = isset($body['item_id']) ? (int)$body['item_id'] : 0;
		if (!$itemId) respond(['error' => 'item_id required'], 422);

		$pdo->beginTransaction();
		try {
			// Get item details
			$itemStmt = $pdo->prepare('SELECT * FROM rental_items WHERE id = :id');
			$itemStmt->execute([':id' => $itemId]);
			$item = $itemStmt->fetch();
			if (!$item) { $pdo->rollBack(); respond(['error' => 'Item not found'], 404); }

			// Restore book stock
			$pdo->prepare('UPDATE books SET stock = stock + :qty WHERE id = :id')->execute([':qty' => $item['quantity'], ':id' => $item['book_id']]);

			// Delete item
			$delStmt = $pdo->prepare('DELETE FROM rental_items WHERE id = :id');
			$delStmt->execute([':id' => $itemId]);

			$pdo->commit();
			respond(['success' => true, 'deleted' => 1]);
		} catch (Exception $e) {
			$pdo->rollBack();
			respond(['error' => 'Failed to delete item: ' . $e->getMessage()], 500);
		}
	}

	// Soft delete entire rental (set deleted_at timestamp)
	if (isset($body['id'])) {
		$rentalId = (int)$body['id'];
		$rental = $pdo->prepare('SELECT * FROM book_rentals WHERE id = :id');
		$rental->execute([':id' => $rentalId]);
		$rentalData = $rental->fetch();
		if (!$rentalData) respond(['error' => 'Rental not found'], 404);

		try {
			// Soft delete: set deleted_at timestamp instead of actually deleting
			$stmt = $pdo->prepare('UPDATE book_rentals SET deleted_at = NOW() WHERE id = :id');
			$stmt->execute([':id' => $rentalId]);
			respond(['success' => true, 'deleted' => 1]);
		} catch (Exception $e) {
			respond(['error' => 'Failed to delete rental: ' . $e->getMessage()], 500);
		}
	}

	// Delete multiple rentals by ids (soft delete)
	if (!empty($body['ids']) && is_array($body['ids'])) {
		$ids = array_map('intval', $body['ids']);
		if (empty($ids)) respond(['deleted' => 0]);
		try {
			$ph = implode(',', array_fill(0, count($ids), '?'));
			$stmt = $pdo->prepare("UPDATE book_rentals SET deleted_at = NOW() WHERE id IN ($ph)");
			$stmt->execute($ids);
			respond(['success' => true, 'deleted' => $stmt->rowCount()]);
		} catch (Exception $e) {
			respond(['error' => 'Failed to delete rentals: ' . $e->getMessage()], 500);
		}
	}

	respond(['error' => 'id or ids required'], 422);
}

respond(['error' => 'method not allowed'], 405);
