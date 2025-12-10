<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
    exit;
}

$config = require __DIR__ . '/../config.php';
$dsn = sprintf(
    'mysql:host=%s;dbname=%s;charset=%s',
    $config['db_host'],
    $config['db_name'],
    $config['db_charset']
);

$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

function respond_error(string $message, int $status = 400): void {
    http_response_code($status);
    echo json_encode(['success' => false, 'error' => $message]);
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

function resize_image_max(string $path, string $mime, int $maxW = 500, int $maxH = 750): bool {
	$info = @getimagesize($path);
	if (!$info) return false;
	[$w, $h] = $info;
	if ($w <= $maxW && $h <= $maxH) return true;

	$ratio = min($maxW / $w, $maxH / $h, 1);
	$newW = max(1, (int)round($w * $ratio));
	$newH = max(1, (int)round($h * $ratio));

	$src = match ($mime) {
		'image/jpeg' => imagecreatefromjpeg($path),
		'image/png'  => imagecreatefrompng($path),
		'image/webp' => function_exists('imagecreatefromwebp') ? imagecreatefromwebp($path) : null,
		default      => null,
	};
	if (!$src) return false;

	$dst = imagecreatetruecolor($newW, $newH);
	imagealphablending($dst, false);
	imagesavealpha($dst, true);
	if (!imagecopyresampled($dst, $src, 0, 0, 0, 0, $newW, $newH, $w, $h)) return false;

	$saveOk = match ($mime) {
		'image/jpeg' => imagejpeg($dst, $path, 90),
		'image/png'  => imagepng($dst, $path, 6),
		'image/webp' => function_exists('imagewebp') ? imagewebp($dst, $path, 90) : false,
		default      => false,
	};
	imagedestroy($src);
	imagedestroy($dst);
	return (bool)$saveOk;
}

try {
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], $options);
} catch (PDOException $e) {
    respond_error('Không thể kết nối database.', 500);
}

$data = array_map(
    static fn($value) => is_string($value) ? trim($value) : $value,
    $_POST
);

foreach (['isbn', 'title', 'price', 'stock', 'status'] as $field) {
    if (empty($data[$field]) && $data[$field] !== '0') {
        respond_error("Thiếu thông tin bắt buộc: {$field}");
    }
}

$allowedStatuses = ['published', 'out_of_print'];
$chosenStatus = strtolower($data['status'] ?? '');
if (!in_array($chosenStatus, $allowedStatuses, true)) {
    respond_error('Trạng thái không hợp lệ. Các giá trị hợp lệ: ' . implode(', ', $allowedStatuses));
}

$coverPath = null;
if (!empty($_FILES['cover_image']['name'])) {
    $file = $_FILES['cover_image'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        respond_error('Đã xảy ra lỗi khi tải lên ảnh bìa.');
    }
    if ($file['size'] > 2 * 1024 * 1024) {
        respond_error('Ảnh bìa phải có kích thước nhỏ hơn hoặc bằng 2MB.');
    }
    $mime = detect_uploaded_mime($file['tmp_name']);
    if (!$mime) {
        respond_error('Unable to detect cover mime type.');
    }
    $allowedMimes = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];
    if (!isset($allowedMimes[$mime])) {
        respond_error('Only PNG, JPG, or WebP images are allowed.');
    }
    $uploadRoot = dirname(__DIR__, 2) . '/static/covers';
    if (!is_dir($uploadRoot) && !mkdir($uploadRoot, 0775, true) && !is_dir($uploadRoot)) {
        respond_error('Không thể chuẩn bị thư mục tải lên.', 500);
    }
    $filename = sprintf('%s.%s', bin2hex(random_bytes(16)), $allowedMimes[$mime]);
    $destination = $uploadRoot . '/' . $filename;
    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        respond_error('Không thể lưu ảnh bìa.', 500);
    }
    if (!resize_image_max($destination, $mime)) {
        @unlink($destination);
        respond_error('Không thể xử lý kích thước ảnh bìa.', 500);
    }
    $coverPath = 'static/covers/' . $filename;
}

$sql = "INSERT INTO books
    (isbn, title, author, publisher, year, genre, price, stock, status, is_rental, shelf_location, cover_image)
    VALUES
    (:isbn, :title, :author, :publisher, :year, :genre, :price, :stock, :status, :is_rental, :shelf_location, :cover_image)";

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
        ':status' => $chosenStatus,
        ':is_rental' => isset($data['is_rental']) ? 1 : 0,
        ':shelf_location' => $data['shelf_location'] ?: null,
        ':cover_image' => $coverPath,
    ]);
    echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
} catch (PDOException $e) {
    $message = $e->errorInfo[1] === 1062 ? 'ISBN đã tồn tại.' : $e->getMessage();
    respond_error('Không thể lưu sách: ' . $message, 500);
}
