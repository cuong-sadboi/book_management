<?php
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

$method = $_SERVER['REQUEST_METHOD'];
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$hiddenBookIds = [];
if (!empty($body['hidden_book_ids']) && is_array($body['hidden_book_ids'])) {
	$hiddenBookIds = array_values(array_filter(array_map('intval', $body['hidden_book_ids'])));
}

function countBooksByAuthor(PDO $pdo, string $authorName, array $hiddenBookIds): int {
	$sql = 'SELECT COUNT(*) FROM books WHERE author = ?';
	$params = [$authorName];
	if ($hiddenBookIds) {
		$sql .= ' AND id NOT IN (' . implode(',', array_fill(0, count($hiddenBookIds), '?')) . ')';
		$params = array_merge($params, $hiddenBookIds);
	}
	$stmt = $pdo->prepare($sql);
	$stmt->execute($params);
	return (int)$stmt->fetchColumn();
}

// GET list or single
if ($method === 'GET') {
	$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
	if ($id) {
		$stmt = $pdo->prepare('SELECT * FROM authors WHERE id = :id LIMIT 1');
		$stmt->execute([':id' => $id]);
		$row = $stmt->fetch();
		if (!$row) respond(['success' => false, 'error' => 'Author not found'], 404);
		respond(['success' => true, 'data' => $row]);
	}

	$page = max(1, (int)($_GET['page'] ?? 1));
	$per = min(100, max(1, (int)($_GET['per_page'] ?? 10)));
	$q = trim($_GET['q'] ?? '');
	$where = [];
	$params = [];
	if ($q !== '') {
		$where[] = '(name LIKE :q OR nationality LIKE :q)';
		$params[':q'] = "%$q%";
	}
	$whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
	$count = $pdo->prepare("SELECT COUNT(*) FROM authors $whereSql");
	$count->execute($params);
	$total = (int)$count->fetchColumn();

	$offset = ($page - 1) * $per;
	$stmt = $pdo->prepare("SELECT * FROM authors $whereSql ORDER BY id DESC LIMIT :limit OFFSET :offset");
	foreach ($params as $k => $v) $stmt->bindValue($k, $v, PDO::PARAM_STR);
	$stmt->bindValue(':limit', $per, PDO::PARAM_INT);
	$stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
	$stmt->execute();
	respond([
		'data' => $stmt->fetchAll(),
		'meta' => [
			'total' => $total,
			'per_page' => $per,
			'current_page' => $page,
			'last_page' => (int)ceil($total / $per),
		],
	]);
}

// CREATE
if ($method === 'POST') {
	$name = trim($body['name'] ?? '');
	$email = trim($body['email'] ?? '');
	if ($name === '') respond(['error' => 'name required'], 422);
	if ($email === '') respond(['error' => 'email required'], 422);

	// unique email check
	$dupStmt = $pdo->prepare('SELECT COUNT(*) FROM authors WHERE email = :email');
	$dupStmt->execute([':email' => $email]);
	if ((int)$dupStmt->fetchColumn() > 0) respond(['error' => 'Email already exists.'], 422);

	$nationality = trim($body['nationality'] ?? '');
	$birth_year = $body['birth_year'] !== null ? (int)$body['birth_year'] : null;
	$bio = $body['bio'] ?? null;

	$stmt = $pdo->prepare('INSERT INTO authors (name, email, nationality, birth_year, bio) VALUES (:name, :email, :nationality, :birth_year, :bio)');
	$stmt->execute([
		':name' => $name,
		':email' => $email,
		':nationality' => $nationality,
		':birth_year' => $birth_year ?: null,
		':bio' => $bio,
	]);
	$id = (int)$pdo->lastInsertId();
	$stmt = $pdo->prepare('SELECT * FROM authors WHERE id = :id');
	$stmt->execute([':id' => $id]);
	respond($stmt->fetch(), 201);
}

