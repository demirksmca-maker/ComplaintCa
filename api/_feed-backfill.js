// The public list (publicFeed) behind the Case Pool's notices, kept in step with
// the complaints from the Dias Panel (POST /api/shield):
//   {backfillFeed:1}          → every non-test, non-legal complaint gets its summary
//                               (written again, so a missing title is filled in);
//   {poolComplaint:id, on}    → one complaint shown in / taken out of the pool.
// Only the anonymous summary is written (publicSummary), never a name, e-mail or story.
import { fsAdmin, FS } from './_gauth.js';
import { publicSummary } from './_complaint-core.js';

const REF = /^(VC|CY)-\d{4}-[A-Z0-9]{6}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const READ = ['ref', 'title', 'desc', 'category', 'location', 'date', 'priority', 'isLegal', 'test'];

const str = v => (v && (v.stringValue ?? v.timestampValue)) || '';

// Legal-track complaints already show in the pool from the complaints collection.
// Old filings without a test field count as real; the panel can take one out (poolComplaint).
export function isPublishable(f) {
  if (!REF.test(str(f.ref)) || (f.isLegal && f.isLegal.booleanValue)) return false;
  return !(f.test && f.test.booleanValue === true);
}

// Admin writes may also carry the priority (the Case Pool's red / lilac dot); the
// public rules only allow the summary fields, so browser writes go without it.
export function summaryFields(f) {
  const s = publicSummary({ ref: str(f.ref), title: str(f.title), desc: str(f.desc).replace(/^Topic: [^\n]*\n+/, ''),
    category: str(f.category), location: str(f.location), date: str(f.date) });
  if (['low', 'medium', 'high'].includes(str(f.priority))) s.priority = str(f.priority);
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { stringValue: String(v || '').slice(0, 80) }]));
}

const write = (fs, f) => fs(`${FS}/publicFeed/${str(f.ref)}`, { method: 'PATCH', body: JSON.stringify({ fields: summaryFields(f) }) });

export async function backfillFeed(fs = fsAdmin) {
  const query = { structuredQuery: { from: [{ collectionId: 'complaints' }], limit: 2000,
    select: { fields: READ.map(fieldPath => ({ fieldPath })) } } };
  const r = await fs(`${FS}:runQuery`, { method: 'POST', body: JSON.stringify(query) });
  if (!r) return { ok: false, reason: 'no_service_account' };
  if (!r.ok) return { ok: false, reason: 'query_' + r.status };
  const rows = (await r.json()).filter(x => x.document).map(x => x.document.fields || {}).filter(isPublishable);
  let written = 0, failed = 0;
  for (const f of rows) {
    const w = await write(fs, f);
    if (w && w.ok) written++; else failed++;
  }
  return { ok: true, checked: rows.length, written, failed };
}

export async function poolComplaint(id, on, fs = fsAdmin) {
  if (!ID.test(String(id || ''))) return { ok: false, reason: 'bad_id' };
  const got = await fs(`${FS}/complaints/${id}`);
  if (!got) return { ok: false, reason: 'no_service_account' };
  if (got.status === 404) return { ok: false, reason: 'not_found' };
  if (!got.ok) return { ok: false, reason: 'firestore_' + got.status };
  const f = (await got.json()).fields || {};
  if (!REF.test(str(f.ref))) return { ok: false, reason: 'bad_ref' };
  if (f.isLegal && f.isLegal.booleanValue) return { ok: true, pool: true };
  const w = on ? await write(fs, f) : await fs(`${FS}/publicFeed/${str(f.ref)}`, { method: 'DELETE' });
  if (!w || (!w.ok && w.status !== 404)) return { ok: false, reason: 'write_failed' };
  return { ok: true, pool: !!on };
}
