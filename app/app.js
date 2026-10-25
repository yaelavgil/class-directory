// Class Directory — one app, many directories. Each directory page sets window.CD = { dir, base }.
const CD = window.CD || { dir: null, base: './' };
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const cfg = await import('./config.js').catch(() => ({}));
const useMock = DEMO || !cfg.FIREBASE_CONFIG;
const { api } = useMock ? await import('./api-mock.js') : await import('./api-firebase.js');
let mock = null;
if (useMock) { mock = await import('./api-mock.js'); await mock.seedMock(); }

import { openViewer, openCropper, pickImage } from './photo.js';

// ---------------- helpers ----------------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#app');
const digits = p => String(p || '').replace(/\D/g, '');
const intl = p => { const d = digits(p); return d.startsWith('972') ? d : d.startsWith('0') ? '972' + d.slice(1) : d; };
const fmtPhone = p => {
  const d = digits(p);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9 && /^0[2-9]/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return d;
};
const phoneOk = p => { const d = digits(p); return d.length === 10 || (d.length === 9 && /^0[23489]/.test(d)); };
const fmtBirth = b => { if (!b) return ''; const [y, m, d] = b.split('-'); return `${+d}.${+m}.${y.slice(2)}`; };
const daysToBirthday = b => {
  if (!b) return null;
  const [, m, d] = b.split('-').map(Number);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < now) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next - now) / 864e5);
};
const mapsUrl = (addr, city) => {
  const q = city && !addr.includes(city) ? `${addr}, ${city}` : addr;
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
};
const classLabel = t => (t || '').startsWith('כיתה') ? t : `כיתה ${t || ''}`;
const fullName = k => `${k.first || ''} ${k.last || ''}`.trim();
const byName = (a, b) => (a.last || '').localeCompare(b.last || '', 'he') || (a.first || '').localeCompare(b.first || '', 'he');
const ROLE_HE = { admin: 'מנהל/ת', parent: 'הורה', viewer: 'צפייה' };
const COLORS = { sky: 'תכלת', pink: 'ורוד', mint: 'מנטה', sand: 'חול', lilac: 'לילך' };
const toast = msg => {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  (document.querySelector('dialog[open]') || document.body).append(t); setTimeout(() => t.remove(), 2600);
};
const dirUrl = id => new URL(`${CD.base}${id}/`, location.href).href;

const HE2EN = { א: 'a', ב: 'b', ג: 'g', ד: 'd', ה: 'h', ו: 'v', ז: 'z', ח: 'h', ט: 't', י: 'y', כ: 'k', ך: 'k', ל: 'l', מ: 'm', ם: 'm', נ: 'n', ן: 'n', ס: 's', ע: 'a', פ: 'p', ף: 'f', צ: 'tz', ץ: 'tz', ק: 'k', ר: 'r', ש: 'sh', ת: 't' };
const slugify = (title, year) => {
  const t = title.replace(/^כיתה\s*/, '').split('').map(c => HE2EN[c] ?? c).join('').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const y = (year.match(/\d{4}/) || [''])[0];
  return [t || 'class', y].filter(Boolean).join('-');
};

// Shrinks a picked photo to a 480px centred square JPEG data URL (~40KB) so it fits in a Firestore doc.
async function photoToDataUrl(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = typeof src === 'string' ? src : URL.createObjectURL(src);
  await img.decode();
  const s = Math.min(img.naturalWidth, img.naturalHeight), out = 480;
  const c = document.createElement('canvas'); c.width = c.height = out;
  c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, out, out);
  return c.toDataURL('image/jpeg', 0.8);
}

// ---------------- icons ----------------
const I = {
  balloon: `<svg viewBox="0 0 24 36" class="ic-balloon" aria-hidden="true"><ellipse cx="12" cy="11" rx="8" ry="10" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 6.5c1-2 2.6-3 4.5-3.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M10.6 21h2.8l-1.4 2z" fill="currentColor"/><path d="M12 23c-2 3 2 5 0 8s1 4 0 5" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>`,
  house: `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
  mobile: `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 18.5h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  call: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h2.6l1.4 4-1.9 1.3a11 11 0 0 0 6.5 6.5l1.3-1.9 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" fill="currentColor"/></svg>`,
  wa: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8a9.2 9.2 0 0 0-7.9 13.9L3 21l4.4-1.1A9.2 9.2 0 1 0 12 2.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.7 7.6c.3-.6.6-.6.9-.6h.6c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.5.7c-.1.2-.2.3 0 .6a6.6 6.6 0 0 0 3 2.6c.3.1.4.1.6-.1l.7-.9c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.2.4.4 0 .5-.2 1.3-.9 1.8-.6.5-1.7.6-2.7.2a10.7 10.7 0 0 1-5.6-4.9c-.7-1.3-.6-2.5-.3-3.6z" fill="currentColor"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
};

const DOODLE_BASE = 'https://static.wixstatic.com/media/';
const DOODLES = [
  ['e9f644_0b5a366d6e6f44a0a369aa5efb92fedf~mv2.png', 'left:-1%;top:4%;width:150px;--r:-8deg'],
  ['e9f644_c50eabc9ad394f1cac7bc3b51e7f8f7e~mv2.png', 'left:14%;top:2%;width:140px;--r:-12deg'],
  ['e9f644_7d76e79249304d8cb5ebb35ae61bbd0e~mv2.png', 'left:10%;top:18%;width:56px'],
  ['e9f644_1f8f9a75f1904d6e82571279a22d4fc3~mv2.png', 'right:1%;top:6%;width:110px'],
  ['e9f644_374dafe748c644fb9046269908f60053~mv2.png', 'right:13%;top:16%;width:80px'],
  ['e9f644_3385851639fa491e9481047c0ef10179~mv2.png', 'left:1%;top:44%;width:96px'],
  ['e9f644_fcd6e348d35a4edcb521c188c9eac744~mv2.png', 'right:2%;top:40%;width:70px'],
  ['e9f644_32c7ff9891b14c7da8e9db129a10cfaa~mv2.png', 'left:0;top:70%;width:130px'],
  ['e9f644_732241fa16074f14a2fa542ebe3849d7~mv2.png', 'right:4%;top:66%;width:90px'],
  ['e9f644_ed9670ef7dbc4862a8c3de8d986e6fa8~mv2.png', 'right:0;top:84%;width:70px;--r:14deg'],
  ['e9f644_104e8c0c6547458ba90cdf3929bd5072~mv2.png', 'left:3%;top:90%;width:90px'],
];
const doodlesHtml = () => `<div class="doodles" aria-hidden="true">${DOODLES.map(([f, st]) =>
  `<img src="${DOODLE_BASE}${f}/v1/fill/w_300,h_300,al_c,q_85/d.png" style="${st}" alt="" loading="lazy">`).join('')}</div>`;