// UPDATE
if ($method === 'PUT') {
	if (!isset($body['id'])) respond(['error' => 'id required'], 422);
	$id = (int)$body['id'];
	
	// Get old name before update
	$oldStmt = $pdo->prepare('SELECT name FROM authors WHERE id = :id');
	$oldStmt->execute([':id' => $id]);
	$oldData = $oldStmt->fetch();
	if (!$oldData) respond(['error' => 'Author not found'], 404);
	$oldName = $oldData['name'];
	
	$fields = [];
	$params = [':id' => $id];

	if (array_key_exists('email', $body)) {
		$email = trim((string)$body['email']);
		if ($email === '') respond(['error' => 'email required'], 422);
		$check = $pdo->prepare('SELECT COUNT(*) FROM authors WHERE email = :email AND id <> :id');
		$check->execute([':email' => $email, ':id' => $id]);
		if ((int)$check->fetchColumn() > 0) respond(['error' => 'Email already exists.'], 422);
		$fields[] = 'email = :email';
		$params[':email'] = $email;
	}

	$newName = null;
	foreach (['name', 'nationality', 'bio'] as $col) {
		if (array_key_exists($col, $body)) {
			$fields[] = "$col = :$col";
			$params[":$col"] = $body[$col];
			if ($col === 'name') $newName = trim((string)$body[$col]);
		}
	}
	if (array_key_exists('birth_year', $body)) {
		$fields[] = 'birth_year = :birth_year';
		$params[':birth_year'] = $body['birth_year'] !== null ? (int)$body['birth_year'] : null;
	}
	if (!$fields) respond(['error' => 'no fields to update'], 422);
	
	// Update author
	$sql = 'UPDATE authors SET ' . implode(', ', $fields) . ' WHERE id = :id';
	$stmt = $pdo->prepare($sql);
	$stmt->execute($params);
	
	// If name changed, update all books using this author
	if ($newName !== null && $newName !== '' && $newName !== $oldName) {
		$updateBooks = $pdo->prepare('UPDATE books SET author = :new_name WHERE author = :old_name');
		$updateBooks->execute([':new_name' => $newName, ':old_name' => $oldName]);
	}
	
	$stmt = $pdo->prepare('SELECT * FROM authors WHERE id = :id');
	$stmt->execute([':id' => $id]);
	respond($stmt->fetch());
}

// DELETE single or bulk 
if ($method === 'DELETE') {
	if (isset($body['id'])) {
		$authorStmt = $pdo->prepare('SELECT name FROM authors WHERE id = :id');
		$authorStmt->execute([':id' => (int)$body['id']]);
		$author = $authorStmt->fetch();
		if (!$author) respond(['error' => 'Author not found'], 404);

		if (countBooksByAuthor($pdo, $author['name'], $hiddenBookIds) > 0) {
			respond(['error' => 'Cannot delete author because books reference this author.'], 409);
		}

		$stmt = $pdo->prepare('DELETE FROM authors WHERE id = :id');
		$stmt->execute([':id' => (int)$body['id']]);
		respond(['deleted' => 1]);
	}

	if (!empty($body['ids']) && is_array($body['ids'])) {
		$ids = array_map('intval', $body['ids']);
		if (empty($ids)) respond(['deleted' => 0]);

		$ph = implode(',', array_fill(0, count($ids), '?'));
		$namesStmt = $pdo->prepare("SELECT id, name FROM authors WHERE id IN ($ph)");
		$namesStmt->execute($ids);
		$authors = $namesStmt->fetchAll();

		$blocked = [];
		$okIds = [];
		foreach ($authors as $a) {
			if (countBooksByAuthor($pdo, $a['name'], $hiddenBookIds) > 0) {
				$blocked[] = $a['name'];
			} else {
				$okIds[] = (int)$a['id'];
			}
		}

		if (!$okIds) respond(['error' => 'Cannot delete authors in use: ' . implode(', ', $blocked)], 409);

		$delPh = implode(',', array_fill(0, count($okIds), '?'));
		$stmt = $pdo->prepare("DELETE FROM authors WHERE id IN ($delPh)");
		$stmt->execute($okIds);
		respond(['deleted' => $stmt->rowCount(), 'blocked' => $blocked]);
	}

	respond(['error' => 'id or ids required'], 422);
}

respond(['error' => 'method not allowed'], 405);
