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
    echo 'No author IDs provided.';
    exit;
}

$ids = array_map('intval', $ids);
$placeholders = implode(',', array_fill(0, count($ids), '?'));

$stmt = $pdo->prepare("SELECT * FROM authors WHERE id IN ({$placeholders}) ORDER BY id DESC");
$stmt->execute($ids);
$authors = $stmt->fetchAll();

if (empty($authors)) {
    http_response_code(404);
    echo 'No authors found.';
    exit;
}

// Generate Excel file using HTML table format
$filename = 'authors_export_' . date('Y-m-d_His') . '.xls';

header('Content-Type: application/vnd.ms-excel; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Cache-Control: max-age=0');
header('Pragma: public');

// HTML with meta for Excel
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

// Header row
echo '<tr>';
echo '<th>ID</th>';
echo '<th>Name</th>';
echo '<th>Email</th>';
echo '<th>Nationality</th>';
echo '<th>Birth Year</th>';
echo '<th>Bio</th>';
echo '</tr>';

// Data rows
foreach ($authors as $author) {
    echo '<tr>';
    echo '<td class="number">' . (int)$author['id'] . '</td>';
    echo '<td>' . htmlspecialchars($author['name'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($author['email'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td>' . htmlspecialchars($author['nationality'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="number">' . ($author['birth_year'] ?? '') . '</td>';
    echo '<td>' . htmlspecialchars($author['bio'] ?? '', ENT_QUOTES, 'UTF-8') . '</td>';
    echo '</tr>';
}

echo '</table>';
echo '</body>';
echo '</html>';