// ---------------- state ----------------
const st = {
  user: undefined, creator: false, dirId: CD.dir || params.get('d'), dir: null, member: null, kids: [],
  requests: [], members: [], myReq: null, roster: [], q: '', unsub: [], adminTab: 'requests', busy: false,
};
const isAdmin = () => st.member?.role === 'admin';
const canEdit = k => isAdmin() || (st.user && (k.parentEmails || []).includes(st.user.email));
const fields = () => ({ birth: true, address: true, kidPhone: true, photo: true, ...(st.dir?.settings?.fields || {}) });
const liveKids = () => st.kids.filter(k => !k.deleted).sort(byName);
const clearSubs = () => { st.unsub.forEach(u => u()); st.unsub = []; };

function applyTheme() {
  document.documentElement.dataset.color = st.dir?.color || 'sky';
  if (st.dir) document.title = `דף קשר · ${classLabel(st.dir.title)}`;
}

// ---------------- boot ----------------
if (mock) {
  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  bar.innerHTML = `<b>מצב הדגמה</b> ${mock.PERSONAS.map(p => `<button data-persona="${p.key}">${p.label}</button>`).join('')}`;
  document.body.prepend(bar);
  bar.addEventListener('click', e => {
    const k = e.target.dataset.persona; if (!k) return;
    bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.target));
    mock.setPersona(k);
  });
  if (!st.dirId) st.dirId = 'd3-2026';
}

await api.completeEmailLink(async () => prompt('כדי לסיים את הכניסה, הקלידו שוב את כתובת המייל:')).catch(err => toast('הקישור לא תקין או שפג תוקפו'));

if (st.dirId) {
  st.dir = await api.getDir(st.dirId);
  applyTheme();
}

api.onUser(async u => {
  st.user = u;
  clearSubs();
  st.member = null; st.myReq = null; st.kids = []; st.requests = []; st.members = [];
  st.creator = u ? await api.isCreator() : false;
  if (u && st.dirId && st.dir) {
    st.unsub.push(api.watchDir(st.dirId, d => { st.dir = d; applyTheme(); render(); }));
    st.unsub.push(api.watchMembership(st.dirId, m => {
      const was = st.member?.role;
      st.member = m;
      if (m && !was) startMemberSubs();
      render();
    }));
    st.unsub.push(api.watchMyRequest(st.dirId, u, r => { st.myReq = r; render(); }));
    st.roster = await api.getRoster(st.dirId);
  }
  render();
});

let memberSubs = [];
function startMemberSubs() {
  memberSubs.forEach(u => u()); memberSubs = [];
  memberSubs.push(api.watchKids(st.dirId, ks => { st.kids = ks; syncRoster(); render(); }));
  if (isAdmin()) {
    memberSubs.push(api.watchRequests(st.dirId, r => { st.requests = r; render(); }));
    memberSubs.push(api.watchMembers(st.dirId, m => { st.members = m; render(); }));
  }
  st.unsub.push(() => { memberSubs.forEach(u => u()); memberSubs = []; });
}

// Admins keep the public name list (used on the join screen) in step with the kids collection.
let rosterKey = '';
function syncRoster() {
  if (!isAdmin()) return;
  const names = liveKids().map(k => ({ id: k.id, label: fullName(k) }));
  const key = JSON.stringify(names);
  if (key === rosterKey) return;
  if (rosterKey || key !== JSON.stringify(st.roster)) api.setRoster(st.dirId, names).catch(() => {});
  rosterKey = key; st.roster = names;
}

// ---------------- render ----------------
function render() {
  if (st.user === undefined) { root.innerHTML = `<div class="center"><p class="muted">טוען…</p></div>`; return; }
  if (st.dirId && !st.dir) { root.innerHTML = shell(`<div class="panel"><h2>הדף לא נמצא</h2><p>ייתכן שהקישור שגוי.</p><a class="btn" href="${CD.base}">לדפים שלי</a></div>`); return; }
  if (!st.user) { root.innerHTML = shell(gateView()); return; }
  if (!st.dirId) { homeView(); return; }
  if (!st.member) { root.innerHTML = shell(joinView()); return; }
  root.innerHTML = shell(dirView(), true);
}

const shell = (inner, wide = false) => `${st.dir?.doodles !== false ? doodlesHtml() : ''}<main class="wrap ${wide ? 'wide' : ''}">${inner}</main>`;

const titleBlock = () => st.dir ? `
  <header class="hero">
    <p class="year">${esc(st.dir.year || '')}</p>
    <h1>${esc(classLabel(st.dir.title))}</h1>
    ${st.dir.school ? `<p class="school">${esc(st.dir.school)}</p>` : ''}
  </header>` : `<header class="hero"><p class="year">Class Directory</p><h1>דפי קשר</h1></header>`;

function gateView() {
  return `${titleBlock()}
  <section class="panel gate">
    <h2>כניסה לדף הקשר</h2>
    <p>הדף פתוח רק להורים ולילדי הכיתה. אחרי הכניסה הראשונה, מנהלי הדף יאשרו אותך.</p>
    <button class="btn google" data-act="google"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.4-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.2a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg> כניסה עם Google</button>
    <div class="or"><span>או</span></div>
    <form class="row" data-form="emaillink">
      <input type="email" name="email" required placeholder="כתובת מייל" autocomplete="email" dir="ltr">
      <button class="btn ghost">שליחת קישור כניסה</button>
    </form>
    <p class="hint">נשלח אליך מייל עם קישור. לוחצים עליו וזהו, בלי סיסמה.</p>
  </section>`;
}

