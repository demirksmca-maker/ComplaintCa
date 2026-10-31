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

import { groupOf, deleteComplaint } from './_shield-complaints.js';
test('groupOf places complaints in the six site topics', () => {
  assert.equal(groupOf({ desc: 'Topic: Consumer & Business · Hidden fee\n\nText', category: 'repairs' }), 'consumer');
  assert.equal(groupOf({ desc: 'Topic: Renting & Tenancy\n\nText' }), 'tenancy');
  assert.equal(groupOf({ ref: 'CY-2026-ABC123' }), 'cyber');
  assert.equal(groupOf({ category: 'race' }), 'humanrights');
  assert.equal(groupOf({ category: 'wages' }), 'employment');
  assert.equal(groupOf({ category: 'billing', target: 'landlord' }), 'tenancy');
  assert.equal(groupOf({ category: 'education', target: 'school' }), 'mp');
  assert.equal(groupOf({ category: 'billing', target: 'business' }), 'consumer');
});

test('deleteComplaint removes the complaint and its Case Pool copy', async () => {
  const calls = [];
  const fs = async (url, opts = {}) => {
    calls.push([opts.method || 'GET', url]);
    if (!opts.method) return { ok: true, status: 200, json: async () => ({ fields: { ref: { stringValue: 'VC-2026-ABC123' } } }) };
    if (opts.method === 'POST') return { ok: true, status: 200, json: async () => [{ document: { name: 'projects/p/databases/(default)/documents/replies/r1' } }] };
    return { ok: true, status: 200 };
  };
  const r = await deleteComplaint('doc1', fs);
  assert.equal(r.ok, true);
  const dels = calls.filter(c => c[0] === 'DELETE').map(c => c[1]);
  assert.ok(dels.some(u => u.endsWith('/complaints/doc1')));
  assert.ok(dels.some(u => u.endsWith('/publicFeed/VC-2026-ABC123')));
  assert.ok(dels.some(u => u.endsWith('/replies/r1')));
  assert.equal((await deleteComplaint('../x', fs)).reason, 'bad_id');
  assert.equal((await deleteComplaint('doc1', async () => ({ ok: false, status: 404 }))).reason, 'not_found');
});
