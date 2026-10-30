// The rules suite needs the local Firestore emulator (`npm test` here starts it and sets
// FIRESTORE_EMULATOR_HOST). A plain root `node --test` run skips it instead of failing.
import { test } from 'node:test';

if (process.env.FIRESTORE_EMULATOR_HOST) await import('./rules.suite.mjs');
else test('firestore rules', { skip: 'needs the Firestore emulator: cd test/firestore-rules && npm install && npm test' }, () => {});