async function homeView() {
  root.innerHTML = shell(`${titleBlock()}<section class="panel"><p class="muted">טוען את הדפים שלך…</p></section>`);
  const dirs = await api.myDirs().catch(() => []);
  root.innerHTML = shell(`${titleBlock()}
    ${userBar()}
    <section class="panel">
      <h2>הדפים שלי</h2>
      ${dirs.length ? `<ul class="dirlist">${dirs.map(d => `<li><a href="${dirUrl(d.id)}"><b>${esc(d.title)}</b> <span>${esc(d.year || '')}</span></a><em>${ROLE_HE[d.role]}</em></li>`).join('')}</ul>`
        : `<p class="muted">עוד אין לך דפים. קיבלת קישור מהכיתה? פתחי אותו כדי לבקש הצטרפות.</p>`}
    </section>
    ${st.creator ? `<section class="panel">
      <h2>פתיחת דף קשר חדש</h2>
      <form class="grid2" data-form="newdir">
        <label>שם הכיתה<input name="title" required placeholder="כיתה ד3"></label>
        <label>שנת לימודים<input name="year" required value="${new Date().getFullYear()}-${new Date().getFullYear() + 1}"></label>
        <label>בית ספר<input name="school" placeholder="לא חובה"></label>
        <label>יישוב (לקישורי מפה)<input name="city" placeholder="בת חפר"></label>
        <label class="span2">כתובת הדף<span class="slug" dir="ltr">${esc(new URL(CD.base, location.href).href)}<input name="slug" required pattern="[a-z0-9-]+" placeholder="d3-2026"></span></label>
        <button class="btn span2">פתיחת הדף</button>
      </form>
    </section>` : ''}`);
}

const userBar = () => `<div class="userbar"><span>${esc(st.user.name || st.user.email)}</span>${st.member ? `<em>${ROLE_HE[st.member.role]}</em>` : ''}<a href="${CD.base}" class="link">הדפים שלי</a><button class="link" data-act="signout">יציאה</button></div>`;

function joinView() {
  if (st.myReq) {
    const r = st.myReq;
    const kidNames = (r.kids || []).map(id => st.roster.find(n => n.id === id)?.label).filter(Boolean);
    return `${titleBlock()}${userBar()}
    <section class="panel">
      <h2>הבקשה נשלחה ✓</h2>
      <p>מנהלי הדף יאשרו אותך בקרוב. הדף ייפתח כאן אוטומטית ברגע שתאושר/י.</p>
      <p class="muted">${r.role === 'parent' ? `ביקשת להצטרף כהורה של ${esc([...kidNames, r.newKid ? `${r.newKid.first} ${r.newKid.last}` : ''].filter(Boolean).join(', ') || '…')}` : 'ביקשת להצטרף לצפייה'}</p>
      <button class="btn ghost" data-act="cancelreq">ביטול הבקשה</button>
    </section>`;
  }
  return `${titleBlock()}${userBar()}
  <section class="panel">
    <h2>בקשת הצטרפות</h2>
    <form data-form="join" class="join">
      <fieldset class="seg">
        <label><input type="radio" name="role" value="parent" checked> אני הורה</label>
        <label><input type="radio" name="role" value="viewer"> אני ילד/ה בכיתה</label>
        <label><input type="radio" name="role" value="viewer2"> אחר</label>
      </fieldset>
      <div class="ifparent">
        <p class="lbl">של מי? (אפשר לבחור יותר מאחד)</p>
        <div class="chips pick">${st.roster.map(n => `<label><input type="checkbox" name="kid" value="${esc(n.id)}"><span>${esc(n.label)}</span></label>`).join('') || '<p class="muted">הרשימה עוד ריקה.</p>'}</div>
        <details ${st.roster.length ? '' : 'open'}><summary>הילד/ה שלי לא ברשימה</summary>
          <div class="grid2"><label>שם פרטי<input name="nfirst"></label><label>שם משפחה<input name="nlast"></label></div>
        </details>
      </div>
      <label>משהו שיעזור לזהות אותך (לא חובה)<input name="note" placeholder="למשל: אמא של גור"></label>
      <button class="btn">שליחת בקשה</button>
    </form>
  </section>`;
}

function dirView() {
  const q = st.q.trim();
  const all = liveKids();
  const kids = q ? all.filter(k => [fullName(k), k.address, ...(k.parents || []).map(p => p.name)].join(' ').includes(q)) : all;
  const pend = st.requests.length;
  const canAdd = isAdmin() || st.dir.settings?.joinMode === 'open';
  return `${titleBlock()}${userBar()}
  <div class="toolbar">
    <input type="search" class="search" placeholder="חיפוש ילד/ה, הורה או רחוב" value="${esc(st.q)}" data-act="search">
    ${isAdmin() ? `<button class="chip-btn ${pend ? 'alert' : ''}" data-act="admin" data-tab="requests">בקשות${pend ? ` <b>${pend}</b>` : ''}</button>
      <button class="chip-btn" data-act="admin" data-tab="members">משתמשים</button>
      <button class="chip-btn" data-act="admin" data-tab="roster">רשימת שמות</button>
      <button class="chip-btn" data-act="admin" data-tab="settings">הגדרות</button>
      <button class="chip-btn" data-act="invite">🔗 קישור להזמנה</button>` : ''}
  </div>
  <section class="grid">
    ${canAdd && !q ? `<button class="addcard" data-act="add" aria-label="הוספת ילד/ה"><span>+ הוסף</span></button>` : ''}
    ${kids.map(card).join('') || `<p class="muted">לא נמצאו תוצאות.</p>`}
  </section>
  <section class="list" aria-label="רשימת הילדים">
    ${canAdd && !q ? `<button class="addrow" data-act="add">+ הוספת ילד/ה</button>` : ''}
    ${listSections(kids) || `<p class="muted">לא נמצאו תוצאות.</p>`}
  </section>`;
}

