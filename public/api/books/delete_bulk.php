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

$payload = json_decode(file_get_contents('php://input'), true);
$ids = array_filter(array_map('intval', $payload['ids'] ?? []));
if (!$ids) {
	respond_error('No book ids provided.', 400, $expectsJson);
}

try {
	$pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], $options);
} catch (PDOException $e) {
	respond_error('Cannot connect to database.', 500, $expectsJson);
}

$inPlaceholders = implode(',', array_fill(0, count($ids), '?'));
$stmt = $pdo->prepare("SELECT id, cover_image FROM books WHERE id IN ({$inPlaceholders})");
$stmt->execute($ids);
$books = $stmt->fetchAll();
if (!$books) {
	respond_error('No matching books found.', 404, $expectsJson);
}

$pdo->prepare("DELETE FROM books WHERE id IN ({$inPlaceholders})")->execute($ids);

foreach ($books as $book) {
	if (!empty($book['cover_image'])) {
		$path = dirname(__DIR__, 2) . '/' . $book['cover_image'];
		if (is_file($path)) {
			@unlink($path);
		}
	}
}

if ($expectsJson) {
	echo json_encode(['success' => true, 'deleted' => count($books)]);
} else {
	header('Location: /book_management/public/index.html?deleted=' . count($books), true, 303);
}
