// Single-process entry point — replaces main.php + bin/poll.php + bin/worker.php
// + bin/image-worker.php. One Node process runs: poll loop, fast worker,
// IMAGE_WORKERS image workers, and the dashboard. (Botkeep: `npm start`.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initDb, initSchema } from './db.js';
import { Logger, sleep, nowSec } from './logger.js';
import { Ahmad } from './ahmad.js';
import { startDashboard } from './dashboard/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// dist/index.js → project root is ../ ; src/index.ts (tsx dev) → ../ too.
const projectRoot = path.resolve(__dirname, '..');
const dashboardDir = path.join(projectRoot, 'dashboard');
const logFile = path.join(projectRoot, 'data', 'bot.log');

function acquireLock(): void {
  const lockPath = config.db + '.app.lock';
  // Ensure the lock's directory exists (fresh deploy: no data/ yet).
  try {
    fs.mkdirSync(path.dirname(path.resolve(lockPath)), { recursive: true });
  } catch {
    /* ignore */
  }
  try {
    fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  } catch {
    // A lock file exists. Check whether the pid in it is still alive.
    // Stale locks (crashes, kill -9, container restarts) must not block startup.
    if (lockIsStale(lockPath)) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
      try {
        fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      } catch {
        failLock();
      }
    } else {
      failLock();
    }
  }
  const release = () => {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  };
  process.on('exit', release);
  process.on('SIGINT', () => {
    release();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    release();
    process.exit(0);
  });
}

function failLock(): never {
  console.error(
    `Another process is already running for this database. Stop the existing process before starting another one.`,
  );
  process.exit(1);
}

function lockIsStale(lockPath: string): boolean {
  let pid: number;
  let stat: fs.Stats;
  try {
    pid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    stat = fs.statSync(lockPath);
  } catch {
    return true; // unreadable → treat as stale
  }
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return true;
  try {
    process.kill(pid, 0); // alive?
    // Pid is alive. Could be pid reuse (container restarted, pid recycled).
    // Fall back to file age: a lock untouched for >5 minutes is stale.
    const ageSeconds = nowSec() - Math.floor(stat.mtimeMs / 1000);
    return ageSeconds > 300;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EPERM') return false; // exists but not signalable
    return true; // ESRCH or anything else → stale
  }
}

async function pollLoop(bot: Ahmad, logger: Logger): Promise<void> {
  logger.log('poll.start', { timezone: config.timezone });
  while (true) {
    try {
      const httpMod = await import('./http.js');
      const baleMod = await import('./bale.js');
      const http = new httpMod.HttpClient(logger);
      const bale = new baleMod.BaleClient(http, config.bale_token);
      await bale.deleteWebhook();
      break;
    } catch (e) {
      logger.log('poll.startup_retry', { error: e instanceof Error ? e.message : String(e) });
      await sleep(5000);
    }
  }
  const http = new (await import('./http.js')).HttpClient(logger);
  const bale = new (await import('./bale.js')).BaleClient(http, config.bale_token);
  let offset = Math.max(bot.queueOffset(), bot.seenOffset());
  // Flush any backlog: fetch latest update_id and jump past everything old.
  try {
    const probe = await bale.getUpdates(offset, 1);
    if (probe?.result?.length) {
      const latest = Math.max(...probe.result.map((u: any) => Number(u.update_id)));
      if (latest >= offset) {
        const skipped = latest - offset;
        offset = latest + 1;
        logger.log('poll.backlog_flushed', { skipped, from: offset - 1 });
      }
    }
  } catch (e) {
    logger.log('poll.backlog_probe_failed', { error: e instanceof Error ? e.message : String(e) });
  }
  while (true) {
    try {
      while (await bot.drainFastQueue()) {}
      const response = await bale.getUpdates(offset, 5);
      for (const update of response?.result ?? []) {
        bot.enqueue(update);
        offset = Math.max(offset, Number(update.update_id) + 1);
      }
    } catch (e) {
      logger.log('poll.error', { error: e instanceof Error ? e.message : String(e) });
      await sleep(3000);
    }
  }
}

async function requestWorker(bot: Ahmad, logger: Logger): Promise<void> {
  while (true) {
    try {
      if (!(await bot.drainFastQueue())) await sleep(1000);
    } catch (e) {
      logger.log('worker.error', { error: e instanceof Error ? e.message : String(e) });
      await sleep(3000);
    }
  }
}

async function imageWorker(bot: Ahmad, logger: Logger, slot: number): Promise<void> {
  while (true) {
    try {
      if (!(await bot.workImageOne())) await sleep(1000);
    } catch (e) {
      logger.log(`image-worker.error slot=${slot}`, { error: e instanceof Error ? e.message : String(e) });
      await sleep(3000);
    }
  }
}

async function main(): Promise<void> {
  if (!config.bale_token) {
    console.error('Set BALE_TOKEN first.');
    process.exit(1);
  }
  acquireLock();
  const logger = new Logger(config.timezone, logFile);
  console.log('Botkeep PHP worker is running.');
  const db = initDb(config.db);
  initSchema(db);
  const bot = new Ahmad(config, db);

  // Dashboard (optional but kept for parity; binds 127.0.0.1 unless DASHBOARD_TOKEN set)
  try {
    startDashboard(db, config, dashboardDir, logFile);
  } catch (e) {
    logger.log('dashboard.error', { error: e instanceof Error ? e.message : String(e) });
  }

  const workers: Promise<void>[] = [
    pollLoop(bot, logger),
    requestWorker(bot, logger),
  ];
  for (let i = 1; i <= config.image_workers; i++) {
    workers.push(imageWorker(bot, logger, i));
  }
  await Promise.all(workers);
}

void main();
