<?php
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

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

// GET list or single
if ($method === 'GET') {
	$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
	if ($id) {
		$stmt = $pdo->prepare('SELECT id, name, username, email, age, location, bio, created_at FROM users WHERE id = :id LIMIT 1');
		$stmt->execute([':id' => $id]);
		$row = $stmt->fetch();
		if (!$row) respond(['success' => false, 'error' => 'User not found'], 404);
		respond(['success' => true, 'data' => $row]);
	}

	$page = max(1, (int)($_GET['page'] ?? 1));
	$per = min(100, max(1, (int)($_GET['per_page'] ?? 10)));
	$q = trim($_GET['q'] ?? '');
	$offset = ($page - 1) * $per;

	$whereClause = '';
	$params = [];
	$searchColumns = ['name', 'username', 'email', 'location'];
	if ($q !== '') {
		$likeTerm = "%{$q}%";
		$conditions = [];
		foreach ($searchColumns as $column) {
			$paramName = ":term_{$column}";
			$conditions[] = "{$column} LIKE {$paramName}";
			$params[$paramName] = $likeTerm;
		}
		$whereClause = 'WHERE ' . implode(' OR ', $conditions);
	}

	try {
		$countStmt = $pdo->prepare("SELECT COUNT(*) FROM users {$whereClause}");
		$countStmt->execute($params);
		$total = (int)$countStmt->fetchColumn();

		$sql = "SELECT id, name, username, email, age, location, bio, created_at FROM users {$whereClause} ORDER BY id DESC LIMIT :limit OFFSET :offset";
		$stmt = $pdo->prepare($sql);
		foreach ($params as $key => $value) {
			$stmt->bindValue($key, $value, PDO::PARAM_STR);
		}
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
	} catch (PDOException $e) {
		respond(['error' => 'Database error: ' . $e->getMessage()], 500);
	} catch (Exception $e) {
		respond(['error' => 'Error: ' . $e->getMessage()], 500);
	}
}

// CREATE
if ($method === 'POST') {
	$name = trim($body['name'] ?? '');
	$username = trim($body['username'] ?? '');
	$email = trim($body['email'] ?? '');

	if ($name === '') respond(['error' => 'name required'], 422);
	if ($username === '') respond(['error' => 'username required'], 422);
	if ($email === '') respond(['error' => 'email required'], 422);

	// Check unique username
	$dupStmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE username = :username');
	$dupStmt->execute([':username' => $username]);
	if ((int)$dupStmt->fetchColumn() > 0) respond(['error' => 'Username already exists.'], 422);

	// Check unique email
	$dupStmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = :email');
	$dupStmt->execute([':email' => $email]);
	if ((int)$dupStmt->fetchColumn() > 0) respond(['error' => 'Email already exists.'], 422);

	$age = isset($body['age']) && $body['age'] !== '' ? (int)$body['age'] : null;
	$location = trim($body['location'] ?? '');
	$bio = trim($body['bio'] ?? '');

	$stmt = $pdo->prepare('INSERT INTO users (name, username, email, age, location, bio) VALUES (:name, :username, :email, :age, :location, :bio)');
	$stmt->execute([
		':name' => $name,
		':username' => $username,
		':email' => $email,
		':age' => $age,
		':location' => $location ?: null,
		':bio' => $bio ?: null,
	]);
	$id = (int)$pdo->lastInsertId();
	$stmt = $pdo->prepare('SELECT id, name, username, email, age, location, bio, created_at FROM users WHERE id = :id');
	$stmt->execute([':id' => $id]);
	respond($stmt->fetch(), 201);
}

// UPDATE
if ($method === 'PUT') {
	if (!isset($body['id'])) respond(['error' => 'id required'], 422);
	$id = (int)$body['id'];

	$fields = [];
	$params = [':id' => $id];

	if (array_key_exists('name', $body)) {
		$name = trim((string)$body['name']);
		if ($name === '') respond(['error' => 'name required'], 422);
		$fields[] = 'name = :name';
		$params[':name'] = $name;
	}

	if (array_key_exists('username', $body)) {
		$username = trim((string)$body['username']);
		if ($username === '') respond(['error' => 'username required'], 422);
		$check = $pdo->prepare('SELECT COUNT(*) FROM users WHERE username = :username AND id <> :id');
		$check->execute([':username' => $username, ':id' => $id]);
		if ((int)$check->fetchColumn() > 0) respond(['error' => 'Username already exists.'], 422);
		$fields[] = 'username = :username';
		$params[':username'] = $username;
	}

	if (array_key_exists('email', $body)) {
		$email = trim((string)$body['email']);
		if ($email === '') respond(['error' => 'email required'], 422);
		$check = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = :email AND id <> :id');
		$check->execute([':email' => $email, ':id' => $id]);
		if ((int)$check->fetchColumn() > 0) respond(['error' => 'Email already exists.'], 422);
		$fields[] = 'email = :email';
		$params[':email'] = $email;
	}

	if (array_key_exists('age', $body)) {
		$fields[] = 'age = :age';
		$params[':age'] = $body['age'] !== null && $body['age'] !== '' ? (int)$body['age'] : null;
	}

	if (array_key_exists('location', $body)) {
		$fields[] = 'location = :location';
		$params[':location'] = trim((string)$body['location']) ?: null;
	}

	if (array_key_exists('bio', $body)) {
		$fields[] = 'bio = :bio';
		$params[':bio'] = trim((string)$body['bio']) ?: null;
	}

	if (!$fields) respond(['error' => 'no fields to update'], 422);

	$sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id';
	$stmt = $pdo->prepare($sql);
	$stmt->execute($params);

	$stmt = $pdo->prepare('SELECT id, name, username, email, age, location, bio, created_at FROM users WHERE id = :id');
	$stmt->execute([':id' => $id]);
	respond($stmt->fetch());
}

// DELETE single or bulk
if ($method === 'DELETE') {
	if (isset($body['id'])) {
		$stmt = $pdo->prepare('DELETE FROM users WHERE id = :id');
		$stmt->execute([':id' => (int)$body['id']]);
		respond(['deleted' => 1]);
	}

	if (!empty($body['ids']) && is_array($body['ids'])) {
		$ids = array_map('intval', $body['ids']);
		if (empty($ids)) respond(['deleted' => 0]);

		$ph = implode(',', array_fill(0, count($ids), '?'));
		$stmt = $pdo->prepare("DELETE FROM users WHERE id IN ($ph)");
		$stmt->execute($ids);
		respond(['deleted' => $stmt->rowCount()]);
	}

	respond(['error' => 'id or ids required'], 422);
}

respond(['error' => 'method not allowed'], 405);
