<?php
require __DIR__.'/../src/Ahmad.php';
$c=require __DIR__.'/../config.php';
if (!$c['bale_token']) { fwrite(STDERR,"Set BALE_TOKEN first.\n"); exit(1); }
(new Ahmad($c))->poll();
