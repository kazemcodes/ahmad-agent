<?php
declare(strict_types=1);
require __DIR__.'/../src/RequestQueue.php';
$dir=sys_get_temp_dir().'/ahmad-test-'.bin2hex(random_bytes(5)); mkdir($dir);
try {
    $queue=new RequestQueue($dir.'/test.sqlite');
    $queue->enqueue(['update_id'=>42,'message'=>['text'=>'test']]);
    $queue->enqueue(['update_id'=>42,'message'=>['text'=>'duplicate']]);
    if ($queue->offset()!==43) throw new RuntimeException('incorrect offset');
    $handled=[]; $queue->processOne(function($update) use (&$handled) { $handled[]=$update['message']['text']; });
    if ($handled!==['test'] || $queue->processOne(fn()=>null)) throw new RuntimeException('duplicate or missing update');
    if (!$queue->allow('chat',123,2,60) || !$queue->allow('chat',123,2,60) || $queue->allow('chat',123,2,60) || !$queue->allow('chat',124,2,60) || !$queue->allow('image',123,2,60)) throw new RuntimeException('incorrect rate limit');
    $queue->enqueue(['update_id'=>43]); $queue->processOne(function(){throw new RuntimeException('simulated failure');});
    $db=new PDO('sqlite:'.$dir.'/test.sqlite'); $row=$db->query('SELECT status,attempts FROM request_queue WHERE id=43')->fetch(PDO::FETCH_ASSOC);
    if ($row['status']!=='pending' || (int)$row['attempts']!==1) throw new RuntimeException('failure not queued for retry');
    echo "Queue and rate limit checks passed.\n";
} finally { unset($db,$queue); foreach(glob($dir.'/*') as $file) unlink($file); rmdir($dir); }
