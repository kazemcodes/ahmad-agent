// Port of dashboard/data.php — Express JSON API + static dashboard.
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import type { Db } from '../db.js';
import type { Config } from '../config.js';
import { nowSec } from '../logger.js';

function hasTable(db: Db, table: string): boolean {
  const row = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name=?").get(table) as
    | { x: number }
    | undefined;
  return !!row;
}

function norm(s: string): string {
  return s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').trim();
}

function isLoopback(ip: string | undefined): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function createDashboardApp(db: Db, c: Config, dashboardDir: string, logFile: string) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Loopback-only when no token (parity); token allows 0.0.0.0 bind.
  app.use((req: Request, res: Response, next) => {
    if (!c.dashboard_token && !isLoopback(req.ip)) {
      res.status(403).json({ error: 'دسترسی مجاز نیست' });
      return;
    }
    next();
  });

  const checkToken = (req: Request): boolean => {
    if (!c.dashboard_token) return true;
    const given =
      (req.get('x-dashboard-token') as string | undefined) ??
      (typeof req.body?.token === 'string' ? req.body.token : '');
    const a = Buffer.from(c.dashboard_token);
    const b = Buffer.from(given);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  app.get('/api/data', (_req: Request, res: Response) => {
    try {
      if (!hasTable(db, 'messages')) {
        res.json({ ready: false, messages: [], memory: [], stats: {} });
        return;
      }
      const messages =
        hasTable(db, 'messages') && hasTable(db, 'observed_users')
          ? db
              .prepare(
                'SELECT m.name,m.text,m.at,m.chat,m.user_id,u.username FROM messages m LEFT JOIN observed_users u ON u.chat=m.chat AND u.user_id=m.user_id ORDER BY m.id DESC LIMIT 60',
              )
              .all()
          : [];
      const memory = hasTable(db, 'conversation_turns')
        ? db.prepare('SELECT role,content,at,chat,user_id FROM conversation_turns ORDER BY id DESC LIMIT 60').all()
        : [];
      const stats: Record<string, number> = {};
      for (const table of ['messages', 'roster', 'attendance', 'conversation_turns']) {
        stats[table] = hasTable(db, table)
          ? Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)
          : 0;
      }
      const roster = hasTable(db, 'roster')
        ? db.prepare('SELECT id,chat,name,user_id FROM roster ORDER BY chat,name LIMIT 200').all()
        : [];
      const schedules = hasTable(db, 'schedules')
        ? db.prepare('SELECT id,chat,weekday,start,end FROM schedules ORDER BY chat,weekday,start LIMIT 200').all()
        : [];
      const corrections = hasTable(db, 'corrections')
        ? db
            .prepare("SELECT id,chat,user_id,requested,status FROM corrections WHERE status='pending' ORDER BY id DESC LIMIT 100")
            .all()
        : [];
      let logs: string[] = [];
      if (fs.existsSync(logFile)) {
        const size = fs.statSync(logFile).size;
        const fd = fs.openSync(logFile, 'r');
        const start = Math.max(0, size - 40000);
        const buf = Buffer.alloc(size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        fs.closeSync(fd);
        logs = buf.toString('utf8').trim().split('\n').slice(-80);
      }
      res.json({ ready: true, messages, memory, stats, logs, roster, schedules, corrections });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'خواندن اطلاعات ممکن نشد.' });
    }
  });

  app.post('/api/data', (req: Request, res: Response) => {
    const action: string = String(req.body?.action ?? req.query.action ?? '');
    if (!action) {
      res.status(400).json({ error: 'اکشن ناشناخته' });
      return;
    }
    if (!checkToken(req)) {
      res.status(403).json({ error: 'توکن نامعتبر است' });
      return;
    }
    const chat = Number(req.body?.chat ?? 0);
    try {
      if (action === 'add_roster' && chat) {
        const names = String(req.body?.names ?? '').split(/[\r\n،,]+/u);
        let n = 0;
        const tx = db.transaction(() => {
          for (const vRaw of names) {
            const v = norm(vRaw);
            if (v !== '') {
              db.prepare('INSERT OR IGNORE INTO roster(chat,name) VALUES(?,?)').run(chat, v);
              n++;
            }
          }
        });
        tx();
        res.json({ ok: true, added: n });
        return;
      }
      if (action === 'delete_roster' && chat) {
        db.prepare('DELETE FROM roster WHERE chat=? AND id=?').run(chat, Number(req.body?.id ?? 0));
        res.json({ ok: true });
        return;
      }
      if (action === 'add_schedule' && chat) {
        const wd = String(req.body?.weekday ?? '');
        const s = String(req.body?.start ?? '');
        const e = String(req.body?.end ?? '');
        if (!/^([0-6])$/.test(wd) || !/^([0-2][0-9]:[0-5][0-9])$/.test(s) || !/^([0-2][0-9]:[0-5][0-9])$/.test(e) || s >= e) {
          res.status(400).json({ error: 'زمان نامعتبر است' });
          return;
        }
        db.prepare('INSERT OR IGNORE INTO schedules(chat,weekday,start,end) VALUES(?,?,?,?)').run(chat, Number(wd), s, e);
        res.json({ ok: true });
        return;
      }
      if (action === 'delete_schedule' && chat) {
        db.prepare('DELETE FROM schedules WHERE chat=? AND id=?').run(chat, Number(req.body?.id ?? 0));
        res.json({ ok: true });
        return;
      }
      if (action === 'approve' && chat) {
        db.prepare("UPDATE corrections SET status='approved' WHERE chat=? AND id=? AND status='pending'").run(chat, Number(req.body?.id ?? 0));
        res.json({ ok: true });
        return;
      }
      res.status(400).json({ error: 'اکشن ناشناخته' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'خطا در انجام اکشن' });
    }
  });

  // Static files (index.html, admin.html, style.css, app.js)
  app.use(express.static(dashboardDir));

  // Keep compatibility with old app.js/assets that fetch data.php — redirect to /api/data
  app.all('/data.php', (_req: Request, res: Response) => {
    res.redirect(307, '/api/data');
  });

  return app;
}

export function startDashboard(
  db: Db,
  c: Config,
  dashboardDir: string,
  logFile: string,
): ReturnType<typeof express>['listen'] | undefined {
  const app = createDashboardApp(db, c, dashboardDir, logFile);
  const host = c.dashboard_token ? '0.0.0.0' : '127.0.0.1';
  const server = app.listen(c.port, host, () => {
    console.log(`[ahmad] dashboard listening on ${host}:${c.port}`);
  });
  return server.listen.bind(server) as unknown as ReturnType<typeof express>['listen'];
}

export { nowSec };
export const __dirnameSafe = path.dirname(new URL(import.meta.url).pathname);
