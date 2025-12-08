<?php
// Simple REST-like API for books (updated: supports is_rental and shelf_location)
header('Content-Type: application/json; charset=utf-8');
// Allow CORS for local dev (tùy chỉnh khi deploy)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

require __DIR__ . '/db.php';

// helper
function json($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    // Params: page, per_page, q, sort, dir, genre, author, in_stock (1/0), is_rental (1/0), shelf_location
    $page = max(1, (int)($_GET['page'] ?? 1));
    $per_page = min(100, max(1, (int)($_GET['per_page'] ?? 10)));
    $q = trim($_GET['q'] ?? '');
    $sort = in_array($_GET['sort'] ?? 'id', ['id','isbn','title','author','year','price','stock','created_at']) ? $_GET['sort'] : 'id';
    $dir = (strtolower($_GET['dir'] ?? 'desc') === 'asc') ? 'ASC' : 'DESC';
    $genre = $_GET['genre'] ?? null;
    $author = $_GET['author'] ?? null;
    $in_stock = isset($_GET['in_stock']) ? (int)$_GET['in_stock'] : null;
    $is_rental = isset($_GET['is_rental']) ? (int)$_GET['is_rental'] : null;
    $shelf_location = $_GET['shelf_location'] ?? null;

    $where = [];
    $params = [];

    if ($q !== '') {
        $where[] = "(isbn LIKE :q OR title LIKE :q OR author LIKE :q)";
        $params[':q'] = "%$q%";
    }
    if ($genre !== null && $genre !== '') {
        $where[] = "genre = :genre";
        $params[':genre'] = $genre;
    }
    if ($author !== null && $author !== '') {
        $where[] = "author LIKE :author";
        $params[':author'] = "%$author%";
    }
    if ($in_stock !== null && ($in_stock === 0 || $in_stock === 1)) {
        if ($in_stock === 1) $where[] = "stock > 0";
        else $where[] = "stock <= 0";
    }
    if ($is_rental !== null && ($is_rental === 0 || $is_rental === 1)) {
        $where[] = "is_rental = :is_rental";
        $params[':is_rental'] = $is_rental;
    }
    if ($shelf_location !== null && $shelf_location !== '') {
        $where[] = "shelf_location LIKE :shelf_location";
        $params[':shelf_location'] = "%$shelf_location%";
    }

    $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    // total count
    $stmt = $pdo->prepare("SELECT COUNT(*) as c FROM books $whereSql");
    $stmt->execute($params);
    $total = (int)$stmt->fetchColumn();

    $offset = ($page - 1) * $per_page;
    $sql = "SELECT * FROM books $whereSql ORDER BY $sort $dir LIMIT :limit OFFSET :offset";
    $stmt = $pdo->prepare($sql);
    foreach ($params as $k=>$v) $stmt->bindValue($k, $v);
    $stmt->bindValue(':limit', $per_page, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $data = $stmt->fetchAll();

    json([
        'data' => $data,
        'meta' => [
            'total' => $total,
            'per_page' => $per_page,
            'current_page' => $page,
            'last_page' => (int)ceil($total / $per_page),
        ],
    ]);
}

// read raw JSON body for POST/PUT/DELETE
$body = json_decode(file_get_contents('php://input'), true);

// CREATE
if ($method === 'POST') {
    $fields = ['isbn','title','author','publisher','year','genre','price','stock','status','is_rental','shelf_location'];
    $data = [];
    foreach ($fields as $f) {
        $data[$f] = $body[$f] ?? null;
    }
    if (empty($data['isbn']) || empty($data['title'])) {
        json(['error'=>'isbn and title required'], 422);
    }
    $sql = "INSERT INTO books (isbn,title,author,publisher,year,genre,price,stock,status,is_rental,shelf_location)
            VALUES (:isbn, :title, :author, :publisher, :year, :genre, :price, :stock, :status, :is_rental, :shelf_location)";
    $stmt = $pdo->prepare($sql);
    try {
        $stmt->execute([
            ':isbn'=>$data['isbn'],
            ':title'=>$data['title'],
            ':author'=>$data['author'],
            ':publisher'=>$data['publisher'],
            ':year'=>$data['year'] ? (int)$data['year'] : null,
            ':genre'=>$data['genre'],
            ':price'=>$data['price'] ?? 0,
            ':stock'=>$data['stock'] ?? 0,
            ':status'=>$data['status'] ?? 'published',
            ':is_rental'=>!empty($data['is_rental']) ? 1 : 0,
            ':shelf_location'=>$data['shelf_location'] ?? null,
        ]);
    } catch (Exception $e) {
        json(['error'=>'insert failed','detail'=>$e->getMessage()], 500);
    }
    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare("SELECT * FROM books WHERE id = :id");
    $stmt->execute([':id'=>$id]);
    $row = $stmt->fetch();
    json($row, 201);
}

// UPDATE
if ($method === 'PUT') {
    if (!isset($body['id'])) json(['error'=>'id required'], 422);
    $id = (int)$body['id'];
    $allowed = ['isbn','title','author','publisher','year','genre','price','stock','status','is_rental','shelf_location'];
    $sets = [];
    $params = [':id'=>$id];
    foreach ($allowed as $col) {
        if (array_key_exists($col, $body)) {
            $sets[] = "$col = :$col";
            if ($col === 'year' || $col === 'stock') $params[":$col"] = (int)$body[$col];
            elseif ($col === 'is_rental') $params[":$col"] = !empty($body[$col]) ? 1 : 0;
            else $params[":$col"] = $body[$col];
        }
    }
    if (!$sets) json(['error'=>'no fields to update'], 422);
    $sql = "UPDATE books SET " . implode(', ', $sets) . " WHERE id = :id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $stmt = $pdo->prepare("SELECT * FROM books WHERE id = :id");
    $stmt->execute([':id'=>$id]);
    json($stmt->fetch());
}

// DELETE (single id or bulk ids list)
if ($method === 'DELETE') {
    // accept { "id": 1 } or { "ids": [1,2,3] }
    if (isset($body['id'])) {
        $stmt = $pdo->prepare("DELETE FROM books WHERE id = :id");
        $stmt->execute([':id' => (int)$body['id']]);
        json(['deleted' => 1]);
    } elseif (!empty($body['ids']) && is_array($body['ids'])) {
        $ids = array_map('intval', $body['ids']);
        if (empty($ids)) json(['deleted' => 0]);
        // build placeholders
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("DELETE FROM books WHERE id IN ($placeholders)");
        $stmt->execute($ids);
        json(['deleted' => $stmt->rowCount()]);
    } else {
        json(['error'=>'id or ids required'], 422);
    }
}

json(['error'=>'method not allowed'], 405);