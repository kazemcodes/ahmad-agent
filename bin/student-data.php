<?php
declare(strict_types=1);
$config = require __DIR__.'/../config.php';
if ($argc !== 3 || !in_array($argv[1], ['export', 'delete'], true) || !ctype_digit($argv[2])) {
    fwrite(STDERR, "Usage: php bin/student-data.php export|delete BALE_USER_ID\n"); exit(1);
}
if (!is_file($config['db'])) { fwrite(STDERR, "Database not found.\n"); exit(1); }
$db = new PDO('sqlite:'.$config['db'], null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$id = (int)$argv[2];
if ($argv[1] === 'export') {
    $result = [];
    foreach (['messages', 'conversation_turns', 'roster', 'corrections', 'observed_users', 'student_notes'] as $table) {
        $exists=$db->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $exists->execute([$table]);
        if (!$exists->fetchColumn()) continue;
        $q=$db->prepare('SELECT * FROM '.$table.' WHERE user_id=?'); $q->execute([$id]); $result[$table]=$q->fetchAll(PDO::FETCH_ASSOC);
    }
    $q=$db->prepare('SELECT a.* FROM attendance a JOIN roster r ON r.id=a.student WHERE r.user_id=?'); $q->execute([$id]); $result['attendance']=$q->fetchAll(PDO::FETCH_ASSOC);
    $exists=$db->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_attendance'")->fetchColumn(); if ($exists) { $q=$db->prepare('SELECT a.* FROM session_attendance a JOIN roster r ON r.id=a.student WHERE r.user_id=?'); $q->execute([$id]); $result['session_attendance']=$q->fetchAll(PDO::FETCH_ASSOC); }
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE), PHP_EOL;
    exit;
}
fwrite(STDERR, "Deletion removes messages, conversation, corrections, attendance and roster entries for user $id. Type DELETE to continue: ");
if (trim(fgets(STDIN)) !== 'DELETE') { fwrite(STDERR, "Cancelled.\n"); exit(1); }
$db->beginTransaction();
try {
    $exists=$db->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_attendance'")->fetchColumn(); if ($exists) { $q=$db->prepare('DELETE FROM session_attendance WHERE student IN (SELECT id FROM roster WHERE user_id=?)'); $q->execute([$id]); }
    $q=$db->prepare('DELETE FROM attendance WHERE student IN (SELECT id FROM roster WHERE user_id=?)'); $q->execute([$id]);
    foreach (['messages','conversation_turns','corrections','roster','observed_users', 'student_notes'] as $table) {
        $exists=$db->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $exists->execute([$table]);
        if ($exists->fetchColumn()) { $q=$db->prepare('DELETE FROM '.$table.' WHERE user_id=?'); $q->execute([$id]); }
    }
    $db->commit(); fwrite(STDERR, "Student data deleted. Backups and external provider data are not affected.\n");
} catch (Throwable $e) { $db->rollBack(); throw $e; }
