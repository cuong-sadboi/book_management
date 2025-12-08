<?php
declare(strict_types=1);

$expectsJson = isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';
if ($expectsJson) {
	header('Content-Type: application/json; charset=utf-8');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
	http_response_code(405);
	echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
	exit;
}

$config = require __DIR__ . '/../config.php';
$dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $config['db_host'], $config['db_name'], $config['db_charset']);
$options = [
	PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
	PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
	PDO::ATTR_EMULATE_PREPARES => false,
];

function respond_error(string $message, int $status, bool $expectsJson): void {
	if ($expectsJson) {
		http_response_code($status);
		echo json_encode(['success' => false, 'error' => $message]);
	} else {
		http_response_code($status);
		echo $message;
	}
	exit;
}

try {
	$pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], $options);
} catch (PDOException $e) {
	respond_error('Cannot connect to database.', 500, $expectsJson);
}

$id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
if ($id <= 0) {
	respond_error('Invalid book id.', 400, $expectsJson);
}

$stmt = $pdo->prepare('SELECT cover_image FROM books WHERE id = :id LIMIT 1');
$stmt->execute([':id' => $id]);
$book = $stmt->fetch();
if (!$book) {
	respond_error('Book not found.', 404, $expectsJson);
}

$pdo->prepare('DELETE FROM books WHERE id = :id')->execute([':id' => $id]);

if ($book['cover_image']) {
	$coverFile = dirname(__DIR__, 2) . '/' . $book['cover_image'];
	if (is_file($coverFile)) {
		@unlink($coverFile);
	}
}

if ($expectsJson) {
	echo json_encode(['success' => true]);
} else {
	header('Location: /book_management/public/index.html?deleted=1', true, 303);
}
