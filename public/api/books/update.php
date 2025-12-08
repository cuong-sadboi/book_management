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

function detect_uploaded_mime(string $path): ?string {
	if (class_exists('finfo')) {
		$finfo = new finfo(FILEINFO_MIME_TYPE);
		return $finfo->file($path) ?: null;
	}
	if (function_exists('mime_content_type')) {
		return mime_content_type($path) ?: null;
	}
	$info = @getimagesize($path);
	return $info['mime'] ?? null;
}

try {
	$pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], $options);
} catch (PDOException $e) {
	respond_error('Cannot connect to database.', 500, $expectsJson);
}

$data = array_map(static fn($value) => is_string($value) ? trim($value) : $value, $_POST);
$id = isset($data['id']) ? (int)$data['id'] : 0;
if ($id <= 0) {
	respond_error('Invalid book id.', 400, $expectsJson);
}

foreach (['isbn', 'title', 'price', 'stock', 'status'] as $field) {
	if ($data[$field] === null || $data[$field] === '') {
		respond_error("Missing required field: {$field}.", 400, $expectsJson);
	}
}

$allowedStatuses = ['published', 'out_of_print'];
$status = strtolower((string)$data['status']);
if (!in_array($status, $allowedStatuses, true)) {
	respond_error('Invalid status value.', 400, $expectsJson);
}

$stmt = $pdo->prepare('SELECT cover_image FROM books WHERE id = :id LIMIT 1');
$stmt->execute([':id' => $id]);
$current = $stmt->fetch();
if (!$current) {
	respond_error('Book not found.', 404, $expectsJson);
}
$coverPath = $current['cover_image'];

if (!empty($_FILES['cover_image']['tmp_name'])) {
	$file = $_FILES['cover_image'];
	if ($file['error'] !== UPLOAD_ERR_OK) {
		respond_error('Cover upload failed.', 400, $expectsJson);
	}
	if ($file['size'] > 2 * 1024 * 1024) {
		respond_error('Cover image must be 2MB or smaller.', 400, $expectsJson);
	}
	$mime = detect_uploaded_mime($file['tmp_name']);
	$allowedMimes = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
	if (!$mime || !isset($allowedMimes[$mime])) {
		respond_error('Only PNG, JPG, or WebP images are allowed.', 400, $expectsJson);
	}
	$uploadRoot = dirname(__DIR__, 2) . '/static/covers';
	if (!is_dir($uploadRoot) && !mkdir($uploadRoot, 0775, true) && !is_dir($uploadRoot)) {
		respond_error('Unable to prepare upload directory.', 500, $expectsJson);
	}
	$filename = sprintf('%s.%s', bin2hex(random_bytes(16)), $allowedMimes[$mime]);
	$destination = $uploadRoot . '/' . $filename;
	if (!move_uploaded_file($file['tmp_name'], $destination)) {
		respond_error('Unable to store cover image.', 500, $expectsJson);
	}
	if ($coverPath && is_file(dirname(__DIR__, 2) . '/' . $coverPath)) {
		@unlink(dirname(__DIR__, 2) . '/' . $coverPath);
	}
	$coverPath = 'static/covers/' . $filename;
}

$sql = "UPDATE books SET
	isbn = :isbn,
	title = :title,
	author = :author,
	publisher = :publisher,
	year = :year,
	genre = :genre,
	price = :price,
	stock = :stock,
	status = :status,
	is_rental = :is_rental,
	shelf_location = :shelf_location,
	cover_image = :cover_image
	WHERE id = :id";

try {
	$stmt = $pdo->prepare($sql);
	$stmt->execute([
		':isbn' => $data['isbn'],
		':title' => $data['title'],
		':author' => $data['author'] ?: null,
		':publisher' => $data['publisher'] ?: null,
		':year' => $data['year'] !== '' ? (int)$data['year'] : null,
		':genre' => $data['genre'] ?: null,
		':price' => (float)$data['price'],
		':stock' => (int)$data['stock'],
		':status' => $status,
		':is_rental' => isset($data['is_rental']) ? 1 : 0,
		':shelf_location' => $data['shelf_location'] ?: null,
		':cover_image' => $coverPath,
		':id' => $id,
	]);

	if ($expectsJson) {
		echo json_encode(['success' => true]);
	} else {
		header('Location: /book_management/public/index.html?updated=1', true, 303);
	}
} catch (PDOException $e) {
	$message = $e->errorInfo[1] === 1062 ? 'ISBN already exists.' : $e->getMessage();
	respond_error('Unable to update book: ' . $message, 500, $expectsJson);
}