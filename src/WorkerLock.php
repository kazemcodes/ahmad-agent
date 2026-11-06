<?php
declare(strict_types=1);
final class WorkerLock
{
    private $handle;
    public function __construct(string $database)
    {
        $dir=dirname($database); if (!is_dir($dir)) mkdir($dir,0700,true);
        $this->handle=fopen($database.'.worker.lock','c');
        if ($this->handle===false || !flock($this->handle,LOCK_EX | LOCK_NB)) throw new RuntimeException('Another bot poller or worker is already running for this database.');
    }
    public function __destruct() { if (is_resource($this->handle)) { flock($this->handle,LOCK_UN); fclose($this->handle); } }
}
