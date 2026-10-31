// GET /api/shield?complaints=1 → the latest complaints for the owner's shield page.
// POST /api/shield {deleteComplaint:id} → deletes one complaint everywhere it shows.
// Read with the service account (the rules keep them closed to the public), and
// only the fields the panel shows (story text included, never the e-mail).
import { fsAdmin, FS } from './_gauth.js';

const FIELDS = ['ref', 'title', 'category', 'status', 'date', 'location', 'targetName', 'target', 'ctype', 'isLegal', 'anonymous', 'name', 'test', 'desc'];
const val = f => f == null ? null : (f.stringValue ?? f.booleanValue ?? f.integerValue ?? f.timestampValue ?? null);
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const REF = /^(VC|CY)-\d{4}-[A-Z0-9]{6}$/;

// The six topics of the site's complaint form (assets/complaint-steps.js CATS).
export const GROUPS = ['consumer', 'tenancy', 'employment', 'humanrights', 'cyber', 'mp'];
const TOPIC = { 'Consumer & Business': 'consumer', 'Renting & Tenancy': 'tenancy', 'Work & Employment': 'employment',
  'Human Rights': 'humanrights', 'Cyber Crime & Fraud': 'cyber', 'Government Service': 'mp' };
const RIGHTS = ['race', 'gender', 'religion', 'disability', 'age', 'sexual', 'language', 'indigenous', 'disc'];
const WORK = ['wages', 'wrongful', 'harassment'];
const HOME = ['repairs', 'property'];
const GOV = ['immigration', 'benefits', 'delays', 'police', 'studentloan', 'education', 'noise', 'road', 'garbage', 'utility', 'transit', 'construction', 'environment', 'animal'];

// Which of the six topics a complaint belongs to. New-form filings start with
// "Topic: <topic> · <subtopic>"; older ones are placed by category and target.
export function groupOf(c) {
  const m = /^Topic: ([^·\n]+?)\s*(·|\n|$)/.exec(String(c.desc || ''));
  if (m && TOPIC[m[1]]) return TOPIC[m[1]];
  const cat = c.category || '';
  if (/^CY-/.test(c.ref || '') || cat === 'cybercrime') return 'cyber';
  if (RIGHTS.includes(cat)) return 'humanrights';
  if (WORK.includes(cat) || c.target === 'employer') return 'employment';
  if (HOME.includes(cat) || c.target === 'landlord') return 'tenancy';
  if (GOV.includes(cat) || ['government', 'municipality', 'school'].includes(c.target)) return 'mp';
  return 'consumer';
}

async function feedRefs(fs) {
  const refs = new Set();
  let token = '';
  for (let page = 0; page < 20; page++) {
    const r = await fs(`${FS}/publicFeed?pageSize=300&mask.fieldPaths=ref${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
    if (!r || !r.ok) return null;
    const j = await r.json();
    (j.documents || []).forEach(d => refs.add(d.name.split('/').pop()));
    if (!j.nextPageToken) return refs;
    token = j.nextPageToken;
  }
  return refs;
}

export async function complaintList(limit = 100, fs = fsAdmin) {
  const body = { structuredQuery: {
    from: [{ collectionId: 'complaints' }],
    select: { fields: FIELDS.map(fieldPath => ({ fieldPath })) },
    orderBy: [{ field: { fieldPath: 'date' }, direction: 'DESCENDING' }],
    limit: Math.min(Math.max(Number(limit) || 100, 1), 100)
  } };
  const [r, feed] = await Promise.all([fs(`${FS}:runQuery`, { method: 'POST', body: JSON.stringify(body) }), feedRefs(fs).catch(() => null)]);
  if (!r) return { ok: false, reason: 'no_service_account' };
  if (!r.ok) return { ok: false, reason: 'firestore_' + r.status };
  const rows = await r.json();
  const list = (Array.isArray(rows) ? rows : []).filter(x => x.document).map(x => {
    const f = x.document.fields || {};
    const c = Object.fromEntries(FIELDS.map(k => [k, val(f[k])]));
    c.id = String(x.document.name || '').split('/').pop();
    c.group = groupOf(c);
    // The Case Pool shows legal-track complaints and everything in publicFeed.
    c.pool = c.isLegal === true || (feed ? feed.has(c.ref) : null);
    if (c.anonymous === true) c.name = null;
    return c;
  });
  return { ok: true, list };
}

// Deletes the complaint, its Case Pool copy (publicFeed), cached precedents and institution replies.
export async function deleteComplaint(id, fs = fsAdmin) {
  if (!ID.test(String(id || ''))) return { ok: false, reason: 'bad_id' };
  const got = await fs(`${FS}/complaints/${id}`);
  if (!got) return { ok: false, reason: 'no_service_account' };
  if (got.status === 404) return { ok: false, reason: 'not_found' };
  if (!got.ok) return { ok: false, reason: 'firestore_' + got.status };
  const ref = val(((await got.json()).fields || {}).ref) || '';
  const del = await fs(`${FS}/complaints/${id}`, { method: 'DELETE' });
  if (!del || !del.ok) return { ok: false, reason: 'delete_failed' };
  const extra = [fs(`${FS}/precedents/${id}`, { method: 'DELETE' })];
  if (REF.test(ref)) {
    extra.push(fs(`${FS}/publicFeed/${ref}`, { method: 'DELETE' }));
    const q = { structuredQuery: { from: [{ collectionId: 'replies' }], limit: 100,
      where: { fieldFilter: { field: { fieldPath: 'ref' }, op: 'EQUAL', value: { stringValue: ref } } } } };
    extra.push(fs(`${FS}:runQuery`, { method: 'POST', body: JSON.stringify(q) }).then(async rr => {
      const docs = rr && rr.ok ? (await rr.json()).filter(x => x.document) : [];
      await Promise.all(docs.map(x => fs(`https://firestore.googleapis.com/v1/${x.document.name}`, { method: 'DELETE' })));
    }));
  }
  await Promise.all(extra.map(p => p.catch(() => null)));
  return { ok: true, ref };
}
