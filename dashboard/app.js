// Ahmad Dashboard — app logic
const $ = id => document.getElementById(id);

const LABELS = {
  overview: 'نمای کلی',
  groups: 'گروه‌ها',
  messages: 'پیام‌های کلاس',
  memory: 'حافظه گفتگو',
  logs: 'گزارش اجرا',
};
const SUBS = {
  overview: 'کلاس‌ها، گفتگوها و وضعیت اجرا در یک نگاه',
  groups: 'انتخاب یک گروه برای مشاهده گزارش حضور',
  messages: 'آخرین پیام‌های ذخیره‌شده در دیتابیس',
  memory: 'آخرین نوبت‌های گفتگو برای هر دانش‌آموز',
  logs: 'آخرین رویدادها و خطاهای برنامه',
};

let GROUPS = [];
let CURRENT_GROUP = null;
let ATTENDANCE = [];

function openTab(name) {
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.id === 'tab-' + name));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.tab === name));
  $('pageTitle').textContent = LABELS[name] || name;
  $('pageSub').textContent = SUBS[name] || '';
  if (name === 'groups') loadGroups();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => openTab(btn.dataset.tab));
});
document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => openTab(btn.dataset.goto));
});

function fmtTime(ts) {
  return new Date(ts * 1000).toLocaleString('fa-IR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtTimeOnly(ts) {
  return new Date(ts * 1000).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}
function fmtNum(n) { return (n || 0).toLocaleString('fa-IR'); }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ── Groups ──

async function loadGroups() {
  try {
    const r = await fetch('api/groups', { cache: 'no-store' });
    if (!r.ok) throw new Error();
    GROUPS = await r.json();
    renderGroups();
    $('statGroups').textContent = fmtNum(GROUPS.length);
  } catch {
    $('groupsSummary').textContent = 'خطا در دریافت گروه‌ها';
  }
}

function renderGroups() {
  const c = $('groupsList');
  c.replaceChildren();
  if (!GROUPS.length) {
    c.append(el('p', 'empty', 'هنوز هیچ گروهی حضور ثبت نکرده است.'));
    return;
  }
  $('groupsSummary').textContent = `${fmtNum(GROUPS.length)} گروه — روی هر کارت کلیک کن`;
  for (const g of GROUPS) {
    const card = el('article', 'group-card');
    card.addEventListener('click', () => openGroup(g.chat));
    const icon = el('div', 'group-icon', '👥');
    const body = el('div', 'group-body');
    const title = el('strong', 'group-title', `گروه ${g.chat}`);
    const meta = el('p', 'group-meta',
      `${fmtNum(g.students)} دانش‌آموز · ${fmtNum(g.today_checkins)} حاضر امروز · ${fmtNum(g.total_checkins)} کل حضورها`
    );
    const lastActive = el('span', 'group-last', `آخرین فعالیت: ${fmtDate(g.last_active)}`);
    body.append(title, meta, lastActive);
    const arrow = el('span', 'group-arrow', '←');
    card.append(icon, body, arrow);
    c.append(card);
  }
}

// ── Group detail ──

async function openGroup(chatId) {
  CURRENT_GROUP = chatId;
  $('groupDetail').hidden = false;
  $('groupDetailTitle').textContent = `گزارش گروه ${chatId}`;
  $('groupDetailSub').textContent = 'در حال بارگذاری…';
  document.getElementById('tab-groups').scrollIntoView({ behavior: 'smooth' });
  await loadAttendance();
}

async function loadAttendance() {
  if (!CURRENT_GROUP) return;
  try {
    const r = await fetch(`api/attendance/${CURRENT_GROUP}`, { cache: 'no-store' });
    if (!r.ok) throw new Error();
    ATTENDANCE = await r.json();
    renderAttendance(ATTENDANCE);
    const students = new Set(ATTENDANCE.map(a => a.user_id)).size;
    $('groupDetailSub').textContent = `${fmtNum(ATTENDANCE.length)} حضور · ${fmtNum(students)} دانش‌آموز`;
  } catch {
    $('groupDetailSub').textContent = 'خطا در دریافت اطلاعات';
  }
}

function renderAttendance(rows) {
  const tbody = $('attendanceTableBody');
  tbody.replaceChildren();
  $('attendanceEmpty').hidden = rows.length > 0;
  $('attendanceTable').style.display = rows.length ? '' : 'none';
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.append(
      el('td', null, String(i + 1)),
      el('td', 'td-name', r.name),
      el('td', null, fmtDate(r.day)),
      el('td', null, fmtTimeOnly(r.at)),
      el('td', null, fmtNum(r.msg_count)),
    );
    tbody.append(tr);
  });
}

$('backToGroups').addEventListener('click', () => {
  $('groupDetail').hidden = true;
  CURRENT_GROUP = null;
  loadGroups();
});

$('applyFilter').addEventListener('click', () => {
  const from = $('dateFrom').value;
  const to = $('dateTo').value;
  let rows = ATTENDANCE;
  if (from) rows = rows.filter(r => r.day >= from);
  if (to) rows = rows.filter(r => r.day <= to);
  renderAttendance(rows);
});

