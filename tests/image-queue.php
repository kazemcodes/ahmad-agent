<?php
declare(strict_types=1);
require __DIR__.'/../src/ImageQueue.php';
require __DIR__.'/../src/WorkerLock.php';
$dir=sys_get_temp_dir().'/ahmad-test-'.bin2hex(random_bytes(5)); mkdir($dir);
try {
    $q=new ImageQueue($dir.'/test.sqlite');
    // Enqueue first job
    $r1=$q->enqueue(['update_id'=>100], 1, 7, 10, 'a mountain');
    if ($r1['deduplicated'] || $r1['position']!==1) throw new RuntimeException('first enqueue wrong: '.json_encode($r1));
    // Duplicate (same user+chat, different update) → deduplicated, same id
    $r2=$q->enqueue(['update_id'=>101], 1, 7, 11, 'a mountain again');
    if (!$r2['deduplicated'] || $r2['id']!==$r1['id']) throw new RuntimeException('dedupe failed: '.json_encode($r2));
    // Same user, different chat → new job
    $r3=$q->enqueue(['update_id'=>102], 2, 7, 10, 'a river');
    if ($r3['deduplicated'] || $r3['id']===$r1['id']) throw new RuntimeException('cross-chat dedupe wrong');
    // Different user → new job
    $r4=$q->enqueue(['update_id'=>103], 1, 8, 10, 'a forest');
    if ($r4['deduplicated']) throw new RuntimeException('cross-user dedupe wrong');
    // Same update_id retried → deduplicated to same job
    $r5=$q->enqueue(['update_id'=>100], 9, 9, 99, 'retry');
    if (!$r5['deduplicated'] || $r5['id']!==$r1['id']) throw new RuntimeException('update retry dedupe wrong');

    // claim atomically: first claim gets job 1, second claim gets job 3 (id order)
    $j1=$q->claimNext(300);
    if ($j1===null || (int)$j1['id']!==$r1['id'] || $j1['status']!=='processing') throw new RuntimeException('claimNext 1 wrong');
    $j2=$q->claimNext(300);
    if ($j2===null || (int)$j2['id']!==$r3['id']) throw new RuntimeException('claimNext 2 wrong');
    $j3=$q->claimNext(300);
    if ($j3===null || (int)$j3['id']!==$r4['id']) throw new RuntimeException('claimNext 3 wrong');
    if ($q->claimNext(300)!==null) throw new RuntimeException('queue should be empty');

    // complete job 1 → new job for same user+chat allowed
    $q->complete($r1['id']);
    $r6=$q->enqueue(['update_id'=>104], 1, 7, 10, 'new picture');
    if ($r6['deduplicated']) throw new RuntimeException('completed job should not block');

    // fail with retry backoff → status back to queued, available later
    $j4=$q->claimNext(300);
    $q->fail((int)$j4['id'], 'boom', 30);
    $row=$q->get((int)$j4['id']);
    if ($row['status']!=='queued' || (int)$row['available_at'] <= time()) throw new RuntimeException('retry backoff wrong');
    // fail final
    $q->fail((int)$j4['id'], 'final', null);
    $row=$q->get((int)$j4['id']);
    if ($row['status']!=='failed') throw new RuntimeException('final fail wrong');

    // WorkerLock roles are independent
    $db=$dir.'/locks.sqlite';
    $lock1=new WorkerLock($db, 'poller');
    $lock2=new WorkerLock($db, 'worker');
    $lock3=new WorkerLock($db, 'image-worker', 1);
    $lock4=new WorkerLock($db, 'image-worker', 2);
    $threw=false;
    try { $dup=new WorkerLock($db, 'poller'); } catch(RuntimeException $e) { $threw=true; }
    if (!$threw) throw new RuntimeException('duplicate poller lock should throw');
    $threw=false;
    try { $dup2=new WorkerLock($db, 'image-worker', 1); } catch(RuntimeException $e) { $threw=true; }
    if (!$threw) throw new RuntimeException('duplicate image-worker slot should throw');

    echo "Image queue and multi-worker lock checks passed.\n";
} finally { unset($q,$lock1,$lock2,$lock3,$lock4,$db); foreach(glob($dir.'/*') as $file) @unlink($file); @rmdir($dir); }
