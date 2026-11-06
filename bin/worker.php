<?php
require __DIR__.'/../src/Ahmad.php';
require __DIR__.'/../src/WorkerLock.php';
$c=require __DIR__.'/../config.php';
try { $lock=new WorkerLock($c['db'], 'worker'); } catch (RuntimeException $e) { fwrite(STDERR,$e->getMessage().PHP_EOL); exit(1); }
$bot=new Ahmad($c);
while (true) { try { if (!$bot->workOne()) sleep(1); } catch(Throwable $e) { error_log('[ahmad] worker.error '.$e->getMessage()); sleep(3); } }
