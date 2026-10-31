// Copies real complaints that are missing from the public list (publicFeed)
// into it, as the anonymous summary only. Run from the Dias Panel
// (POST /api/shield {backfillFeed:1}). Needed once because the live
// Firestore rules rejected every publicFeed write from Oct 28 to Oct 31.
import { fsAdmin, FS } from './_gauth.js';
import { publicSummary } from './_complaint-core.js';

// Browser-form filings (no test field) only count from the day they started
// copying themselves to publicFeed; older ones were mostly development data.
const BROWSER_FROM = '2026-10-28';
const REF = /^(VC|CY)-\d{4}-[A-Z0-9]{6}$/;

const str = v => (v && (v.stringValue ?? v.timestampValue)) || '';

export function isPublishable(f) {
  if (!REF.test(str(f.ref)) || (f.isLegal && f.isLegal.booleanValue)) return false;
  if (f.test) return f.test.booleanValue === false;
  return str(f.date) >= BROWSER_FROM;
}

export async function backfillFeed() {
  const query = { structuredQuery: { from: [{ collectionId: 'complaints' }], limit: 2000,
    select: { fields: ['ref', 'title', 'desc', 'category', 'location', 'date', 'isLegal', 'test'].map(fieldPath => ({ fieldPath })) } } };
  const r = await fsAdmin(`${FS}:runQuery`, { method: 'POST', body: JSON.stringify(query) });
  if (!r) return { ok: false, reason: 'no_service_account' };
  if (!r.ok) return { ok: false, reason: 'query_' + r.status };
  const rows = (await r.json()).filter(x => x.document).map(x => x.document.fields || {}).filter(isPublishable);
  let added = 0, existed = 0, failed = 0;
  for (const f of rows) {
    const s = publicSummary({ ref: str(f.ref), title: str(f.title), desc: str(f.desc), category: str(f.category), location: str(f.location), date: str(f.date) });
    const fields = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { stringValue: String(v || '').slice(0, 80) }]));
    const w = await fsAdmin(`${FS}/publicFeed?documentId=${encodeURIComponent(s.ref)}`, { method: 'POST', body: JSON.stringify({ fields }) });
    if (w && w.ok) added++; else if (w && w.status === 409) existed++; else failed++;
  }
  return { ok: true, checked: rows.length, added, existed, failed };
}
