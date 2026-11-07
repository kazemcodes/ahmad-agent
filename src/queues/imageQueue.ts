// Port of src/ImageQueue.php — dedupe, atomic claim, backoff, position.
import type { Db } from '../db.js';
import { nowSec } from '../logger.js';
import type { BaleUpdate, ImageJobRow } from '../types.js';

export interface EnqueueResult {
  id: number;
  position: number;
  deduplicated: boolean;
}

export class ImageQueue {
  constructor(private db: Db) {}

  enqueue(
    update: BaleUpdate,
    chat: number,
    user: number,
    messageId: number | null,
    prompt: string,
  ): EnqueueResult {
    if (prompt === '') throw new Error('Empty image prompt');
    const updateId = update.update_id ?? null;
    const now = nowSec();
    const tx = this.db.transaction((): EnqueueResult => {
      if (updateId !== null) {
        const existing = this.db
          .prepare('SELECT id,status FROM image_jobs WHERE update_id=?')
          .get(updateId) as { id: number; status: string } | undefined;
        if (existing) {
          return { id: existing.id, position: this.positionLocked(existing.id), deduplicated: true };
        }
      }
      const active = this.db
        .prepare("SELECT id FROM image_jobs WHERE chat=? AND user_id=? AND status IN ('queued','processing') ORDER BY id LIMIT 1")
        .get(chat, user) as { id: number } | undefined;
      if (active) {
        return { id: active.id, position: this.positionLocked(active.id), deduplicated: true };
      }
      const info = this.db
        .prepare('INSERT INTO image_jobs(update_id,chat,user_id,message_id,prompt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
        .run(updateId, chat, user, messageId, prompt, now, now);
      const id = Number(info.lastInsertRowid);
      return { id, position: this.positionLocked(id), deduplicated: false };
    });
    return tx();
  }

  claimNext(leaseSeconds = 300): ImageJobRow | null {
    const now = nowSec();
    const tx = this.db.transaction((): ImageJobRow | null => {
      this.db
        .prepare("UPDATE image_jobs SET status='queued',claimed_at=NULL WHERE status='processing' AND claimed_at IS NOT NULL AND claimed_at<?")
        .run(now - leaseSeconds);
      const row = this.db
        .prepare("SELECT * FROM image_jobs WHERE status='queued' AND available_at<=? ORDER BY id LIMIT 1")
        .get(now) as ImageJobRow | undefined;
      if (!row) return null;
      this.db
        .prepare("UPDATE image_jobs SET status='processing',attempts=attempts+1,claimed_at=?,updated_at=? WHERE id=? AND status='queued'")
        .run(now, now, row.id);
      row.status = 'processing';
      row.attempts = Number(row.attempts) + 1;
      row.claimed_at = now;
      return row;
    });
    return tx();
  }

  complete(id: number): void {
    this.db.prepare("UPDATE image_jobs SET status='done',error=NULL,updated_at=? WHERE id=?").run(nowSec(), id);
  }

  fail(id: number, error: string, retryInSeconds: number | null = null): void {
    const now = nowSec();
    if (retryInSeconds !== null && retryInSeconds >= 0) {
      this.db
        .prepare("UPDATE image_jobs SET status='queued',available_at=?,claimed_at=NULL,error=?,updated_at=? WHERE id=?")
        .run(now + retryInSeconds, error.slice(0, 300), now, id);
    } else {
      this.db.prepare("UPDATE image_jobs SET status='failed',error=?,updated_at=? WHERE id=?").run(error.slice(0, 300), now, id);
    }
  }

  recover(): void {
    this.db
      .prepare("UPDATE image_jobs SET status='queued',claimed_at=NULL WHERE status='processing' AND claimed_at IS NOT NULL AND claimed_at<?")
      .run(nowSec() - 300);
  }

  pendingCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM image_jobs WHERE status IN ('queued','processing')")
      .get() as { n: number };
    return Number(row.n);
  }

  get(id: number): ImageJobRow | undefined {
    return this.db.prepare('SELECT * FROM image_jobs WHERE id=?').get(id) as ImageJobRow | undefined;
  }

  position(id: number): number {
    return this.positionLocked(id);
  }

  private positionLocked(id: number): number {
    const job = this.db.prepare('SELECT status FROM image_jobs WHERE id=?').get(id) as
      | { status: string }
      | undefined;
    const status = job?.status;
    if (status === 'processing') return 1;
    if (status !== 'queued') return 0;
    const processing = Number(
      (this.db.prepare("SELECT COUNT(*) AS n FROM image_jobs WHERE status='processing'").get() as { n: number }).n,
    );
    const ahead = Number(
      (this.db.prepare("SELECT COUNT(*) AS n FROM image_jobs WHERE status='queued' AND id<?").get(id) as { n: number }).n,
    );
    return processing + ahead + 1;
  }
}
