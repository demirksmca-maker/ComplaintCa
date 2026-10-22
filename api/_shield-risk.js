// Risk score per IP for the shield panel (/shield.html, Güvenlik → Risk).
// Pure and rule based, so it costs nothing on every refresh: the edge
// events (middleware.js) of one IP are rolled into a 0-100 score, a threat
// level and a recommended action, in the shape the panel shows.
//   honeypot / attack → Kritik, BLOCK      (≥ 90)
//   scraper / flood   → Orta, RATE_LIMIT   (≥ 60)
//   suspect only      → Düşük, MONITOR
//   known good bot    → 0, Düşük, ALLOW    (only when it did nothing hostile:
//                                           a User-Agent is easy to fake)

// Worst agent wins; each extra event from the same IP adds a little.
const RULES = {
  trap: [95, 'Gizli tuzak bağlantısını açtı; bot davranışı'],
  inject: [95, 'Zararlı kod (SQL/XSS) denemesi'],
  probe: [90, 'Gizli dosya / yönetim paneli taraması'],
  scanner: [90, 'Saldırı aracı kullanıyor'],
  ban: [85, 'Banlıyken tekrar denedi'],
  flood: [75, 'Dakikada 120+ API isteği'],
  scrape: [70, 'Dakikada 60+ sayfa çekti; veri kopyalama'],
  lockdown: [60, 'Acil kilitte engellendi'],
  'suspect-rate': [45, 'Dakikada 40+ API isteği'],
  'suspect-noua': [35, 'Kimliksiz (User-Agent yok) istek']
};
const PER_EXTRA = 3;
const HOSTILE = 60;

export const GOOD_BOT_RE = /googlebot|google-inspectiontool|bingbot|duckduckbot|applebot|yandex|baiduspider|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-user|claude-searchbot|perplexitybot|perplexity-user/i;

export function threatLevel(score) {
  return score >= 90 ? 'Kritik' : score >= HOSTILE ? 'Orta' : 'Düşük';
}

function action(score, good) {
  if (good) return 'ALLOW';
  return score >= 90 ? 'BLOCK' : score >= HOSTILE ? 'RATE_LIMIT' : 'MONITOR';
}

const SUMMARY = {
  BLOCK: 'İstemci saldırı / tuzak davranışı gösterdiği için yüksek tehdit olarak etiketlendi ve engellendi.',
  RATE_LIMIT: 'Yüksek frekanslı istek veya veri çekme görüldü; hız sınırı uygulanıyor.',
  MONITOR: 'Şüpheli ama zararsız olabilir; izlemede tutuluyor.',
  ALLOW: 'Bilinen arama motoru veya AI ajanı; zararlı davranış yok, izin verildi.'
};

export function scoreIp(list) {
  const known = list.filter(e => RULES[e.agent]);
  const worst = known.reduce((w, e) => (RULES[e.agent][0] > RULES[w.agent][0] ? e : w), known[0] || list[0]);
  const base = worst && RULES[worst.agent] ? RULES[worst.agent][0] : 0;
  const good = base < HOSTILE && list.some(e => GOOD_BOT_RE.test(e.ua || ''));
  const score = good ? 0 : Math.min(100, base + PER_EXTRA * Math.max(0, known.length - 1));
  const rec = action(score, good);
  const behaviors = [...new Set(known.map(e => RULES[e.agent][1]))];
  return {
    ip_address: list[0].ip,
    country: list[0].c || '',
    risk_score: score,
    threat_level: threatLevel(score),
    detected_behavior: good ? 'Onaylı arama motoru / AI ajanı' : behaviors.join('; ') || 'Bilinmeyen davranış',
    recommended_action: rec,
    analysis_summary: `${list.length} kayıt. ${SUMMARY[rec]}`
  };
}

// events: newest first, as stored in shield:events. Highest risk first.
export function riskList(events, { since = 0, limit = 20 } = {}) {
  const byIp = new Map();
  for (const e of events || []) {
    if (!e || !e.ip || e.t < since) continue;
    if (!byIp.has(e.ip)) byIp.set(e.ip, []);
    byIp.get(e.ip).push(e);
  }
  return [...byIp.values()].map(scoreIp).sort((a, b) => b.risk_score - a.risk_score).slice(0, limit);
}
