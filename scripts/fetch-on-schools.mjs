// Downloads the Ontario Ministry of Education open data (publicly funded
// schools + school boards) from data.ontario.ca and writes a compact
// data/on-schools.json used to route school complaints to the right
// school and board. Runs in GitHub Actions (scheduled); needs no secrets.
//
// Source: https://data.ontario.ca/dataset/ontario-public-school-contact-information
// Licence: Open Government Licence – Ontario.
import fs from 'node:fs';

const CKAN = 'https://data.ontario.ca/api/3/action/package_show?id=';
const SCHOOLS_PKG = 'ontario-public-school-contact-information';
const BOARDS_PKG = 'school-board-and-school-authority-contact-information';
const OUT = 'data/on-schools.json';

async function pkg(id) {
  const r = await fetch(CKAN + id);
  if (!r.ok) throw new Error(id + ': HTTP ' + r.status);
  return (await r.json()).result;
}

// Newest English CSV/XLSX resource (French files are skipped).
function pickResource(p) {
  const ok = p.resources.filter(r => /csv|xlsx?/i.test(r.format || r.url) && !/fran|french|\bfr\b/i.test(r.name || ''));
  ok.sort((a, b) => String(b.last_modified || b.created).localeCompare(String(a.last_modified || a.created)));
  if (!ok.length) throw new Error(p.name + ': no CSV/XLSX resource');
  return ok[0];
}

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function readTable(res) {
  const r = await fetch(res.url);
  if (!r.ok) throw new Error(res.url + ': HTTP ' + r.status);
  let rows;
  if (/xlsx?/i.test(res.format || '') || /\.xlsx?$/i.test(res.url)) {
    const XLSX = (await import('xlsx')).default;
    const wb = XLSX.read(Buffer.from(await r.arrayBuffer()));
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
  } else {
    // Ministry CSVs are often Windows-1252, not UTF-8.
    const buf = Buffer.from(await r.arrayBuffer());
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    rows = parseCsv(text.replace(/^﻿/, ''));
  }
  const h = rows.findIndex(x => x.some(c => /board/i.test(c)) && x.length > 3);
  const head = rows[h].map(c => String(c).trim());
  return { head, rows: rows.slice(h + 1).filter(x => x.some(c => String(c).trim())) };
}

// Finds a column by trying patterns in order (headers vary between releases).
function col(head, ...pats) {
  for (const p of pats) { const i = head.findIndex(c => p.test(c)); if (i >= 0) return i; }
  return -1;
}
const get = (row, i) => (i >= 0 ? String(row[i] ?? '').replace(/\s+/g, ' ').trim() : '');

const sp = await pkg(SCHOOLS_PKG);
const sres = pickResource(sp);
const S = await readTable(sres);
console.log('schools resource:', sres.name, sres.url);
console.log('schools headers:', S.head.join(' | '));
const c = {
  bnum: col(S.head, /^board number/i, /board.*(no|num|#)/i),
  bname: col(S.head, /^board name/i),
  btype: col(S.head, /^board type/i),
  bweb: col(S.head, /board.*web/i),
  name: col(S.head, /^school name/i),
  num: col(S.head, /^school number/i),
  level: col(S.head, /school level/i),
  type: col(S.head, /^school type/i),
  lang: col(S.head, /school language/i),
  street: col(S.head, /^street/i),
  city: col(S.head, /^city/i, /municipality/i),
  postal: col(S.head, /postal/i),
  phone: col(S.head, /^phone/i, /telephone/i),
  email: col(S.head, /school.*e-?mail/i, /e-?mail/i),
  web: col(S.head, /school.*web/i, /^website/i)
};
console.log('column map:', JSON.stringify(c));
for (const k of ['bnum', 'bname', 'name', 'city']) if (c[k] < 0) throw new Error('missing column: ' + k);

const boards = {};
const schools = [];
for (const r of S.rows) {
  const bn = get(r, c.bnum), name = get(r, c.name);
  if (!bn || !name) continue;
  if (!boards[bn]) boards[bn] = { name: get(r, c.bname), type: get(r, c.btype), web: get(r, c.bweb) };
  schools.push([name, get(r, c.city), bn, get(r, c.email).toLowerCase(), get(r, c.phone), get(r, c.web),
    get(r, c.level), get(r, c.street), get(r, c.postal), get(r, c.num)]);
}

// Board contact list (phone, address, website, email when published).
try {
  const bp = await pkg(BOARDS_PKG);
  const bres = pickResource(bp);
  const B = await readTable(bres);
  console.log('boards resource:', bres.name, bres.url);
  console.log('boards headers:', B.head.join(' | '));
  const d = {
    num: col(B.head, /^board number/i, /board.*(no|num|#)/i),
    phone: col(B.head, /^phone/i, /telephone/i),
    email: col(B.head, /e-?mail/i),
    web: col(B.head, /web/i),
    street: col(B.head, /^street/i, /address/i),
    city: col(B.head, /^city/i, /municipality/i),
    postal: col(B.head, /postal/i)
  };
  for (const r of B.rows) {
    const b = boards[get(r, d.num)];
    if (!b) continue;
    b.phone = get(r, d.phone); b.email = get(r, d.email).toLowerCase();
    b.web = b.web || get(r, d.web);
    b.addr = [get(r, d.street), get(r, d.city), get(r, d.postal)].filter(Boolean).join(', ');
  }
} catch (e) { console.warn('board contacts skipped:', e.message); }

const out = {
  source: 'Ontario Ministry of Education open data (Open Government Licence – Ontario)',
  dataset: 'https://data.ontario.ca/dataset/' + SCHOOLS_PKG,
  resource: sres.name,
  updated: String(sres.last_modified || sres.created || '').slice(0, 10),
  fields: ['name', 'city', 'board', 'email', 'phone', 'web', 'level', 'street', 'postal', 'number'],
  count: schools.length,
  boards,
  schools
};
if (schools.length < 3000) throw new Error('too few schools (' + schools.length + '); refusing to overwrite');
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT, schools.length, 'schools,', Object.keys(boards).length, 'boards,',
  schools.filter(s => s[3]).length, 'with email');
