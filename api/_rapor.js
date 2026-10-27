import { createHash, timingSafeEqual } from 'node:crypto';

// GET /rapor (rewritten to /api/route?rapor=1). The Dias Panel report for
// one invited reader, behind HTTP Basic Auth; never indexed or cached.
// Only the SHA-256 of "user:password" is kept here.
const PASS_HASH = 'ba127f4df10f7e93f6ad8845ef99e4441c7925a013ccf03e5cfd5593f11e76c5';

export function authorized(header) {
  const m = /^Basic\s+(.+)$/i.exec(header || '');
  if (!m) return false;
  const given = createHash('sha256').update(Buffer.from(m[1], 'base64').toString('utf8')).digest();
  return timingSafeEqual(given, Buffer.from(PASS_HASH, 'hex'));
}

export async function raporPage(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'private, no-store');
  if (!authorized(req.headers && req.headers.authorization)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Dias Panel Rapor", charset="UTF-8"');
    return res.status(401).send('Giriş gerekli.');
  }
  // The bundler may wrap the module once more ({ default: { default } }).
  const mod = await import('./_rapor-html.js');
  const html = typeof mod.default === 'string' ? mod.default : mod.default.default;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
