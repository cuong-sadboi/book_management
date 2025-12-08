<?php
header('Content-Type: application/json; charset=utf-8');

// Kết nối PDO
$config = require __DIR__ . '/config.php';
$dsn = "mysql:host={$config['db_host']};dbname={$config['db_name']};charset={$config['db_charset']}";
$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

function respond_db_error(string $message): void {
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed: ' . $message]);
    exit;
}

if (!extension_loaded('pdo_mysql')) {
    respond_db_error('pdo_mysql extension is missing. Enable it in php.ini.');
}

try {
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], $options);
} catch (PDOException $e) {
    respond_db_error($e->getMessage());
}

$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
if ($id) {
    try {
        $stmt = $pdo->prepare('SELECT * FROM books WHERE id = :id LIMIT 1');
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->execute();
        $book = $stmt->fetch();
        if (!$book) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Book not found.']);
        } else {
            echo json_encode(['success' => true, 'data' => $book]);
        }
    } catch (PDOException $e) {
        respond_db_error('Query failed: ' . $e->getMessage());
    }
    exit;
}

$q = trim($_GET['q'] ?? '');
$limit = max(1, min((int)($_GET['limit'] ?? 10), 100));
$page = max(1, (int)($_GET['page'] ?? 1));
$offset = ($page - 1) * $limit;

$whereClause = '';
$params = [];
$searchColumns = ['isbn', 'title', 'author'];
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
    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM books {$whereClause}");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    $sql = "SELECT * FROM books {$whereClause} ORDER BY id DESC LIMIT :limit OFFSET :offset";
    $stmt = $pdo->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value, PDO::PARAM_STR);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    echo json_encode([
        'success' => true,
        'data' => $stmt->fetchAll(),
        'meta' => [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
        ],
    ]);
} catch (PDOException $e) {
    respond_db_error('Query failed: ' . $e->getMessage());
}