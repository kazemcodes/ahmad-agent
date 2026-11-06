<?php
/**
 * Dedicated image-generation worker.
 *
 * Run one per IMAGE_WORKERS slot (default 2):
 *   php bin/image-worker.php           # slot 1
 *   php bin/image-worker.php 2         # slot 2
 *
 * Each slot has its own lock, so you can run several in parallel;
 * the ImageQueue claims jobs atomically (BEGIN IMMEDIATE), so two
 * workers never generate the same image.
 */
require __DIR__.'/../src/Ahmad.php';
require __DIR__.'/../src/WorkerLock.php';
$c=require __DIR__.'/../config.php';
$slot = max(1, (int)($argv[1] ?? 1));
try { $lock=new WorkerLock($c['db'], 'image-worker', $slot); } catch (RuntimeException $e) { fwrite(STDERR,$e->getMessage().PHP_EOL); exit(1); }
$bot=new Ahmad($c);
while (true) {
    try {
        if (!$bot->workImageOne()) sleep(1);
    } catch(Throwable $e) { error_log('[ahmad] image-worker.error '.$e->getMessage()); sleep(3); }
}
