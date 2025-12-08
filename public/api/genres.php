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

function respond($data, int $code = 200): void {
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
function countBooksByGenre(PDO $pdo, string $genreName, ?int $genreId, array $hiddenBookIds): int {
	$conditions = ['(genre = ?)'];
	$params = [$genreName];
	if ($genreId !== null) {
		$conditions[] = '(genre = ?)';

		$params[] = (string)$genreId;
	}
	$sql = 'SELECT COUNT(*) FROM books WHERE ' . implode(' OR ', $conditions);
	if ($hiddenBookIds) {
		$sql .= ' AND id NOT IN (' . implode(',', array_fill(0, count($hiddenBookIds), '?')) . ')';
		$params = array_merge($params, $hiddenBookIds);
	}
	$stmt = $pdo->prepare($sql);
	$stmt->execute($params);
	return (int)$stmt->fetchColumn();
}

/* LIST / DETAIL */
if ($method === 'GET') {
	$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
	if ($id) {
		$stmt = $pdo->prepare('SELECT * FROM genres WHERE id = :id LIMIT 1');
		$stmt->execute([':id' => $id]);
		$row = $stmt->fetch();
		if (!$row) respond(['success' => false, 'error' => 'Genre not found'], 404);
		respond(['success' => true, 'data' => $row]);
	}

	$page = max(1, (int)($_GET['page'] ?? 1));
	$per = min(100, max(1, (int)($_GET['per_page'] ?? 10)));
	$q = trim($_GET['q'] ?? '');
	$where = [];
	$params = [];
	if ($q !== '') {
		$where[] = '(name LIKE :q OR description LIKE :q)';
		$params[':q'] = "%$q%";
	}
	$whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
	$count = $pdo->prepare("SELECT COUNT(*) FROM genres $whereSql");
	$count->execute($params);
	$total = (int)$count->fetchColumn();

	$offset = ($page - 1) * $per;
	$stmt = $pdo->prepare("SELECT * FROM genres $whereSql ORDER BY id DESC LIMIT :limit OFFSET :offset");
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

/* CREATE */
if ($method === 'POST') {
	$name = trim($body['name'] ?? '');
	if ($name === '') respond(['error' => 'name required'], 422);
	$description = $body['description'] ?? null;

	$stmt = $pdo->prepare('INSERT INTO genres (name, description) VALUES (:name, :description)');
	$stmt->execute([
		':name' => $name,
		':description' => $description,
	]);
	$id = (int)$pdo->lastInsertId();
	$stmt = $pdo->prepare('SELECT * FROM genres WHERE id = :id');
	$stmt->execute([':id' => $id]);
	respond($stmt->fetch(), 201);
}

/* UPDATE */
if ($method === 'PUT') {
	if (!isset($body['id'])) respond(['error' => 'id required'], 422);
	$id = (int)$body['id'];
	$fields = [];
	$params = [':id' => $id];
	foreach (['name', 'description'] as $col) {
		if (array_key_exists($col, $body)) {
			$fields[] = "$col = :$col";
			$params[":$col"] = $body[$col];
		}
	}
	if (!$fields) respond(['error' => 'no fields to update'], 422);
	$sql = 'UPDATE genres SET ' . implode(', ', $fields) . ' WHERE id = :id';
	$stmt = $pdo->prepare($sql);
	$stmt->execute($params);
	$stmt = $pdo->prepare('SELECT * FROM genres WHERE id = :id');
	$stmt->execute([':id' => $id]);
	respond($stmt->fetch());
}

/* DELETE */
if ($method === 'DELETE') {
	if (isset($body['id'])) {
		$gStmt = $pdo->prepare('SELECT id, name FROM genres WHERE id = :id');
		$gStmt->execute([':id' => (int)$body['id']]);
		$genre = $gStmt->fetch();
		if (!$genre) respond(['error' => 'Genre not found'], 404);

		if (countBooksByGenre($pdo, $genre['name'], (int)$genre['id'], $hiddenBookIds) > 0) {
			respond(['error' => 'Cannot delete genre because books reference this genre.'], 409);
		}

		$stmt = $pdo->prepare('DELETE FROM genres WHERE id = :id');
		$stmt->execute([':id' => (int)$body['id']]);
		respond(['deleted' => 1]);
	}
	if (!empty($body['ids']) && is_array($body['ids'])) {
		$ids = array_map('intval', $body['ids']);
		if (!$ids) respond(['deleted' => 0]);

		$ph = implode(',', array_fill(0, count($ids), '?'));
		$namesStmt = $pdo->prepare("SELECT id, name FROM genres WHERE id IN ($ph)");
		$namesStmt->execute($ids);
		$list = $namesStmt->fetchAll();

		$blocked = [];
		$okIds = [];
		foreach ($list as $g) {
			if (countBooksByGenre($pdo, $g['name'], (int)$g['id'], $hiddenBookIds) > 0) {
				$blocked[] = $g['name'];
			} else {
				$okIds[] = (int)$g['id'];
			}
		}
		if (!$okIds) respond(['error' => 'Cannot delete genres in use: ' . implode(', ', $blocked)], 409);

		$delPh = implode(',', array_fill(0, count($okIds), '?'));
		$stmt = $pdo->prepare("DELETE FROM genres WHERE id IN ($delPh)");
		$stmt->execute($okIds);
		respond(['deleted' => $stmt->rowCount(), 'blocked' => $blocked]);
	}
	respond(['error' => 'id or ids required'], 422);
}

respond(['error' => 'method not allowed'], 405);
