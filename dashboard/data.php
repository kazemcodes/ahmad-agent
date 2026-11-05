<?php
declare(strict_types=1);
$config = require __DIR__ . '/../config.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) { http_response_code(403); exit; }
try {
    if (!is_file($config['db'])) { echo json_encode(['ready'=>false,'messages'=>[],'memory'=>[],'stats'=>[]]); exit; }
    $db = new PDO('sqlite:'.$config['db'], null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA query_only=ON; PRAGMA busy_timeout=2000');
    $has = static function(string $table) use ($db): bool { $s=$db->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $s->execute([$table]); return (bool)$s->fetchColumn(); };
    $messages = $has('messages') && $has('observed_users') ? $db->query('SELECT m.name,m.text,m.at,m.chat,m.user_id,u.username FROM messages m LEFT JOIN observed_users u ON u.chat=m.chat AND u.user_id=m.user_id ORDER BY m.id DESC LIMIT 60')->fetchAll(PDO::FETCH_ASSOC) : [];
    $memory = $has('conversation_turns') ? $db->query('SELECT role,content,at,chat,user_id FROM conversation_turns ORDER BY id DESC LIMIT 60')->fetchAll(PDO::FETCH_ASSOC) : [];
    $stats = []; foreach (['messages','roster','attendance','conversation_turns'] as $table) $stats[$table] = $has($table) ? (int)$db->query('SELECT COUNT(*) FROM '.$table)->fetchColumn() : 0;
    $logFile = __DIR__.'/../data/bot.log'; $logs = [];
    if (is_file($logFile)) { $f = fopen($logFile,'rb'); $size=filesize($logFile); fseek($f,max(0,$size-40000)); $raw=stream_get_contents($f); fclose($f); $logs=array_slice(explode("\n",trim($raw)), -80); }
    echo json_encode(['ready'=>true,'messages'=>$messages,'memory'=>$memory,'stats'=>$stats,'logs'=>$logs], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
} catch(Throwable $e) { http_response_code(500); echo json_encode(['error'=>'خواندن اطلاعات ممکن نشد.']); error_log($e->getMessage()); }
