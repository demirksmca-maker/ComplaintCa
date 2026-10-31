import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complaintList } from './_shield-complaints.js';

const ok = body => async () => ({ ok: true, status: 200, json: async () => body });

test('complaintList keeps only panel fields', async () => {
  const rows = [{ document: { fields: { ref: { stringValue: 'VC-2026-ABC123' }, title: { stringValue: 'T' }, email: { stringValue: 'a@b.ca' }, isLegal: { booleanValue: false } } } }, {}];
  const r = await complaintList(50, ok(rows));
  assert.equal(r.ok, true);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].ref, 'VC-2026-ABC123');
  assert.equal('email' in r.list[0], false);
});

test('complaintList reports missing service account and Firestore errors', async () => {
  assert.equal((await complaintList(50, async () => null)).reason, 'no_service_account');
  assert.equal((await complaintList(50, async () => ({ ok: false, status: 403 }))).reason, 'firestore_403');
});
