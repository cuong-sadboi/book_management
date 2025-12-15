<?php
declare(strict_types=1);

// Set timezone to Vietnam
date_default_timezone_set('Asia/Ho_Chi_Minh');

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
    SELECT r.id, u.name as user_name, u.email as user_email, 
           GROUP_CONCAT(b.title SEPARATOR ', ') as book_titles,
           r.rental_date, r.due_date, r.return_date, r.status
    FROM book_rentals r
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN rental_items ri ON ri.rental_id = r.id
    LEFT JOIN books b ON ri.book_id = b.id
    WHERE r.id IN ({$placeholders})
    GROUP BY r.id
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
echo '.date { mso-number-format:"dd/mm/yyyy hh:mm"; }';
echo '</style>';
echo '</head>';
echo '<body>';
echo '<table>';

echo '<tr>';
echo '<th>Rental ID</th>';
echo '<th>User Name</th>';
echo '<th>User Email</th>';
echo '<th>Book Titles</th>';
echo '<th>Rental Date</th>';
echo '<th>Due Date</th>';
echo '<th>Return Date</th>';
echo '<th>Status</th>';
echo '</tr>';

foreach ($rentals as $rental) {
    echo '<tr>';
    echo '<td class="number">' . (int)$rental['id'] . '</td>';
    echo '<td>' . htmlspecialchars($rental['user_name'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($rental['user_email'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($rental['book_titles'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="date">' . htmlspecialchars($rental['rental_date'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="date">' . htmlspecialchars($rental['due_date'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="date">' . htmlspecialchars($rental['return_date'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($rental['status'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '</tr>';
}

echo '</table>';
echo '</body>';
echo '</html>';
