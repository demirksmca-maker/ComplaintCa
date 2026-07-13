// Shared rate limiter for the /api proxies.
//
// If UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set (Vercel's
// Upstash Redis integration — add it from the Vercel dashboard, no code
// changes needed), limits are enforced in Redis and actually hold across
// concurrent/cold-started function instances. Without those env vars, this
// falls back to the previous in-memory counter, which only limits requests
// that happen to land on the same warm instance — better than nothing, but
// not a real guarantee under load.
const memoryMap = new Map();

function memoryLimited(key, limit, windowMs) {
  const now = Date.now();
  const record = memoryMap.get(key) || { count: 0, start: now };
  if (now - record.start > windowMs) {
    record.count = 0;
    record.start = now;
  }
  record.count++;
  memoryMap.set(key, record);
  return record.count > limit;
}

async function upstashLimited(key, limit, windowSeconds) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowSeconds]])
  });
  if (!res.ok) throw new Error('upstash rate limit request failed');
  const data = await res.json();
  const count = data && data[0] && data[0].result;
  if (typeof count !== 'number') throw new Error('unexpected upstash response');
  return count > limit;
}

export async function isRateLimited(ip, { limit = 10, windowMs = 60000, bucket = 'default' } = {}) {
  const key = `ratelimit:${bucket}:${ip}`;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await upstashLimited(key, limit, Math.ceil(windowMs / 1000));
    } catch (e) {
      // Upstash unreachable/misconfigured — don't fail the request over it,
      // just fall back to the weaker in-memory limiter for this call.
    }
  }
  return memoryLimited(key, limit, windowMs);
}
