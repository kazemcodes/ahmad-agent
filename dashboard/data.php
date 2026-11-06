<?php
declare(strict_types=1);
$config = require __DIR__ . '/../config.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) { http_response_code(403); exit; }
$action = $_POST['action'] ?? $_GET['action'] ?? '';
if ($action !== '') {
    $token = $config['dashboard_token'] ?? '';
    if ($token !== '') {
        $given = $_SERVER['HTTP_X_DASHBOARD_TOKEN'] ?? ($_POST['token'] ?? '');
        if (!hash_equals($token, (string)$given)) { http_response_code(403); echo json_encode(['error'=>'توکن نامعتبر است']); exit; }
    }
    try {
        $db = new PDO('sqlite:'.$config['db'], null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
        $db->exec('PRAGMA busy_timeout=2000');
        $chat = (int)($_POST['chat'] ?? 0);
        if ($action === 'add_roster' && $chat) {
            $names = preg_split('/[\r\n،,]+/u', (string)($_POST['names'] ?? ''));
            $n = 0; foreach ($names as $v) { $v = trim(str_replace(['ي','ك','‌'],['ی','ک',' '], $v)); if ($v !== '') { $db->prepare('INSERT OR IGNORE INTO roster(chat,name) VALUES(?,?)')->execute([$chat,$v]); $n++; } }
            echo json_encode(['ok'=>true,'added'=>$n]); exit;
        }
        if ($action === 'delete_roster' && $chat) { $id = (int)($_POST['id'] ?? 0); $db->prepare('DELETE FROM roster WHERE chat=? AND id=?')->execute([$chat,$id]); echo json_encode(['ok'=>true]); exit; }
        if ($action === 'add_schedule' && $chat) { $wd=(int)$_POST['weekday']; $s=$_POST['start']; $e=$_POST['end']; if (!preg_match('/^([0-6])$/',$wd) || !preg_match('/^([0-2][0-9]:[0-5][0-9])$/',$s) || !preg_match('/^([0-2][0-9]:[0-5][0-9])$/',$e) || $s >= $e) { http_response_code(400); echo json_encode(['error'=>'زمان نامعتبر است']); exit; } $db->prepare('INSERT OR IGNORE INTO schedules(chat,weekday,start,end) VALUES(?,?,?,?)')->execute([$chat,$wd,$s,$e]); echo json_encode(['ok'=>true]); exit; }
        if ($action === 'delete_schedule' && $chat) { $id=(int)$_POST['id']; $db->prepare('DELETE FROM schedules WHERE chat=? AND id=?')->execute([$chat,$id]); echo json_encode(['ok'=>true]); exit; }
        if ($action === 'approve' && $chat) { $id=(int)$_POST['id']; $db->prepare("UPDATE corrections SET status='approved' WHERE chat=? AND id=? AND status='pending'")->execute([$chat,$id]); echo json_encode(['ok'=>true]); exit; }
        http_response_code(400); echo json_encode(['error'=>'اکشن ناشناخته']); exit;
    } catch(Throwable $e) { http_response_code(500); echo json_encode(['error'=>'خطا در انجام اکشن']); exit; }
}
try {
    if (!is_file($config['db'])) { echo json_encode(['ready'=>false,'messages'=>[],'memory'=>[],'stats'=>[]]); exit; }
    $db = new PDO('sqlite:'.$config['db'], null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA query_only=ON; PRAGMA busy_timeout=2000');
    $has = static function(string $table) use ($db): bool { $s=$db->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $s->execute([$table]); return (bool)$s->fetchColumn(); };
    $messages = $has('messages') && $has('observed_users') ? $db->query('SELECT m.name,m.text,m.at,m.chat,m.user_id,u.username FROM messages m LEFT JOIN observed_users u ON u.chat=m.chat AND u.user_id=m.user_id ORDER BY m.id DESC LIMIT 60')->fetchAll(PDO::FETCH_ASSOC) : [];
    $memory = $has('conversation_turns') ? $db->query('SELECT role,content,at,chat,user_id FROM conversation_turns ORDER BY id DESC LIMIT 60')->fetchAll(PDO::FETCH_ASSOC) : [];
    $stats = []; foreach (['messages','roster','attendance','conversation_turns'] as $table) $stats[$table] = $has($table) ? (int)$db->query('SELECT COUNT(*) FROM '.$table)->fetchColumn() : 0;
    $roster = $has('roster') ? $db->query('SELECT id,chat,name,user_id FROM roster ORDER BY chat,name LIMIT 200')->fetchAll(PDO::FETCH_ASSOC) : [];
    $schedules = $has('schedules') ? $db->query('SELECT id,chat,weekday,start,end FROM schedules ORDER BY chat,weekday,start LIMIT 200')->fetchAll(PDO::FETCH_ASSOC) : [];
    $corrections = $has('corrections') ? $db->query("SELECT id,chat,user_id,requested,status FROM corrections WHERE status='pending' ORDER BY id DESC LIMIT 100")->fetchAll(PDO::FETCH_ASSOC) : [];
    $logFile = __DIR__.'/../data/bot.log'; $logs = [];
    if (is_file($logFile)) { $f = fopen($logFile,'rb'); $size=filesize($logFile); fseek($f,max(0,$size-40000)); $raw=stream_get_contents($f); fclose($f); $logs=array_slice(explode("\n",trim($raw)), -80); }
    echo json_encode(['ready'=>true,'messages'=>$messages,'memory'=>$memory,'stats'=>$stats,'logs'=>$logs,'roster'=>$roster,'schedules'=>$schedules,'corrections'=>$corrections], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
} catch(Throwable $e) { http_response_code(500); echo json_encode(['error'=>'خواندن اطلاعات ممکن نشد.']); error_log($e->getMessage()); }
