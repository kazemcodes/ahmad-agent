<?php
declare(strict_types=1);

final class RequestQueue
{
    private PDO $db;
    public function __construct(string $path)
    {
        if (!is_dir(dirname($path))) mkdir(dirname($path),0700,true);
        $this->db=new PDO('sqlite:'.$path,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
        $this->db->exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS request_queue (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'pending\', attempts INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, error TEXT); CREATE INDEX IF NOT EXISTS request_queue_ready ON request_queue(status,available_at,id); CREATE TABLE IF NOT EXISTS request_limits (scope TEXT NOT NULL, user_id INTEGER NOT NULL, at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS request_limits_lookup ON request_limits(scope,user_id,at)');
    }
    public function enqueue(array $update): void
    {
        if (!isset($update['update_id'])) throw new InvalidArgumentException('Missing update_id');
        $q=$this->db->prepare('INSERT OR IGNORE INTO request_queue(id,payload,created_at) VALUES(?,?,?)');
        $q->execute([(int)$update['update_id'],json_encode($update,JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),time()]);
    }
    public function offset(): int { return (int)$this->db->query('SELECT COALESCE(MAX(id),-1)+1 FROM request_queue')->fetchColumn(); }
    public function processOne(callable $handler): bool
    {
        $this->db->exec('BEGIN IMMEDIATE');
        try {
            $q=$this->db->prepare("SELECT * FROM request_queue WHERE status='pending' AND available_at<=? ORDER BY id LIMIT 1"); $q->execute([time()]); $row=$q->fetch(PDO::FETCH_ASSOC);
            if (!$row) { $this->db->exec('COMMIT'); return false; }
            $q=$this->db->prepare("UPDATE request_queue SET status='processing',available_at=? WHERE id=?"); $q->execute([time()+300,$row['id']]); $this->db->exec('COMMIT');
        } catch(Throwable $e) { $this->db->exec('ROLLBACK'); throw $e; }
        try {
            $handler(json_decode($row['payload'],true,512,JSON_THROW_ON_ERROR));
            $q=$this->db->prepare("UPDATE request_queue SET status='done',payload='',error=NULL WHERE id=?"); $q->execute([$row['id']]);
        } catch(Throwable $e) {
            $attempts=(int)$row['attempts']+1; $status=$attempts>=3?'failed':'pending';
            $q=$this->db->prepare('UPDATE request_queue SET status=?,attempts=?,available_at=?,error=? WHERE id=?'); $q->execute([$status,$attempts,time()+min(60,5*$attempts),mb_substr($e->getMessage(),0,300),$row['id']]);
            error_log('[ahmad] queue.error '.json_encode(['id'=>$row['id'],'attempt'=>$attempts,'status'=>$status]));
        }
        return true;
    }
    public function recover(): void { $this->db->prepare("UPDATE request_queue SET status='pending' WHERE status='processing' AND available_at<?")->execute([time()]); }
    public function allow(string $scope,int $user,int $limit,int $window): bool
    {
        if ($limit<=0) return true;
        $this->db->exec('BEGIN IMMEDIATE');
        try {
            $now=time(); $this->db->prepare('DELETE FROM request_limits WHERE at<?')->execute([$now-86400]);
            $q=$this->db->prepare('SELECT COUNT(*) FROM request_limits WHERE scope=? AND user_id=? AND at>?'); $q->execute([$scope,$user,$now-$window]);
            if ((int)$q->fetchColumn()>=$limit) { $this->db->exec('COMMIT'); return false; }
            $this->db->prepare('INSERT INTO request_limits(scope,user_id,at) VALUES(?,?,?)')->execute([$scope,$user,$now]); $this->db->exec('COMMIT'); return true;
        } catch(Throwable $e) { $this->db->exec('ROLLBACK'); throw $e; }
    }
}
