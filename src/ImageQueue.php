<?php
declare(strict_types=1);

/**
 * Persistent queue for slow image generation jobs.
 *
 * Image generation can take 10–60s. If it runs inside the normal
 * update queue (RequestQueue::processOne) the poller/worker is blocked
 * for that long and every other chat in every group waits behind it,
 * which also makes users send the request again.
 *
 * This queue is processed by dedicated image-worker processes
 * (bin/image-worker.php), so image latency only affects the image
 * queue and never the fast paths (attendance, chat, commands).
 *
 * One active (queued|processing) job per (chat, user) at a time:
 * a repeated identical request while one is running is deduplicated
 * instead of creating a second generation.
 */
final class ImageQueue
{
    private PDO $db;

    public function __construct(string $path)
    {
        if (!is_dir(dirname($path))) mkdir(dirname($path), 0700, true);
        $this->db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $this->db->exec(
            'PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; ' .
            "CREATE TABLE IF NOT EXISTS image_jobs (" .
            'id INTEGER PRIMARY KEY, ' .
            'update_id INTEGER UNIQUE, ' .
            'chat INTEGER NOT NULL, ' .
            'user_id INTEGER NOT NULL, ' .
            'message_id INTEGER, ' .
            'prompt TEXT NOT NULL, ' .
            "status TEXT NOT NULL DEFAULT 'queued', " .
            'attempts INTEGER NOT NULL DEFAULT 0, ' .
            'available_at INTEGER NOT NULL DEFAULT 0, ' .
            'created_at INTEGER NOT NULL, ' .
            'claimed_at INTEGER, ' .
            'updated_at INTEGER NOT NULL, ' .
            'error TEXT); ' .
            'CREATE INDEX IF NOT EXISTS image_jobs_ready ON image_jobs(status,available_at,id); ' .
            'CREATE INDEX IF NOT EXISTS image_jobs_user ON image_jobs(chat,user_id,status,created_at);'
        );
    }

