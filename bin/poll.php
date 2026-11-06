<?php
require __DIR__.'/../src/Ahmad.php';
require __DIR__.'/../src/WorkerLock.php';
$c=require __DIR__.'/../config.php';
try { $lock=new WorkerLock($c['db'], 'poller'); } catch (RuntimeException $e) { fwrite(STDERR,$e->getMessage().PHP_EOL); exit(1); }
if (!$c['bale_token']) { fwrite(STDERR,"Set BALE_TOKEN first.\n"); exit(1); }
(new Ahmad($c))->poll();