function phoneLine(name, phone, cls = '') {
  if (!phone) return '';
  const ok = phoneOk(phone);
  return `<div class="ph ${cls}">
    ${name ? `<span class="pname">${esc(name)}</span>` : ''}
    <a class="num" href="tel:${digits(phone)}" ${ok ? '' : 'title="נראה שחסרה ספרה במספר"'}>${esc(fmtPhone(phone))}${ok ? '' : ' ⚠️'}</a>
    <span class="acts"><a class="round call" href="tel:${digits(phone)}" aria-label="להתקשר ל${esc(name || 'מספר')}">${I.call}</a><a class="round wa" href="https://wa.me/${intl(phone)}" target="_blank" rel="noopener" aria-label="וואטסאפ ל${esc(name || 'מספר')}">${I.wa}</a></span>
  </div>`;
}

// Phone view: contact-list rows grouped by the first letter of the family name; a tap opens the contact sheet.
function listSections(kids) {
  const groups = [];
  for (const k of kids) {
    const L = (k.last || k.first || '#')[0];
    if (!groups.length || groups.at(-1).L !== L) groups.push({ L, kids: [] });
    groups.at(-1).kids.push(k);
  }
  return groups.map(g => `<div class="sec"><h4>${esc(g.L)}</h4>${g.kids.map(row).join('')}</div>`).join('');
}

function row(k) {
  const f = fields();
  const days = f.birth ? daysToBirthday(k.birth) : null;
  const parents = (k.parents || []).filter(p => p.name).map(p => p.name);
  const sub = [parents.join(' ו'), f.address ? k.address?.split(',')[0] : ''].filter(Boolean).join(' · ');
  return `<button class="row" data-act="open" data-id="${k.id}">
    ${f.photo ? `<span class="av">${k.photo ? `<img src="${esc(k.photo)}" alt="" loading="lazy">` : esc((k.first || '?')[0])}</span>` : ''}
    <span class="rtext"><b>${esc(fullName(k))}</b>${days !== null && days <= 14 ? `<i class="bd">${days === 0 ? '🎉 היום' : `🎈 ${days}`}</i>` : ''}<small>${esc(sub)}</small></span>
    ${isAdmin() && !(k.parentEmails || []).length ? `<span class="dot" title="אין הורה מקושר"></span>` : ''}
    <span class="chev" aria-hidden="true">‹</span>
  </button>`;
}

const ageOf = b => { if (!b) return null; const [y, m, d] = b.split('-').map(Number); const n = new Date(); let a = n.getFullYear() - y; if (n.getMonth() + 1 < m || (n.getMonth() + 1 === m && n.getDate() < d)) a--; return a; };

function contactSheet(k) {
  const f = fields();
  const days = f.birth ? daysToBirthday(k.birth) : null;
  const age = f.birth ? ageOf(k.birth) : null;
  const pr = (label, phone) => phone ? `<div class="crow">
      <div class="cinfo"><span class="clabel">${esc(label)}</span><a class="cnum" href="tel:${digits(phone)}">${esc(fmtPhone(phone))}${phoneOk(phone) ? '' : ' ⚠️'}</a></div>
      <a class="cbtn call" href="tel:${digits(phone)}">${I.call}<span>חיוג</span></a>
      <a class="cbtn wa" href="https://wa.me/${intl(phone)}" target="_blank" rel="noopener">${I.wa}<span>וואטסאפ</span></a>
    </div>` : '';
  const parents = (k.parents || []).filter(p => p.phone || p.name);
  const d = openDialog(`
    <div class="sh-head">
      ${f.photo ? `<button class="sh-photo" data-act="photo" data-id="${k.id}" aria-label="הגדלת התמונה">${k.photo ? `<img src="${esc(k.photo)}" alt="">` : `<span class="initials">${esc((k.first || '?')[0])}</span>`}</button>` : ''}
      <h2>${esc(fullName(k))}</h2>
      ${f.birth && k.birth ? `<p class="sh-birth">🎈 ${fmtBirth(k.birth)}${age !== null ? ` · גיל ${age}` : ''}${days !== null && days <= 14 ? ` · <b>${days === 0 ? 'יום הולדת היום!' : `יום הולדת בעוד ${days} ימים`}</b>` : ''}</p>` : ''}
    </div>
    ${f.kidPhone && k.kidPhone ? `<section class="cgroup"><h3>הנייד של ${esc(k.first)}</h3>${pr(k.first, k.kidPhone)}</section>` : ''}
    ${parents.length ? `<section class="cgroup"><h3>הורים</h3>${parents.map(p => pr([p.role, p.name].filter(Boolean).join(' '), p.phone) || `<div class="crow"><div class="cinfo"><span class="clabel">${esc([p.role, p.name].filter(Boolean).join(' '))}</span></div></div>`).join('')}</section>` : ''}
    ${f.address && k.address ? `<section class="cgroup"><h3>כתובת</h3><a class="caddr" href="${mapsUrl(k.address, st.dir.city)}" target="_blank" rel="noopener">${I.house}<span>${esc(k.address)}</span><em>פתיחה במפות ›</em></a></section>` : ''}
    ${canEdit(k) ? `<button class="btn ghost wide" data-act="edit" data-id="${k.id}">${I.edit} עריכת הפרטים</button>` : ''}
  `, 'sheet');
  return d;
}

