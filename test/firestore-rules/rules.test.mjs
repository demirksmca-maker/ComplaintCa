import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A complete, rule-valid complaint document. Individual tests mutate a
// shallow copy of this to isolate exactly one field at a time.
function validComplaint(overrides = {}) {
  return {
    ref: 'VC-2026-AB23CD',
    title: 'Test complaint',
    desc: 'Something happened that I am complaining about.',
    category: 'noise',
    status: 'received',
    date: '2026-07-27',
    anonymous: false,
    email: 'someone@example.com',
    timeline: [{ status: 'received', date: '2026-07-27' }],
    ...overrides
  };
}

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-complaintca',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080
    }
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('create (isValidNewComplaint)', () => {
  test('accepts a fully valid complaint', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(db.collection('complaints').doc('c1').set(validComplaint()));
  });

  test('rejects a document missing a required field', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const doc = validComplaint();
    delete doc.date;
    await assertFails(db.collection('complaints').doc('c1').set(doc));
  });

  test('rejects a ref that does not match the VC/CY-YYYY-XXXXXX pattern', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').set(validComplaint({ ref: 'BAD-REF' })));
  });

  test('accepts a CY- prefixed ref (cyberbullying track)', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(db.collection('complaints').doc('c1').set(validComplaint({ ref: 'CY-2026-XY99ZZ' })));
  });

  test('rejects an empty title', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').set(validComplaint({ title: '' })));
  });

  test('rejects a title over 200 characters', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').set(validComplaint({ title: 'x'.repeat(201) })));
  });

  test('rejects a desc over 5000 characters', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').set(validComplaint({ desc: 'x'.repeat(5001) })));
  });

  test('rejects forging a non-"received" status on create', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').set(validComplaint({ status: 'resolved' })));
  });

  test('rejects a malformed email', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').set(validComplaint({ email: 'not-an-email' })));
  });

  test('rejects anonymous being a non-boolean', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').set(validComplaint({ anonymous: 'false' })));
  });

  test('rejects a timeline that is not exactly one entry', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').set(validComplaint({ timeline: [] })));
    await assertFails(db.collection('complaints').doc('c2').set(validComplaint({
      timeline: [{ status: 'received' }, { status: 'received' }]
    })));
  });

  // firestore.rules' header comment claims submissions can't carry "arbitrary
  // extra fields", but isValidNewComplaint only checks keys().hasAll([...]),
  // never hasOnly(...) — so nothing in the rule actually rejects extra keys.
  // This test documents the real (looser) behavior rather than the comment's
  // claim; if that's unintended, isValidNewComplaint needs a hasOnly check.
  test('[discrepancy] currently ACCEPTS a document with an extra, undeclared field', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(db.collection('complaints').doc('c1').set(validComplaint({ isLegal: true, admin: true })));
  });
});

describe('read (isLegal gating)', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.collection('complaints').doc('public').set(validComplaint({ ref: 'VC-2026-PUB001' }));
      await db.collection('complaints').doc('legal').set(validComplaint({ ref: 'VC-2026-LEG001', isLegal: true }));
    });
  });

  test('anyone can read a non-legal complaint', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(db.collection('complaints').doc('public').get());
  });

  test('signed-out users cannot read an isLegal complaint', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('legal').get());
  });

  test('any signed-in user can read an isLegal complaint', async () => {
    const db = testEnv.authenticatedContext('lawyer-uid').firestore();
    await assertSucceeds(db.collection('complaints').doc('legal').get());
  });
});

describe('update (isStatusOnlyUpdate)', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('complaints').doc('c1').set(validComplaint());
    });
  });

  test('allows changing status and timeline only', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(db.collection('complaints').doc('c1').update({
      status: 'in_progress',
      timeline: [{ status: 'received' }, { status: 'in_progress' }]
    }));
  });

  test('rejects changing the email while updating status', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').update({
      status: 'in_progress',
      email: 'attacker@example.com'
    }));
  });

  test('rejects changing the ref', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').update({ ref: 'VC-2026-HACKED' }));
  });

  test('rejects changing the desc, title, or anonymous flag', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').update({ desc: 'rewritten' }));
    await assertFails(db.collection('complaints').doc('c1').update({ title: 'rewritten' }));
    await assertFails(db.collection('complaints').doc('c1').update({ anonymous: true }));
  });

  test('rejects setting status to a non-string', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').update({ status: 123 }));
  });
});

describe('delete', () => {
  test('allows deleting a document that has ref and email', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('complaints').doc('c1').set(validComplaint());
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(db.collection('complaints').doc('c1').delete());
  });

  test('rejects deleting a document missing ref/email', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('complaints').doc('c1').set({ status: 'received' });
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('complaints').doc('c1').delete());
  });
});

describe('default deny', () => {
  test('denies read/write on any collection other than complaints', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('users').doc('u1').set({ name: 'x' }));
    await assertFails(db.collection('users').doc('u1').get());
  });
});
