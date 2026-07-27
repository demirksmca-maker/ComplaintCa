import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isRateLimited } from './_rateLimit.js';

// Each test uses its own unique bucket name so the module-level in-memory
// map (shared across every test in this file/process) never leaks state
// between cases, regardless of execution order.
let bucketCounter = 0;
function uniqueBucket() {
  bucketCounter++;
  return `test-bucket-${bucketCounter}-${Date.now()}`;
}

// Ensure Upstash env vars are unset by default (memory-limiter path) and
// restored after every test, since a leaked value would silently switch
// later tests onto the Redis path.
const ENV_KEYS = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  delete globalThis.fetch;
  globalThis.fetch = originalFetch;
});

const originalFetch = globalThis.fetch;

describe('isRateLimited — in-memory fallback (no Upstash env vars)', () => {
  test('allows requests up to the limit, blocks the one after', async () => {
    const bucket = uniqueBucket();
    const opts = { limit: 3, windowMs: 60000, bucket };

    assert.equal(await isRateLimited('1.2.3.4', opts), false); // 1st
    assert.equal(await isRateLimited('1.2.3.4', opts), false); // 2nd
    assert.equal(await isRateLimited('1.2.3.4', opts), false); // 3rd (== limit, still allowed)
    assert.equal(await isRateLimited('1.2.3.4', opts), true);  // 4th (> limit, blocked)
  });

  test('tracks different IPs independently under the same bucket', async () => {
    const bucket = uniqueBucket();
    const opts = { limit: 1, windowMs: 60000, bucket };

    assert.equal(await isRateLimited('1.1.1.1', opts), false);
    assert.equal(await isRateLimited('2.2.2.2', opts), false); // different IP, own counter
    assert.equal(await isRateLimited('1.1.1.1', opts), true);  // same IP again, now over limit
  });

  test('tracks different buckets independently for the same IP', async () => {
    const bucketA = uniqueBucket();
    const bucketB = uniqueBucket();

    assert.equal(await isRateLimited('9.9.9.9', { limit: 1, windowMs: 60000, bucket: bucketA }), false);
    assert.equal(await isRateLimited('9.9.9.9', { limit: 1, windowMs: 60000, bucket: bucketB }), false);
    assert.equal(await isRateLimited('9.9.9.9', { limit: 1, windowMs: 60000, bucket: bucketA }), true);
  });

  test('resets the count once the window elapses', async () => {
    const bucket = uniqueBucket();
    const opts = { limit: 1, windowMs: 1000, bucket };
    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      assert.equal(await isRateLimited('5.5.5.5', opts), false); // 1st, starts window
      assert.equal(await isRateLimited('5.5.5.5', opts), true);  // 2nd, still in window
      now += 1001; // advance past windowMs
      assert.equal(await isRateLimited('5.5.5.5', opts), false); // window reset, allowed again
    } finally {
      Date.now = realNow;
    }
  });

  test('uses default limit/window/bucket when options are omitted', async () => {
    // Default limit is 10 within a 60s window under bucket 'default'.
    // Use an IP unlikely to collide with any other default-bucket test.
    const ip = `10.${uniqueBucket()}`;
    for (let i = 0; i < 10; i++) {
      assert.equal(await isRateLimited(ip), false);
    }
    assert.equal(await isRateLimited(ip), true);
  });
});

describe('isRateLimited — Upstash-backed path', () => {
  function setUpstashEnv() {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example-upstash.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  }

  test('not limited when Upstash INCR result is within the limit', async () => {
    setUpstashEnv();
    let capturedUrl, capturedInit;
    globalThis.fetch = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return {
        ok: true,
        json: async () => [{ result: 3 }, { result: 1 }]
      };
    };

    const result = await isRateLimited('7.7.7.7', { limit: 5, windowMs: 60000, bucket: uniqueBucket() });

    assert.equal(result, false);
    assert.equal(capturedUrl, 'https://example-upstash.test/pipeline');
    assert.equal(capturedInit.method, 'POST');
    assert.equal(capturedInit.headers.Authorization, 'Bearer test-token');
    const body = JSON.parse(capturedInit.body);
    assert.deepEqual(body[0][0], 'INCR');
    assert.deepEqual(body[1][0], 'EXPIRE');
  });

  test('limited when Upstash INCR result exceeds the limit', async () => {
    setUpstashEnv();
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => [{ result: 11 }, { result: 1 }]
    });

    const result = await isRateLimited('7.7.7.8', { limit: 10, windowMs: 60000, bucket: uniqueBucket() });
    assert.equal(result, true);
  });

  test('falls back to the memory limiter when the Upstash request throws', async () => {
    setUpstashEnv();
    globalThis.fetch = async () => { throw new Error('network down'); };
    const bucket = uniqueBucket();
    const opts = { limit: 1, windowMs: 60000, bucket };

    // Falls back to memory limiting rather than failing the request.
    assert.equal(await isRateLimited('8.8.8.8', opts), false);
    assert.equal(await isRateLimited('8.8.8.8', opts), true);
  });

  test('falls back to the memory limiter when Upstash responds non-OK', async () => {
    setUpstashEnv();
    globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
    const bucket = uniqueBucket();
    const opts = { limit: 1, windowMs: 60000, bucket };

    assert.equal(await isRateLimited('8.8.8.9', opts), false);
    assert.equal(await isRateLimited('8.8.8.9', opts), true);
  });

  test('falls back to the memory limiter when the response shape is unexpected', async () => {
    setUpstashEnv();
    globalThis.fetch = async () => ({ ok: true, json: async () => [{ result: 'not-a-number' }] });
    const bucket = uniqueBucket();
    const opts = { limit: 1, windowMs: 60000, bucket };

    assert.equal(await isRateLimited('8.8.9.0', opts), false);
    assert.equal(await isRateLimited('8.8.9.0', opts), true);
  });

  test('does not use the Upstash path when only one of the two env vars is set', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example-upstash.test';
    // token intentionally left unset
    let fetchCalled = false;
    globalThis.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => [] }; };

    await isRateLimited('6.6.6.6', { limit: 5, windowMs: 60000, bucket: uniqueBucket() });
    assert.equal(fetchCalled, false);
  });
});
