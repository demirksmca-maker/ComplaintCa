// GET /api/shield?complaints=1 → the latest complaints for the owner's shield page.
// Read with the service account (the rules keep them closed to the public), and
// only the fields the panel shows: never the e-mail, name or story text.
import { fsAdmin, FS } from './_gauth.js';

const FIELDS = ['ref', 'title', 'category', 'status', 'date', 'city', 'targetName', 'isLegal', 'anonymous'];
const val = f => f == null ? null : (f.stringValue ?? f.booleanValue ?? f.integerValue ?? f.timestampValue ?? null);

export async function complaintList(limit = 50, fs = fsAdmin) {
  const body = { structuredQuery: {
    from: [{ collectionId: 'complaints' }],
    select: { fields: FIELDS.map(fieldPath => ({ fieldPath })) },
    orderBy: [{ field: { fieldPath: 'date' }, direction: 'DESCENDING' }],
    limit: Math.min(Math.max(Number(limit) || 50, 1), 100)
  } };
  const r = await fs(`${FS}:runQuery`, { method: 'POST', body: JSON.stringify(body) });
  if (!r) return { ok: false, reason: 'no_service_account' };
  if (!r.ok) return { ok: false, reason: 'firestore_' + r.status };
  const rows = await r.json();
  const list = (Array.isArray(rows) ? rows : []).filter(x => x.document).map(x => {
    const f = x.document.fields || {};
    return Object.fromEntries(FIELDS.map(k => [k, val(f[k])]));
  });
  return { ok: true, list };
}
