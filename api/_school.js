// Finds an Ontario school (and its school board) by the name the complainant
// wrote, using data/on-schools.json (Ontario Ministry of Education open data,
// refreshed monthly by .github/workflows/on-schools-data.yml).
import fs from 'node:fs';
import path from 'node:path';

let DATA;
function load() {
  if (DATA !== undefined) return DATA;
  // Vercel bundles api/ as CommonJS (no import.meta); the file sits at the project root (vercel.json includeFiles).
  try { DATA = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'on-schools.json'), 'utf8')); }
  catch { DATA = null; }
  return DATA;
}
export function _setData(d) { DATA = d; } // tests

// Words that say what kind of school it is, not which one.
const STOP = new Set(('school schools elementary secondary public catholic separate ps cs ss es ces ess ' +
  'the of and de la le les du des d l ecole elementaire secondaire catholique publique high middle junior senior ' +
  'intermediate academy collegiate institute ci vocational district sr jr campus centre center program').split(' '));

export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’`]s\b/g, '').replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(saint|sainte|ste)\b/g, 'st').replace(/\s+/g, ' ').trim();
}
const core = s => norm(s).split(' ').filter(w => w && !STOP.has(w)).map(w => (w.length > 3 ? w.replace(/s$/, '') : w));

// Elementary vs secondary, when the name says so.
const levelOf = s => (/\b(secondary|high|collegiate|ss|ci|secondaire)\b/i.test(s) ? 'Secondary'
  : /\b(elementary|public school|ps|junior|middle|elementaire)\b/i.test(s) ? 'Elementary' : '');

// Toronto's former boroughs are still listed as their own cities.
const TORONTO = ['toronto', 'north york', 'scarborough', 'etobicoke', 'east york', 'york'];
function cityIn(p, city) {
  const c = norm(city);
  if (!c) return false;
  if (p.includes(' ' + c + ' ')) return true;
  return TORONTO.includes(c) && TORONTO.some(t => p.includes(' ' + t + ' '));
}

function score(a, b) {
  if (!a.length || !b.length) return 0;
  const B = new Set(b);
  const hit = a.filter(w => B.has(w)).length;
  return hit / Math.max(a.length, b.length);
}

// name: the school as written; place: city/address text (optional).
// Returns { school, board } or null when there is no single confident match.
export function findSchool(name, place = '') {
  const d = load();
  if (!d || !name) return null;
  const q = core(name);
  if (!q.length) return null;
  const wantCatholic = /cathol/i.test(name);
  const lv = levelOf(norm(name));
  const p = ' ' + norm(place) + ' ';
  let best = [];
  let top = 0;
  for (const s of d.schools) {
    let sc = score(q, core(s[0]));
    if (sc < 0.75) continue;
    if (lv && s[6] && s[6] !== lv) continue;
    if (cityIn(p, s[1])) sc += 0.5;
    const b = d.boards[s[2]] || {};
    if (wantCatholic && /cathol/i.test(s[0] + ' ' + (b.name || ''))) sc += 0.1;
    if (sc > top + 1e-9) { top = sc; best = [s]; } else if (Math.abs(sc - top) < 1e-9) best.push(s);
  }
  if (best.length !== 1) return null;
  const s = best[0];
  // A place was given but the school is elsewhere: probably a different school.
  if (p.trim() && !cityIn(p, s[1])) return null;
  const f = d.fields;
  const school = Object.fromEntries(f.map((k, i) => [k, s[i] || '']));
  const b = d.boards[s[2]] || {};
  return {
    school,
    board: { number: s[2], name: b.name || '', type: b.type || '', web: b.web || '', phone: b.phone || '', email: b.email || '', addr: b.addr || '' },
    source: d.dataset, updated: d.updated
  };
}
