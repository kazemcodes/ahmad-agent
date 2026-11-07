// Ahmad Dashboard — app logic
const $ = id => document.getElementById(id);

const LABELS = {
  overview: 'نمای کلی',
  attendance: 'حضور امروز',
  messages: 'پیام‌های کلاس',
  memory: 'حافظه گفتگو',
  logs: 'گزارش اجرا',
};
const SUBS = {
  overview: 'کلاس‌ها، گفتگوها و وضعیت اجرا در یک نگاه',
  attendance: 'دانش‌آموزانی که امروز حاضر شدند — با تعداد پیام',
  messages: 'آخرین پیام‌های ذخیره‌شده در دیتابیس',
  memory: 'آخرین نوبت‌های گفتگو برای هر دانش‌آموز',
  logs: 'آخرین رویدادها و خطاهای برنامه',
};

function openTab(name) {
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.id === 'tab-' + name));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.tab === name));
  $('pageTitle').textContent = LABELS[name] || name;
  $('pageSub').textContent = SUBS[name] || '';
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
function fmtNum(n) { return (n || 0).toLocaleString('fa-IR'); }

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

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

function showAttendance(rows) {
  const c = $('attendanceList');
  c.replaceChildren();
  if (!rows.length) {
    c.append(el('p', 'empty', 'امروز هنوز هیچ حضوری ثبت نشده است.'));
    $('attendanceSummary').textContent = 'هنوز کسی امروز حاضر نشده';
    return;
  }
  $('attendanceSummary').textContent = `${fmtNum(rows.length)} نفر امروز حاضر شدند`;
  rows.forEach((r, i) => {
    const row = el('div', 'att-item');
    const head = el('div', 'att-head');
    const rank = el('span', 'att-rank', String(i + 1));
    const name = el('strong', null, r.name);
    name.prepend(rank);
    const time = el('time', null, fmtTime(r.at));
    head.append(name, time);
    const meta = el('div', 'att-meta');
    const t = el('span', 'att-time', `🕒 ${new Date(r.at * 1000).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`);
    const cnt = el('span', 'att-count', `💬 ${fmtNum(r.msg_count)} پیام`);
    meta.append(t, cnt);
    row.append(head, meta);
    c.append(row);
  });
}

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
    $('statMemory').textContent = fmtNum(d.stats.conversation_turns);

    showMessages($('recentMessages'), d.messages.slice(0, 5), 'messages');
    showMessages($('messageList'), d.messages, 'messages');
    showMessages($('memoryList'), d.memory, 'memory');
    showAttendance(d.attendanceToday || []);

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
$('exportBtn').addEventListener('click', () => {
  const rows = $('attendanceList').querySelectorAll('.att-item');
  if (!rows.length) return;
  let csv = 'نام,زمان,تعداد پیام\n';
  rows.forEach(row => {
    const name = row.querySelector('strong')?.textContent?.replace(/^\d+\.\s*/, '').trim() || '';
    const meta = row.querySelector('.att-meta')?.textContent?.trim() || '';
    csv += `"${name}","${meta}"\n`;
  });
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'attendance-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});
$('clearLogsBtn').addEventListener('click', async () => {
  try {
    await fetch('data.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_logs' }) });
    refresh();
  } catch { /* ignore */ }
});

refresh();
setInterval(refresh, 10_000);
