<?php
declare(strict_types=1);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo 'Method not allowed.';
    exit;
}

$config = require __DIR__ . '/../config.php';
$dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $config['db_host'], $config['db_name'], $config['db_charset']);
$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

try {
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], $options);
} catch (PDOException $e) {
    http_response_code(500);
    echo 'Cannot connect to database.';
    exit;
}

$idsJson = $_POST['ids'] ?? '[]';
$ids = json_decode($idsJson, true);

if (!is_array($ids) || empty($ids)) {
    http_response_code(400);
    echo 'No rental IDs provided.';
    exit;
}

$ids = array_map('intval', $ids);
$placeholders = implode(',', array_fill(0, count($ids), '?'));

$stmt = $pdo->prepare("
    SELECT r.*, u.name as user_name, u.email as user_email,
           b.title as book_title, b.isbn as book_isbn, b.author as book_author
    FROM book_rentals r
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN books b ON r.book_id = b.id
    WHERE r.id IN ({$placeholders})
    ORDER BY r.id DESC
");
$stmt->execute($ids);
$rentals = $stmt->fetchAll();

if (empty($rentals)) {
    http_response_code(404);
    echo 'No rentals found.';
    exit;
}

$filename = 'rentals_export_' . date('Y-m-d_His') . '.xls';

header('Content-Type: application/vnd.ms-excel; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Cache-Control: max-age=0');
header('Pragma: public');

echo '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
echo '<head>';
echo '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">';
echo '<style>';
echo 'table { border-collapse: collapse; }';
echo 'th { background-color: #4472C4; color: white; font-weight: bold; padding: 8px; border: 1px solid #000; text-align: center; }';
echo 'td { padding: 6px; border: 1px solid #ccc; vertical-align: middle; }';
echo '.number { text-align: right; mso-number-format:"\#\,\#\#0"; }';
echo '.text { mso-number-format:"\@"; }';
echo '</style>';
echo '</head>';
echo '<body>';
echo '<table>';

echo '<tr>';
echo '<th>ID</th>';
echo '<th>User Name</th>';
echo '<th>User Email</th>';
echo '<th>Book Title</th>';
echo '<th>Book ISBN</th>';
echo '<th>Book Author</th>';
echo '<th>Rental Date</th>';
echo '<th>Due Date</th>';
echo '<th>Return Date</th>';
echo '<th>Status</th>';
echo '<th>Notes</th>';
echo '</tr>';

foreach ($rentals as $rental) {
    echo '<tr>';
    echo '<td class="number">' . (int)$rental['id'] . '</td>';
    echo '<td>' . htmlspecialchars($rental['user_name'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($rental['user_email'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($rental['book_title'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($rental['book_isbn'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($rental['book_author'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($rental['rental_date'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($rental['due_date'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($rental['return_date'] ?? '-', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars(ucfirst($rental['status'] ?? ''), ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($rental['notes'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '</tr>';
}

echo '</table>';
echo '</body>';
echo '</html>';
