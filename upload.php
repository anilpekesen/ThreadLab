<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

if (!isset($_FILES['image']) || !is_uploaded_file($_FILES['image']['tmp_name'])) {
    http_response_code(422);
    echo json_encode(['error' => 'Image is required']);
    exit;
}

$file = $_FILES['image'];
$maxBytes = 8 * 1024 * 1024;

if ($file['size'] > $maxBytes) {
    http_response_code(422);
    echo json_encode(['error' => 'Image is too large']);
    exit;
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($file['tmp_name']);
$extensions = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
];

if (!isset($extensions[$mime])) {
    http_response_code(422);
    echo json_encode(['error' => 'Unsupported image type']);
    exit;
}

$uploadDir = __DIR__ . '/uploads';

if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
    http_response_code(500);
    echo json_encode(['error' => 'Upload directory could not be created']);
    exit;
}

$side = preg_replace('/[^a-z0-9_-]/i', '', $_POST['side'] ?? 'design');
$name = $side . '-' . bin2hex(random_bytes(12)) . '.' . $extensions[$mime];
$target = $uploadDir . '/' . $name;

if (!move_uploaded_file($file['tmp_name'], $target)) {
    http_response_code(500);
    echo json_encode(['error' => 'Upload failed']);
    exit;
}

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$basePath = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/\\');
$url = $scheme . '://' . $host . $basePath . '/uploads/' . $name;

echo json_encode(['url' => $url]);
