// Port of src/RequestQueue.php — same retry/backoff/lease semantics.
import type { Db } from '../db.js';
import { nowSec } from '../logger.js';
import type { BaleUpdate } from '../types.js';

export class RequestQueue {
  constructor(private db: Db) {}

  enqueue(update: BaleUpdate): void {
    if (update.update_id === undefined || update.update_id === null) {
      throw new Error('Missing update_id');
    }
    this.db
      .prepare('INSERT OR IGNORE INTO request_queue(id,payload,created_at) VALUES(?,?,?)')
      .run(update.update_id, JSON.stringify(update), nowSec());
  }

  offset(): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(id),-1)+1 AS o FROM request_queue')
      .get() as { o: number };
    return Number(row.o);
  }

  /** Claim + run one pending update. Returns true if one was claimed (even if it failed). */
  processOne(handler: (u: BaleUpdate) => void): boolean {
    const now = nowSec();
    let row: { id: number; payload: string; attempts: number } | undefined;
    const claim = this.db.transaction(() => {
      row = this.db
        .prepare('SELECT * FROM request_queue WHERE status=\'pending\' AND available_at<=? ORDER BY id LIMIT 1')
        .get(now) as typeof row;
      if (!row) return;
      this.db
        .prepare('UPDATE request_queue SET status=\'processing\',available_at=? WHERE id=?')
        .run(now + 300, row.id);
    });
    claim();
    if (!row) return false;
    try {
      handler(JSON.parse(row.payload) as BaleUpdate);
      this.db
        .prepare('UPDATE request_queue SET status=\'done\',payload=\'\',error=NULL WHERE id=?')
        .run(row.id);
    } catch (e) {
      const attempts = Number(row.attempts) + 1;
      const status = attempts >= 3 ? 'failed' : 'pending';
      this.db
        .prepare('UPDATE request_queue SET status=?,attempts=?,available_at=?,error=? WHERE id=?')
        .run(status, attempts, nowSec() + Math.min(60, 5 * attempts), String(e instanceof Error ? e.message : e).slice(0, 300), row.id);
      console.error(`[ahmad] queue.error ${JSON.stringify({ id: row.id, attempt: attempts, status })}`);
    }
    return true;
  }

  recover(): void {
    this.db
      .prepare("UPDATE request_queue SET status='pending' WHERE status='processing' AND available_at<?")
      .run(nowSec());
  }

  /** Claim the oldest ready update without invoking a handler (for async callers). */
  claimNextSync(): BaleUpdate | null {
    const now = nowSec();
    let row: { id: number; payload: string; attempts: number } | undefined;
    const tx = this.db.transaction(() => {
      row = this.db
        .prepare(
          "SELECT * FROM request_queue WHERE status='pending' AND available_at<=? ORDER BY id LIMIT 1",
        )
        .get(now) as typeof row;
      if (!row) return;
      this.db
        .prepare('UPDATE request_queue SET status=\'processing\',available_at=? WHERE id=?')
        .run(now + 300, row.id);
    });
    tx();
    if (!row) return null;
    return JSON.parse(row.payload) as BaleUpdate;
  }

  completeSync(id: number): void {
    this.db.prepare("UPDATE request_queue SET status='done',payload='',error=NULL WHERE id=?").run(id);
  }

  failSync(id: number, error: string): void {
    const row = this.db.prepare('SELECT attempts FROM request_queue WHERE id=?').get(id) as
      | { attempts: number }
      | undefined;
    const attempts = Number(row?.attempts ?? 0) + 1;
    const status = attempts >= 3 ? 'failed' : 'pending';
    this.db
      .prepare('UPDATE request_queue SET status=?,attempts=?,available_at=?,error=? WHERE id=?')
      .run(status, attempts, nowSec() + Math.min(60, 5 * attempts), error.slice(0, 300), id);
  }

  /** Unblock rows stuck in processing (available_at bumped) — safe to retry now. */
  resurrectStuck(leaseSeconds = 300): number {
    const info = this.db
      .prepare("UPDATE request_queue SET status='pending',available_at=0 WHERE status='processing'")
      .run();
    return info.changes;
  }

  allow(scope: string, user: number, limit: number, window: number): boolean {
    if (limit <= 0) return true;
    const tx = this.db.transaction((): boolean => {
      const now = nowSec();
      this.db.prepare('DELETE FROM request_limits WHERE at<?').run(now - 86400);
      const row = this.db
        .prepare('SELECT COUNT(*) AS n FROM request_limits WHERE scope=? AND user_id=? AND at>?')
        .get(scope, user, now - window) as { n: number };
      if (Number(row.n) >= limit) return false;
      this.db.prepare('INSERT INTO request_limits(scope,user_id,at) VALUES(?,?,?)').run(scope, user, now);
      return true;
    });
    return tx();
  }
}
