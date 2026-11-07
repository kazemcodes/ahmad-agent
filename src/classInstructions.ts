// Port of src/ClassInstructions.php
import { nowSec } from './logger.js';
import type { Db } from './db.js';

export function parseInstruction(text: string): string | null {
  const t = text.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ');
  const m = t.match(/^(?:آقای\s+ناظر[،,:\s]*)?یادت\s+باشه[،,:\s]+(.+)$/us);
  if (!m) return null;
  const note = m[1]!.trim();
  return note !== '' ? note : null;
}

export class ClassInstructions {
  constructor(private db: Db) {}

  add(chat: number, author: number, instruction: string): number {
    const info = this.db
      .prepare('INSERT INTO class_instructions(chat,author,instruction,created_at) VALUES(?,?,?,?)')
      .run(chat, author, instruction, nowSec());
    return Number(info.lastInsertRowid);
  }

  list(chat: number): Array<{ id: number; instruction: string }> {
    return this.db
      .prepare('SELECT id,instruction FROM class_instructions WHERE chat=? ORDER BY id DESC LIMIT 10')
      .all(chat) as Array<{ id: number; instruction: string }>;
  }

  remove(chat: number, id: number): boolean {
    const info = this.db.prepare('DELETE FROM class_instructions WHERE chat=? AND id=?').run(chat, id);
    return info.changes > 0;
  }
}
