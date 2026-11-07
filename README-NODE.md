# Ahmad Bot — Node.js/TypeScript version (Botkeep)

Full-parity rewrite of the PHP bot. Single process: poller + fast worker +
image workers + dashboard, all started by `npm start`.

## Local run

```bash
npm install
cp .env.example .env   # fill BALE_TOKEN etc. (real .env stays gitignored)
npm run build
npm start
```

Without `BALE_TOKEN` it exits with `Set BALE_TOKEN first.` — same guard as PHP.

## Tests

```bash
npm test        # 40 tests: fuzzy, checkin, intents, budget, queue, image-queue, memory, instructions
npm run typecheck
```

## Botkeep deploy

- Runtime: **Node.js 20+** (Botkeep's Node profile). Install: `npm ci`, Build: `npm run build`, Start: `npm start`.
- **Environment** (never a committed `.env`): `BALE_TOKEN`, `ADMIN_IDS`, `BOT_USERNAME`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, plus image/vision/voice/search keys as needed, `TIMEZONE=Asia/Tehran`, `POLL_INLINE_IMAGES`/`IMAGE_WORKERS` are legacy PHP flags — `IMAGE_WORKERS` still sets in-process image concurrency (default 2).
- Upload: `package.json`, `package-lock.json`, `src/`, `dist/` (or build on Botkeep), `dashboard/`, `data/ahmad.sqlite` (migrated — see below). **Never upload `.env`.**
- Dashboard: binds `127.0.0.1` unless `DASHBOARD_TOKEN` is set (then `0.0.0.0` via `PORT`, default 3000).

## Data migration (SQLite carries over)

1. Stop the PHP bot everywhere.
2. Checkpoint + backup:
   ```bash
   sqlite3 data/ahmad.sqlite "PRAGMA wal_checkpoint(TRUNCATE);"
   cp data/ahmad.sqlite data/ahmad.sqlite.bak
   ```
3. Copy the single `ahmad.sqlite` file to the Node deployment. The `initSchema()` in [src/db.ts](src/db.ts) runs `CREATE TABLE IF NOT EXISTS` verbatim — a no-op on the migrated DB.
4. Verify `.tables` shows all 17 tables, row counts match. Rollback = restore the `.bak`, restart PHP.

## Architecture (single process)

```
src/index.ts
 ├─ pollLoop()        getUpdates → enqueue (offset = MAX(request_queue.id)+1)
 ├─ requestWorker()   drainFastQueue() → Ahmad.handle()   (chat/attendance/commands)
 ├─ imageWorker() × IMAGE_WORKERS   claimNext → workImageOne()  (image gen, non-blocking)
 └─ dashboard         GET/POST /api/data (parity with dashboard/data.php)
```

`src/ahmad.ts` keeps every Persian string verbatim from `src/Ahmad.php`. The only intentional behavior change: `handle()` is async and a voice message is transcribed then routed through the same chat path (PHP fell through in one function; Node uses a helper).
