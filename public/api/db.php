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

// Hàm lấy số lượng sách đang được thuê theo book_id
function getRentedQuantities($pdo) {
    $result = [];
    
    // Query trực tiếp từ bảng rental_items với status = 'active' hoặc 'overdue'
    try {
        $sql = "SELECT book_id, SUM(quantity) as rented_quantity 
                FROM rental_items 
                WHERE status IN ('active', 'overdue')
                GROUP BY book_id";
        $stmt = $pdo->query($sql);
        while ($row = $stmt->fetch()) {
            if (!empty($row['book_id'])) {
                $result[$row['book_id']] = (int)$row['rented_quantity'];
            }
        }
    } catch (PDOException $e) {
        // Log error for debugging
        error_log('getRentedQuantities error: ' . $e->getMessage());
    }
    
    return $result;
}

// Hàm lấy tổng stock ban đầu từ bảng riêng nếu có
function getInitialStocks($pdo) {
    $result = [];
    
    // Thử tìm bảng book_stock hoặc initial_stock
    try {
        $sql = "SELECT book_id, initial_stock FROM book_stock";
        $stmt = $pdo->query($sql);
        while ($row = $stmt->fetch()) {
            $result[$row['book_id']] = (int)$row['initial_stock'];
        }
        if (!empty($result)) {
            return $result;
        }
    } catch (PDOException $e) {
        // Bảng không tồn tại
    }
    
    // Thử cột total_stock hoặc initial_stock trong bảng books
    try {
        $sql = "SELECT id, COALESCE(total_stock, initial_stock) as init_stock FROM books WHERE total_stock IS NOT NULL OR initial_stock IS NOT NULL";
        $stmt = $pdo->query($sql);
        while ($row = $stmt->fetch()) {
            if ($row['init_stock'] !== null) {
                $result[$row['id']] = (int)$row['init_stock'];
            }
        }
    } catch (PDOException $e) {
        // Không có cột total_stock/initial_stock
    }
    
    return $result;
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
            $rentedQtys = getRentedQuantities($pdo);
            $rentedQty = $rentedQtys[$book['id']] ?? 0;
            $currentStock = (int)($book['stock'] ?? 0);
            
            $book['rented_quantity'] = $rentedQty;
            $book['total_stock'] = $currentStock + $rentedQty;
            $book['available_stock'] = $currentStock;
            
            echo json_encode(['success' => true, 'data' => $book]);
        }
    } catch (PDOException $e) {
        respond_db_error('Query failed: ' . $e->getMessage());
    }
    exit;
}

$q = trim($_GET['q'] ?? '');
$limit = max(1, min((int)($_GET['limit'] ?? 10), 10000));
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
    
    $books = $stmt->fetchAll();
    
    // Lấy số lượng sách đang được thuê
    $rentedQtys = getRentedQuantities($pdo);
    
    foreach ($books as &$book) {
        $bookId = $book['id'];
        $rentedQty = $rentedQtys[$bookId] ?? 0;
        $currentStock = (int)($book['stock'] ?? 0);
        
        // total_stock = stock hiện tại + số đang thuê (vì stock đã bị trừ khi cho thuê)
        $totalStock = $currentStock + $rentedQty;
        
        $book['rented_quantity'] = $rentedQty;
        $book['total_stock'] = $totalStock;
        $book['available_stock'] = $currentStock;
    }
    unset($book);

    echo json_encode([
        'success' => true,
        'data' => $books,
        'meta' => [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
        ],
    ]);
} catch (PDOException $e) {
    respond_db_error('Query failed: ' . $e->getMessage());
}