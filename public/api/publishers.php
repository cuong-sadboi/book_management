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
function countBooksByPublisher(PDO $pdo, string $publisherName, array $hiddenBookIds): int {
	$sql = 'SELECT COUNT(*) FROM books WHERE publisher = ?';
	$params = [$publisherName];
	if ($hiddenBookIds) {
		$sql .= ' AND id NOT IN (' . implode(',', array_fill(0, count($hiddenBookIds), '?')) . ')';
		$params = array_merge($params, $hiddenBookIds);
	}
	$stmt = $pdo->prepare($sql);
	$stmt->execute($params);
	return (int)$stmt->fetchColumn();
}

if ($method === 'GET') {
	$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
	if ($id) {
		$stmt = $pdo->prepare('SELECT * FROM publishers WHERE id = :id LIMIT 1');
		$stmt->execute([':id' => $id]);
		$row = $stmt->fetch();
		if (!$row) respond(['success' => false, 'error' => 'Publisher not found'], 404);
		respond(['success' => true, 'data' => $row]);
	}

	$page = max(1, (int)($_GET['page'] ?? 1));
	$per = min(100, max(1, (int)($_GET['per_page'] ?? 10)));
	$q = trim($_GET['q'] ?? '');
	$where = [];
	$params = [];
	if ($q !== '') {
		$where[] = '(name LIKE :q OR country LIKE :q)';
		$params[':q'] = "%$q%";
	}
	$whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
	$count = $pdo->prepare("SELECT COUNT(*) FROM publishers $whereSql");
	$count->execute($params);
	$total = (int)$count->fetchColumn();

	$offset = ($page - 1) * $per;
	$stmt = $pdo->prepare("SELECT * FROM publishers $whereSql ORDER BY id DESC LIMIT :limit OFFSET :offset");
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

if ($method === 'POST') {
	$name = trim($body['name'] ?? '');
	if ($name === '') respond(['error' => 'name required'], 422);
	$country = trim($body['country'] ?? '');
	$founded_year = $body['founded_year'] !== null ? (int)$body['founded_year'] : null;
	$website = trim($body['website'] ?? '');
	$note = $body['note'] ?? null;

	$stmt = $pdo->prepare('INSERT INTO publishers (name, country, founded_year, website, note) VALUES (:name, :country, :founded_year, :website, :note)');
	$stmt->execute([
		':name' => $name,
		':country' => $country,
		':founded_year' => $founded_year ?: null,
		':website' => $website,
		':note' => $note,
	]);
	$id = (int)$pdo->lastInsertId();
	$stmt = $pdo->prepare('SELECT * FROM publishers WHERE id = :id');
	$stmt->execute([':id' => $id]);
	respond($stmt->fetch(), 201);
}

if ($method === 'PUT') {
	if (!isset($body['id'])) respond(['error' => 'id required'], 422);
	$id = (int)$body['id'];
	
	// Get old name before update
	$oldStmt = $pdo->prepare('SELECT name FROM publishers WHERE id = :id');
	$oldStmt->execute([':id' => $id]);
	$oldData = $oldStmt->fetch();
	if (!$oldData) respond(['error' => 'Publisher not found'], 404);
	$oldName = $oldData['name'];
	
	$fields = [];
	$params = [':id' => $id];
	$newName = null;
	
	foreach (['name', 'country', 'website', 'note'] as $col) {
		if (array_key_exists($col, $body)) {
			$fields[] = "$col = :$col";
			$params[":$col"] = $body[$col];
			if ($col === 'name') $newName = trim((string)$body[$col]);
		}
	}
	if (array_key_exists('founded_year', $body)) {
		$fields[] = 'founded_year = :founded_year';
		$params[':founded_year'] = $body['founded_year'] !== null ? (int)$body['founded_year'] : null;
	}
	if (!$fields) respond(['error' => 'no fields to update'], 422);
	
	// Update publisher
	$sql = 'UPDATE publishers SET ' . implode(', ', $fields) . ' WHERE id = :id';
	$stmt = $pdo->prepare($sql);
	$stmt->execute($params);
	
	// If name changed, update all books using this publisher
	if ($newName !== null && $newName !== '' && $newName !== $oldName) {
		$updateBooks = $pdo->prepare('UPDATE books SET publisher = :new_name WHERE publisher = :old_name');
		$updateBooks->execute([':new_name' => $newName, ':old_name' => $oldName]);
	}
	
	$stmt = $pdo->prepare('SELECT * FROM publishers WHERE id = :id');
	$stmt->execute([':id' => $id]);
	respond($stmt->fetch());
}

if ($method === 'DELETE') {
	if (isset($body['id'])) {
		$pubStmt = $pdo->prepare('SELECT name FROM publishers WHERE id = :id');
		$pubStmt->execute([':id' => (int)$body['id']]);
		$pub = $pubStmt->fetch();
		if (!$pub) respond(['error' => 'Publisher not found'], 404);

		if (countBooksByPublisher($pdo, $pub['name'], $hiddenBookIds) > 0) {
			respond(['error' => 'Cannot delete publisher because books reference this publisher.'], 409);
		}

		$stmt = $pdo->prepare('DELETE FROM publishers WHERE id = :id');
		$stmt->execute([':id' => (int)$body['id']]);
		respond(['deleted' => 1]);
	}

	if (!empty($body['ids']) && is_array($body['ids'])) {
		$ids = array_map('intval', $body['ids']);
		if (empty($ids)) respond(['deleted' => 0]);

		$ph = implode(',', array_fill(0, count($ids), '?'));
		$namesStmt = $pdo->prepare("SELECT id, name FROM publishers WHERE id IN ($ph)");
		$namesStmt->execute($ids);
		$list = $namesStmt->fetchAll();

		$blocked = [];
		$okIds = [];
		foreach ($list as $p) {
			if (countBooksByPublisher($pdo, $p['name'], $hiddenBookIds) > 0) {
				$blocked[] = $p['name'];
			} else {
				$okIds[] = (int)$p['id'];
			}
		}
		if (!$okIds) respond(['error' => 'Cannot delete publishers in use: ' . implode(', ', $blocked)], 409);

		$delPh = implode(',', array_fill(0, count($okIds), '?'));
		$stmt = $pdo->prepare("DELETE FROM publishers WHERE id IN ($delPh)");
		$stmt->execute($okIds);
		respond(['deleted' => $stmt->rowCount(), 'blocked' => $blocked]);
	}
	respond(['error' => 'id or ids required'], 422);
}

respond(['error' => 'method not allowed'], 405);