// ── Export CSV ──

$('exportCsvBtn').addEventListener('click', () => {
  if (!ATTENDANCE.length) return;
  let csv = 'نام,تاریخ,ساعت حضور,تعداد پیام,شناسه کاربر\n';
  for (const r of ATTENDANCE) {
    csv += `"${r.name}","${r.day}","${fmtTimeOnly(r.at)}","${r.msg_count}","${r.user_id}"\n`;
  }
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `attendance-${CURRENT_GROUP}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ── Export PDF (print) ──

$('exportPdfBtn').addEventListener('click', () => {
  const w = window.open('', '_blank');
  if (!w) return;
  const rows = ATTENDANCE.map((r, i) =>
    `<tr><td>${i + 1}</td><td>${r.name}</td><td>${fmtDate(r.day)}</td><td>${fmtTimeOnly(r.at)}</td><td>${r.msg_count}</td></tr>`
  ).join('');
  w.document.write(`
<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گزارش حضور</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700&display=swap');
  body{font-family:'Vazirmatn',Tahoma,sans-serif;padding:40px;color:#1a1a1a}
  h1{font-size:20px;border-bottom:2px solid #0f766e;padding-bottom:10px}
  .meta{color:#666;font-size:13px;margin:10px 0 20px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #ddd;padding:8px 12px;text-align:right;font-size:13px}
  th{background:#f0fdfa;font-weight:700}
  tr:nth-child(even){background:#f8fafc}
  @media print{body{padding:20px}}
</style></head><body>
<h1>📋 گزارش حضور — گروه ${CURRENT_GROUP}</h1>
<p class="meta">تاریخ تولید: ${new Date().toLocaleString('fa-IR')} · ${ATTENDANCE.length} حضور</p>
<table><thead><tr><th>#</th><th>نام</th><th>تاریخ</th><th>ساعت حضور</th><th>تعداد پیام</th></tr></thead>
<tbody>${rows}</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>
`);
  w.document.close();
});

// ── Messages & memory ──

function showMessages(container, rows, kind) {
  container.replaceChildren();
  if (!rows.length) {
    container.append(el('p', 'empty', 'هنوز اطلاعاتی برای نمایش وجود ندارد.'));
    return;
  }
  for (const item of rows) {
    const row = el('div', 'msg-item');
    const head = el('div', 'msg-head');
    const name = el('strong', null,
      kind === 'memory'
        ? (item.role === 'assistant' ? 'آقای ناظر' : 'دانش‌آموز ' + item.user_id)
        : (item.name || 'کاربر') + (item.username ? ' (@' + item.username + ')' : '') + (item.user_id ? ' · ' + item.user_id : '')
    );
    const time = el('time', null, fmtTime(item.at));
    head.append(name, time);
    const body = el('p', 'msg-body', kind === 'memory' ? item.content : item.text);
    row.append(head, body);
    container.append(row);
  }
}

// ── Overview refresh ──

async function refresh() {
  const icon = document.querySelector('.refresh-icon');
  if (icon) icon.classList.add('spinning');
  try {
    const r = await fetch('data.php', { cache: 'no-store' });
    if (!r.ok) throw new Error('دریافت اطلاعات ممکن نشد');
    const d = await r.json();

    $('error').hidden = true;
    const dot = $('connectionDot');
    if (dot) dot.className = 'status-dot' + (d.ready ? ' online' : '');
    $('connection').textContent = d.ready ? 'متصل' : 'در انتظار آماده‌سازی';

    $('statMessages').textContent = fmtNum(d.stats.messages);
    $('statAttendance').textContent = fmtNum(d.stats.reply_checkins);
    $('statToday').textContent = fmtNum(d.attendanceToday?.length);
    $('statGroups').textContent = fmtNum(GROUPS.length);
    $('statMemory').textContent = fmtNum(d.stats.conversation_turns);

    showMessages($('recentMessages'), d.messages.slice(0, 5), 'messages');
    showMessages($('messageList'), d.messages, 'messages');
    showMessages($('memoryList'), d.memory, 'memory');

    $('logContent').textContent = (d.logs || []).join('\n') || 'هنوز گزارشی وجود ندارد.';
    $('footerTime').textContent = new Date().toLocaleString('fa-IR');
  } catch (e) {
    $('error').hidden = false;
    $('error').textContent = 'اتصال به پنل برقرار نشد. برنامه را دوباره اجرا کنید.';
    const dot = $('connectionDot');
    if (dot) dot.className = 'status-dot offline';
    $('connection').textContent = 'قطع';
  } finally {
    if (icon) setTimeout(() => icon.classList.remove('spinning'), 600);
  }
}

$('refreshBtn').addEventListener('click', refresh);
$('clearLogsBtn').addEventListener('click', async () => {
  try {
    await fetch('data.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_logs' }) });
    refresh();
  } catch { /* ignore */ }
});

refresh();
loadGroups();
setInterval(refresh, 10_000);
