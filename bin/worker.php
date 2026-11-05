<?php
require __DIR__.'/../src/Ahmad.php';
$c=require __DIR__.'/../config.php';
$bot=new Ahmad($c);
while (true) { try { if (!$bot->workOne()) sleep(1); } catch(Throwable $e) { error_log('[ahmad] worker.error '.$e->getMessage()); sleep(3); } }