function card(k) {
  const f = fields();
  const days = f.birth ? daysToBirthday(k.birth) : null;
  const bday = days === 0 ? `<span class="bday">🎉 יום הולדת היום!</span>` : days !== null && days <= 14 ? `<span class="bday">🎈 יום הולדת בעוד ${days} ימים</span>` : '';
  const parents = (k.parents || []).filter(p => p.name || p.phone);
  const noParent = isAdmin() && !(k.parentEmails || []).length;
  return `<article class="card">
    ${canEdit(k) ? `<button class="editbtn" data-act="edit" data-id="${k.id}" aria-label="עריכת ${esc(fullName(k))}">${I.edit}</button>` : ''}
    ${noParent ? `<span class="flag">אין הורה מקושר</span>` : ''}
    ${f.photo ? `<button class="photo" data-act="photo" data-id="${k.id}" aria-label="התמונה של ${esc(fullName(k))}">${k.photo ? `<img src="${esc(k.photo)}" alt="" loading="lazy">` : `<span class="initials">${esc((k.first || '?')[0])}</span>`}</button>` : ''}
    <h3>${esc(fullName(k))}</h3>
    ${bday}
    ${f.birth && k.birth ? `<div class="birth">${I.balloon}<span>${fmtBirth(k.birth)}</span>${I.balloon}</div>` : ''}
    ${f.address && k.address ? `<a class="addr" href="${mapsUrl(k.address, st.dir.city)}" target="_blank" rel="noopener">${I.house}<span>${esc(k.address)}</span></a>` : ''}
    ${f.kidPhone ? (k.kidPhone ? `<div class="kidphone"><span class="mob">${I.mobile}</span>${phoneLine('', k.kidPhone)}</div>` : `<div class="kidphone empty"><span class="mob">${I.mobile}</span></div>`) : ''}
    ${parents.length ? `<div class="parents">${parents.map(p => phoneLine([p.role, p.name].filter(Boolean).join(' '), p.phone)).join('')}</div>` : ''}
  </article>`;
}

// ---------------- dialogs ----------------
function openDialog(html, cls = '') {
  const d = document.createElement('dialog');
  d.className = cls;
  d.innerHTML = `<button class="x" data-act="close" aria-label="סגירה">×</button>${html}`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  d.showModal();
  return d;
}

function kidDialog(k) {
  const f = fields();
  const isNew = !k;
  k = k || { first: '', last: '', birth: '', address: '', kidPhone: '', parents: [{ role: 'אמא', name: '', phone: '' }, { role: 'אבא', name: '', phone: '' }], parentEmails: [] };
  const pRow = (p = {}) => `<div class="prow">
    <select name="prole">${['אמא', 'אבא', ''].map(r => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${r || '—'}</option>`).join('')}</select>
    <input name="pname" placeholder="שם" value="${esc(p.name || '')}">
    <input name="pphone" type="tel" placeholder="נייד" value="${esc(p.phone || '')}" dir="ltr">
    <button type="button" class="link danger" data-act="delprow" aria-label="הסרה">✕</button></div>`;
  const d = openDialog(`
    <h2>${isNew ? 'הוספת ילד/ה' : `עריכת ${esc(fullName(k))}`}</h2>
    <form data-form="kid" data-id="${isNew ? '' : k.id}">
      ${f.photo ? `<div class="photoedit"><button type="button" class="photo" data-act="dlgphoto" aria-label="בחירת תמונה">${k.photo ? `<img src="${esc(k.photo)}" alt="">` : `<span class="initials">+</span>`}</button>
        <div><button type="button" class="btn ghost" data-act="dlgphoto">${k.photo ? 'החלפה / מיקום וזום' : 'בחירת תמונה'}</button>
        ${k.photo ? `<button type="button" class="link danger" data-act="delphoto">הסרת התמונה</button>` : ''}</div>
        <input type="hidden" name="photo" value="${esc(k.photo || '')}"></div>` : ''}
      <div class="grid2">
        <label>שם פרטי<input name="first" required value="${esc(k.first)}"></label>
        <label>שם משפחה<input name="last" value="${esc(k.last)}"></label>
        ${f.birth ? `<label>תאריך לידה<input type="date" name="birth" value="${esc(k.birth)}"></label>` : ''}
        ${f.kidPhone ? `<label>הנייד של הילד/ה<input type="tel" name="kidPhone" value="${esc(k.kidPhone)}" dir="ltr" placeholder="אם יש"></label>` : ''}
        ${f.address ? `<label class="span2">כתובת<input name="address" value="${esc(k.address)}" placeholder="רחוב ומספר, יישוב"></label>` : ''}
      </div>
      <p class="lbl">הורים</p>
      <div class="prows">${(k.parents || []).map(pRow).join('')}</div>
      <button type="button" class="link" data-act="addprow">+ הוספת הורה</button>
      ${isAdmin() ? `<label class="span2">מיילים של הורים שיכולים לערוך את הכרטיס (מופרדים בפסיק)
        <textarea name="parentEmails" rows="2" dir="ltr">${esc((k.parentEmails || []).join(', '))}</textarea></label>` : ''}
      <div class="dlg-actions">
        <button class="btn">שמירה</button>
        ${isNew ? '' : `<button type="button" class="btn ghost danger" data-act="softdel" data-id="${k.id}">מחיקת הכרטיס</button>`}
      </div>
    </form>`, 'kid-dlg');
  d._pRow = pRow;
}

function adminDialog(tab) {
  st.adminTab = tab;
  const d = openDialog(`<div class="tabs">${[['requests', 'בקשות'], ['members', 'משתמשים'], ['roster', 'רשימת שמות'], ['settings', 'הגדרות'], ['trash', 'סל מחזור']]
    .map(([k, l]) => `<button data-act="tab" data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div><div class="tabbody"></div>`, 'admin-dlg');
  fillAdmin(d);
}

