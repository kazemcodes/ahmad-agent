<?php
declare(strict_types=1);

/**
 * Named-role file lock.
 *
 * Each process family gets its own slot file next to the database:
 *  - poller       (bin/poll.php)       → <.poller.lock>
 *  - worker       (bin/worker.php)     → <.worker.lock>   (legacy name kept)
 *  - image-worker (bin/image-worker.php) → <.image.worker.1.lock>, <.image.worker.2.lock> …
 *
 * This is what makes the bot "not single-threaded": the poller only
 * enqueues updates, workers process the fast queue concurrently, and
 * image workers process the slow image queue concurrently. Roles do
 * not block each other, but each slot is exclusive within its role so
 * you cannot accidentally run the same worker twice.
 *
 * For backward compatibility, passing an instance as the database path
 * (WorkerLock($c['db'])) still yields the legacy 'worker' lock.
 */
final class WorkerLock
{
    private $handle;

    public function __construct(string $database, string $role = 'worker', int $slot = 1)
    {
        if ($role === 'worker' && $slot === 1) {
            $file = $database . '.worker.lock';
        } else {
            $file = $database . '.' . $role . ($slot > 1 ? '.' . $slot : '') . '.lock';
        }
        $dir = dirname($file);
        if (!is_dir($dir)) mkdir($dir, 0700, true);
        $this->handle = fopen($file, 'c');
        if ($this->handle === false || !flock($this->handle, LOCK_EX | LOCK_NB)) {
            throw new RuntimeException(
                "Another {$role} process is already running for this database " .
                "(slot {$slot}). " .
                ($role === 'image-worker'
                    ? 'Increase IMAGE_WORKERS to run more image workers, or stop an existing one.'
                    : 'Stop the existing process before starting another one.')
            );
        }
    }

    public function __destruct()
    {
        if (is_resource($this->handle)) {
            flock($this->handle, LOCK_UN);
            fclose($this->handle);
        }
    }
}