    /**
     * Enqueue a new job, or return the already-active job for the same
     * (chat,user) when one exists (deduplication).
     *
     * @return array{id:int,position:int,deduplicated:bool}
     */
    public function enqueue(array $update, int $chat, int $user, ?int $messageId, string $prompt): array
    {
        if ($prompt === '') throw new InvalidArgumentException('Empty image prompt');
        $updateId = isset($update['update_id']) ? (int)$update['update_id'] : null;
        $now = time();
        $this->db->exec('BEGIN IMMEDIATE');
        try {
            // Same update retried (worker crash / queue retry) → same job.
            if ($updateId !== null) {
                $q = $this->db->prepare('SELECT id,status FROM image_jobs WHERE update_id=?');
                $q->execute([$updateId]);
                $existing = $q->fetch(PDO::FETCH_ASSOC);
                if ($existing) {
                    $id = (int)$existing['id'];
                    $pos = $this->positionLocked($id);
                    $this->db->exec('COMMIT');
                    return ['id' => $id, 'position' => $pos, 'deduplicated' => true];
                }
            }
            // Same user+chat already has an active job → do not queue a second one.
            $q = $this->db->prepare("SELECT id FROM image_jobs WHERE chat=? AND user_id=? AND status IN ('queued','processing') ORDER BY id LIMIT 1");
            $q->execute([$chat, $user]);
            $active = $q->fetch(PDO::FETCH_ASSOC);
            if ($active) {
                $id = (int)$active['id'];
                $pos = $this->positionLocked($id);
                $this->db->exec('COMMIT');
                return ['id' => $id, 'position' => $pos, 'deduplicated' => true];
            }
            $q = $this->db->prepare('INSERT INTO image_jobs(update_id,chat,user_id,message_id,prompt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
            $q->execute([$updateId, $chat, $user, $messageId, $prompt, $now, $now]);
            $id = (int)$this->db->lastInsertId();
            $pos = $this->positionLocked($id);
            $this->db->exec('COMMIT');
            return ['id' => $id, 'position' => $pos, 'deduplicated' => false];
        } catch (Throwable $e) {
            $this->db->exec('ROLLBACK');
            throw $e;
        }
    }

    /** Atomically claim the oldest queued job. Returns null when none is ready. */
    public function claimNext(int $leaseSeconds = 300): ?array
    {
        $now = time();
        $this->db->exec('BEGIN IMMEDIATE');
        try {
            // Recover expired processing jobs (worker died mid-generation).
            $this->db->prepare("UPDATE image_jobs SET status='queued',claimed_at=NULL WHERE status='processing' AND claimed_at IS NOT NULL AND claimed_at<?")
                ->execute([$now - $leaseSeconds]);
            $q = $this->db->prepare("SELECT * FROM image_jobs WHERE status='queued' AND available_at<=? ORDER BY id LIMIT 1");
            $q->execute([$now]);
            $row = $q->fetch(PDO::FETCH_ASSOC);
            if (!$row) { $this->db->exec('COMMIT'); return null; }
            $this->db->prepare("UPDATE image_jobs SET status='processing',attempts=attempts+1,claimed_at=?,updated_at=? WHERE id=? AND status='queued'")
                ->execute([$now, $now, $row['id']]);
            $this->db->exec('COMMIT');
            $row['status'] = 'processing';
            $row['attempts'] = (int)$row['attempts'] + 1;
            $row['claimed_at'] = $now;
            return $row;
        } catch (Throwable $e) {
            $this->db->exec('ROLLBACK');
            throw $e;
        }
    }

    public function complete(int $id): void
    {
        $this->db->prepare("UPDATE image_jobs SET status='done',error=NULL,updated_at=? WHERE id=?")->execute([time(), $id]);
    }

    /** Mark failed, or re-queue with a backoff delay when $retryInSeconds is given. */
    public function fail(int $id, string $error, ?int $retryInSeconds = null): void
    {
        $now = time();
        if ($retryInSeconds !== null && $retryInSeconds >= 0) {
            $this->db->prepare("UPDATE image_jobs SET status='queued',available_at=?,claimed_at=NULL,error=?,updated_at=? WHERE id=?")
                ->execute([$now + $retryInSeconds, mb_substr($error, 0, 300), $now, $id]);
        } else {
            $this->db->prepare("UPDATE image_jobs SET status='failed',error=?,updated_at=? WHERE id=?")
                ->execute([mb_substr($error, 0, 300), $now, $id]);
        }
    }

    public function recover(): void
    {
        $this->db->prepare("UPDATE image_jobs SET status='queued',claimed_at=NULL WHERE status='processing' AND claimed_at IS NOT NULL AND claimed_at<?")
            ->execute([time() - 300]);
    }

    public function pendingCount(): int
    {
        return (int)$this->db->query("SELECT COUNT(*) FROM image_jobs WHERE status IN ('queued','processing')")->fetchColumn();
    }

    public function get(int $id): ?array
    {
        $q = $this->db->prepare('SELECT * FROM image_jobs WHERE id=?');
        $q->execute([$id]);
        $row = $q->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** Position in line (1 = about to be generated). Must be called inside a transaction or standalone. */
    private function positionLocked(int $id): int
    {
        $job = $this->db->prepare('SELECT status FROM image_jobs WHERE id=?');
        $job->execute([$id]);
        $status = $job->fetchColumn();
        if ($status === 'processing') return 1;
        if ($status !== 'queued') return 0;
        $processing = (int)$this->db->query("SELECT COUNT(*) FROM image_jobs WHERE status='processing'")->fetchColumn();
        $q = $this->db->prepare("SELECT COUNT(*) FROM image_jobs WHERE status='queued' AND id<?");
        $q->execute([$id]);
        $ahead = (int)$q->fetchColumn();
        return $processing + $ahead + 1;
    }

    public function position(int $id): int
    {
        return $this->positionLocked($id);
    }
}