function fillAdmin(d = $('dialog.admin-dlg')) {
  if (!d) return;
  d.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === st.adminTab));
  const body = $('.tabbody', d);
  const kids = liveKids();
  const kidChips = (name, sel = []) => `<div class="chips pick">${kids.map(k => `<label><input type="checkbox" name="${name}" value="${k.id}" ${sel.includes(k.id) ? 'checked' : ''}><span>${esc(fullName(k))}</span></label>`).join('')}</div>`;
  const kidsOf = email => kids.filter(k => (k.parentEmails || []).includes(email));
  const t = st.adminTab;
  if (t === 'requests') {
    body.innerHTML = st.requests.length ? st.requests.map(r => `
      <form class="req" data-form="approve" data-id="${esc(r.id)}">
        <div class="who"><b>${esc(r.name || r.email)}</b> <span dir="ltr">${esc(r.email)}</span></div>
        ${r.note ? `<p class="note">"${esc(r.note)}"</p>` : ''}
        <label class="inline">תפקיד <select name="role">${['parent', 'viewer', 'admin'].map(x => `<option value="${x}" ${(r.role === x) ? 'selected' : ''}>${ROLE_HE[x]}</option>`).join('')}</select></label>
        <p class="lbl">הורה של:</p>${kidChips('kid', r.kids || [])}
        ${r.newKid ? `<label class="inline"><input type="checkbox" name="mknew" checked> ליצור כרטיס חדש: <b>${esc(r.newKid.first)} ${esc(r.newKid.last)}</b></label>` : ''}
        <div class="dlg-actions"><button class="btn">אישור</button><button type="button" class="btn ghost danger" data-act="reject" data-id="${esc(r.id)}">דחייה</button></div>
      </form>`).join('') : `<p class="muted">אין בקשות ממתינות 🎉</p>`;
  } else if (t === 'members') {
    const ms = [...st.members].sort((a, b) => (a.role > b.role ? 1 : -1) || (a.name || '').localeCompare(b.name || '', 'he'));
    body.innerHTML = `
      <form class="addmember" data-form="addmember">
        <p class="lbl">הוספה ידנית (אישור מראש לפי מייל)</p>
        <div class="row"><input type="email" name="email" required placeholder="מייל" dir="ltr">
        <select name="role">${['parent', 'viewer', 'admin'].map(x => `<option value="${x}">${ROLE_HE[x]}</option>`).join('')}</select>
        <select name="kid"><option value="">— ילד/ה —</option>${kids.map(k => `<option value="${k.id}">${esc(fullName(k))}</option>`).join('')}</select>
        <button class="btn">הוספה</button></div>
      </form>
      <ul class="members">${ms.map(m => `<li>
        <div class="who"><b>${esc(m.name || '')}</b> <span dir="ltr">${esc(m.email)}</span></div>
        <select data-act="setrole" data-email="${esc(m.email)}">${['parent', 'viewer', 'admin'].map(x => `<option value="${x}" ${m.role === x ? 'selected' : ''}>${ROLE_HE[x]}</option>`).join('')}</select>
        <div class="linked">${kidsOf(m.email).map(k => `<span class="tag">${esc(fullName(k))}<button data-act="unlink" data-email="${esc(m.email)}" data-id="${k.id}" aria-label="ניתוק">×</button></span>`).join('')}
          <select data-act="link" data-email="${esc(m.email)}"><option value="">+ קישור לילד/ה</option>${kids.filter(k => !kidsOf(m.email).includes(k)).map(k => `<option value="${k.id}">${esc(fullName(k))}</option>`).join('')}</select></div>
        ${m.email === st.user.email ? '' : `<button class="link danger" data-act="rmmember" data-email="${esc(m.email)}">הסרה</button>`}
      </li>`).join('')}</ul>`;
  } else if (t === 'roster') {
    const unclaimed = kids.filter(k => !(k.parentEmails || []).length);
    body.innerHTML = `
      <p>מדביקים את רשימת השמות מהמורה, שם אחד בכל שורה ("שם פרטי שם משפחה"). נוצרים כרטיסים ריקים, וההורים בוחרים מהרשימה כשהם מבקשים להצטרף. שמות שכבר קיימים מדלגים עליהם.</p>
      <form data-form="roster"><textarea name="names" rows="8" placeholder="שם פרטי שם משפחה&#10;שם פרטי שם משפחה"></textarea><button class="btn">הוספה לרשימה</button></form>
      <p class="lbl">${kids.length} ילדים בדף · ${unclaimed.length} עוד בלי הורה מקושר</p>
      ${unclaimed.length ? `<div class="chips">${unclaimed.map(k => `<span class="tag">${esc(fullName(k))}</span>`).join('')}</div>` : ''}`;
  } else if (t === 'settings') {
    const s = st.dir.settings || {}, f = fields();
    body.innerHTML = `<form data-form="settings" class="grid2">
      <label>שם הכיתה<input name="title" required value="${esc(st.dir.title)}"></label>
      <label>שנת לימודים<input name="year" value="${esc(st.dir.year || '')}"></label>
      <label>בית ספר<input name="school" value="${esc(st.dir.school || '')}"></label>
      <label>יישוב (לקישורי מפה)<input name="city" value="${esc(st.dir.city || '')}"></label>
      <label>צבע רקע<select name="color">${Object.entries(COLORS).map(([k, l]) => `<option value="${k}" ${st.dir.color === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="inline"><input type="checkbox" name="doodles" ${st.dir.doodles !== false ? 'checked' : ''}> איורים ברקע</label>
      <fieldset class="span2"><legend>איך מוסיפים ילדים</legend>
        <label class="inline"><input type="radio" name="joinMode" value="roster" ${(s.joinMode || 'roster') === 'roster' ? 'checked' : ''}> מרשימת המורה: הורים בוחרים את הילד שלהם, מנהלים מאשרים</label>
        <label class="inline"><input type="radio" name="joinMode" value="open" ${s.joinMode === 'open' ? 'checked' : ''}> הורה מאושר יכול להוסיף כרטיס לילד שלו</label>
        <label class="inline"><input type="radio" name="joinMode" value="admin" ${s.joinMode === 'admin' ? 'checked' : ''}> רק מנהלים מוסיפים</label>
      </fieldset>
      <fieldset class="span2"><legend>שדות בכרטיס</legend>
        ${[['photo', 'תמונה'], ['birth', 'יום הולדת'], ['address', 'כתובת'], ['kidPhone', 'הנייד של הילד/ה']].map(([k, l]) => `<label class="inline"><input type="checkbox" name="f_${k}" ${f[k] ? 'checked' : ''}> ${l}</label>`).join('')}
      </fieldset>
      <button class="btn span2">שמירת הגדרות</button>
    </form>`;
  } else if (t === 'trash') {
    const del = st.kids.filter(k => k.deleted);
    body.innerHTML = del.length ? `<ul class="members">${del.map(k => `<li><div class="who"><b>${esc(fullName(k))}</b> <span>נמחק על ידי ${esc(k.deletedBy || '')}</span></div>
      <button class="btn ghost" data-act="restore" data-id="${k.id}">שחזור</button><button class="link danger" data-act="harddel" data-id="${k.id}">מחיקה לצמיתות</button></li>`).join('')}</ul>`
      : `<p class="muted">הסל ריק.</p>`;
  }
}

// ---------------- events ----------------
const guard = fn => async (...a) => {
  if (st.busy) return; st.busy = true;
  try { await fn(...a); } catch (err) { console.error(err); toast('משהו השתבש: ' + (err.code || err.message || err)); } finally { st.busy = false; }
};

document.addEventListener('input', e => {
  if (e.target.dataset.act === 'search') {
    st.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const s = $('.search'); s.focus(); s.setSelectionRange(pos, pos);
  }
});

document.addEventListener('change', guard(async e => {
  const el = e.target, a = el.dataset.act;
  if (a === 'setrole') {
    await api.setMember(st.dirId, el.dataset.email, { role: el.value }, st.user);
    toast('התפקיד עודכן');
  } else if (a === 'link' && el.value) {
    await api.linkParent(st.dirId, el.dataset.email, [el.value], true);
    fillAdmin();
  } else if (el.name === 'role' && el.closest('[data-form="join"]')) {
    el.closest('form').querySelector('.ifparent').hidden = el.value !== 'parent';
  }
}));

// Filter before guard(): a plain submit-button click must not mark the app busy, or the submit that follows is dropped.
const onAction = guard(async el => {
  const a = el.dataset.act, id = el.dataset.id;
  if (a === 'close') el.closest('dialog').close();
  else if (a === 'google') await api.signInGoogle();
  else if (a === 'signout') await api.signOut();
  else if (a === 'cancelreq') await api.cancelRequest(st.dirId, st.user);
  else if (a === 'add') kidDialog(null);
  else if (a === 'edit') { el.closest('dialog.sheet')?.close(); kidDialog(st.kids.find(k => k.id === id)); }
  else if (a === 'open') contactSheet(st.kids.find(k => k.id === id));
  else if (a === 'admin') adminDialog(el.dataset.tab);
  else if (a === 'tab') { st.adminTab = el.dataset.tab; fillAdmin(); }
  else if (a === 'addprow') { const f = el.closest('form'); $('.prows', f).insertAdjacentHTML('beforeend', el.closest('dialog')._pRow({ role: '' })); }
  else if (a === 'delprow') el.closest('.prow').remove();
  else if (a === 'delphoto') { const f = el.closest('form'); f.photo.value = ''; f._photo = { remove: true }; $('.photoedit .photo', f).innerHTML = `<span class="initials">+</span>`; el.remove(); }
  else if (a === 'photo') {
    el.closest('dialog.sheet')?.close();
    const k = st.kids.find(x => x.id === id);
    openViewer({
      name: esc(fullName(k)), photo: k.photo, canEdit: canEdit(k),
      getOriginal: () => api.getPhoto(st.dirId, id).catch(() => null),
      onSave: async res => { await api.savePhoto(st.dirId, id, res, st.user); toast(res.remove ? 'התמונה הוסרה' : 'התמונה נשמרה ✓'); },
    });
  } else if (a === 'dlgphoto') {
    const f = el.closest('form');
    let src = f._photo?.original ? { original: f._photo.original, crop: f._photo.crop } : null;
    if (!src && f.dataset.id && f.photo.value) src = (await api.getPhoto(st.dirId, f.dataset.id).catch(() => null)) || { original: f.photo.value, crop: null };
    if (!src) { const o = await pickImage(); if (!o) return; src = { original: o, crop: null }; }
    const res = await openCropper(src);
    if (!res) return;
    f._photo = res; f.photo.value = res.photo;
    $('.photoedit .photo', f).innerHTML = `<img src="${res.photo}" alt="">`;
  }
  else if (a === 'softdel') {
    const k = st.kids.find(x => x.id === id);
    if (!confirm(`למחוק את הכרטיס של ${fullName(k)}? ${isAdmin() ? 'אפשר לשחזר מסל המחזור.' : 'מנהלי הדף יוכלו לשחזר אותו.'}`)) return;
    await api.saveKid(st.dirId, id, { deleted: true, deletedAt: new Date().toISOString(), deletedBy: st.user.email }, st.user);
    el.closest('dialog').close(); toast('הכרטיס הועבר לסל המחזור');
  } else if (a === 'restore') { await api.saveKid(st.dirId, id, { deleted: false }, st.user); fillAdmin(); toast('שוחזר'); }
  else if (a === 'harddel') {
    if (!confirm('מחיקה לצמיתות, בלי אפשרות לשחזר. להמשיך?')) return;
    await api.hardDeleteKid(st.dirId, id); fillAdmin();
  } else if (a === 'reject') {
    const r = st.requests.find(x => x.id === id);
    if (!confirm(`לדחות את הבקשה של ${r.name || r.email}?`)) return;
    await api.reject(st.dirId, r); fillAdmin();
  } else if (a === 'unlink') { await api.linkParent(st.dirId, el.dataset.email, [id], false); fillAdmin(); }
  else if (a === 'rmmember') {
    const email = el.dataset.email;
    if (!confirm(`להסיר את ${email} מהדף?`)) return;
    await api.removeMember(st.dirId, email, st.kids.filter(k => (k.parentEmails || []).includes(email)).map(k => k.id));
    fillAdmin();
  } else if (a === 'invite') {
    const url = dirUrl(st.dirId);
    const text = `הצטרפו לדף הקשר של ${classLabel(st.dir.title)}: ${url}`;
    if (navigator.share) { try { await navigator.share({ title: `דף קשר · ${classLabel(st.dir.title)}`, text, url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); toast('הקישור הועתק'); } catch { prompt('הקישור להזמנה:', url); }
  }
});
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') onAction(el);
});

document.addEventListener('submit', e => {
  const f = e.target, kind = f.dataset.form;
  if (!kind) return;
  e.preventDefault();
  guard(async () => {
    const v = n => (f.elements[n]?.value || '').trim();
    if (kind === 'emaillink') {
      await api.sendEmailLink(v('email'));
      f.innerHTML = `<p class="ok">שלחנו קישור כניסה ל-<b dir="ltr">${esc(v('email') || '')}</b>. אפשר לסגור את הדף ולפתוח את המייל.</p>`;
    } else if (kind === 'newdir') {
      const slug = v('slug').toLowerCase();
      if (await api.dirExists(slug)) { toast('הכתובת הזו כבר תפוסה'); return; }
      await api.createDir(slug, {
        title: v('title'), year: v('year'), school: v('school'), city: v('city'), color: 'sky', doodles: true,
        settings: { joinMode: 'roster', fields: { birth: true, address: true, kidPhone: true, photo: true } },
      }, st.user);
      location.href = `${CD.base}?d=${encodeURIComponent(slug)}${DEMO ? '&demo' : ''}`;
    } else if (kind === 'join') {
      const role = f.role.value === 'parent' ? 'parent' : 'viewer';
      const kids = role === 'parent' ? [...f.querySelectorAll('[name=kid]:checked')].map(x => x.value) : [];
      const newKid = role === 'parent' && v('nfirst') ? { first: v('nfirst'), last: v('nlast') } : null;
      if (role === 'parent' && !kids.length && !newKid) { toast('בחרו ילד/ה מהרשימה, או כתבו שם'); return; }
      await api.requestJoin(st.dirId, st.user, { role, kids, newKid, note: v('note') });
    } else if (kind === 'kid') {
      const parents = [...f.querySelectorAll('.prow')].map(r => ({ role: r.querySelector('[name=prole]').value, name: r.querySelector('[name=pname]').value.trim(), phone: r.querySelector('[name=pphone]').value.trim() })).filter(p => p.name || p.phone);
      const bad = parents.find(p => p.phone && !phoneOk(p.phone));
      if (bad && !confirm(`המספר של ${bad.name || 'ההורה'} (${bad.phone}) לא נראה תקין. לשמור בכל זאת?`)) return;
      const data = { first: v('first'), last: v('last'), parents };
      for (const n of ['birth', 'address', 'kidPhone']) if (f.elements[n]) data[n] = v(n);
      if (isAdmin() && f.elements.parentEmails) data.parentEmails = v('parentEmails').split(/[,\s]+/).map(s => s.toLowerCase()).filter(Boolean);
      let kidId = f.dataset.id;
      if (kidId) await api.saveKid(st.dirId, kidId, data, st.user);
      else {
        if (!isAdmin()) data.parentEmails = [st.user.email];
        kidId = api.newKidId(st.dirId);
        await api.createKid(st.dirId, kidId, { parentEmails: [], photo: '', ...data, deleted: false }, st.user);
      }
      if (f._photo) await api.savePhoto(st.dirId, kidId, f._photo, st.user);
      f.closest('dialog').close(); toast('נשמר ✓');
    } else if (kind === 'approve') {
      const r = st.requests.find(x => x.id === f.dataset.id);
      const kids = [...f.querySelectorAll('[name=kid]:checked')].map(x => x.value);
      const mk = f.elements.mknew?.checked && r.newKid;
      await api.approve(st.dirId, r, {
        role: f.role.value, kids,
        newKidId: mk ? api.newKidId(st.dirId) : null,
        newKid: mk ? { first: r.newKid.first, last: r.newKid.last, birth: '', address: '', kidPhone: '', photo: '', parents: [], deleted: false } : null,
      }, st.user);
      toast(`${r.name || r.email} אושר/ה ✓`);
      fillAdmin();
    } else if (kind === 'addmember') {
      const email = v('email').toLowerCase();
      await api.setMember(st.dirId, email, { role: f.role.value, name: '' }, st.user);
      if (v('kid')) await api.linkParent(st.dirId, email, [v('kid')], true);
      toast('נוסף ✓'); fillAdmin();
    } else if (kind === 'roster') {
      const have = new Set(liveKids().map(fullName));
      const rows = v('names').split('\n').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean).filter(s => !have.has(s));
      const kids = rows.map(s => { const [first, ...rest] = s.split(' '); return { first, last: rest.join(' '), birth: '', address: '', kidPhone: '', photo: '', parents: [], parentEmails: [], deleted: false }; });
      if (!kids.length) { toast('אין שמות חדשים להוספה'); return; }
      await api.addKidsBulk(st.dirId, kids, st.user);
      toast(`נוספו ${kids.length} ילדים`); fillAdmin();
    } else if (kind === 'settings') {
      const fl = {}; for (const k of ['photo', 'birth', 'address', 'kidPhone']) fl[k] = f.elements['f_' + k].checked;
      await api.updateDir(st.dirId, {
        title: v('title'), year: v('year'), school: v('school'), city: v('city'), color: f.color.value, doodles: f.doodles.checked,
        settings: { joinMode: f.joinMode.value, fields: fl },
      });
      toast('ההגדרות נשמרו ✓');
    }
  })();
});

// Admin-only console helper for the one-time Wix import: window.__importKids(arrayFromSeedJson)
window.__importKids = async (kids) => {
  if (!isAdmin()) throw new Error('admins only');
  const out = [];
  for (const k of kids) {
    let photo = '';
    if (k.photo) { try { photo = await photoToDataUrl(k.photo); } catch (err) { console.warn('photo failed', k.first, err); } }
    out.push({ ...k, photo, deleted: false });
  }
  await api.addKidsBulk(st.dirId, out, st.user);
  for (const k of out) if (k.photo) await api.savePhoto(st.dirId, k.id, { photo: k.photo, original: k.photo, crop: null }, st.user);
  return out.length;
};

render();
