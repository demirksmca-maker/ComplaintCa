// Copy watch agent — run daily by .github/workflows/copy-watch.yml.
//
// Takes two pages from sitemap.xml each day (rotating, so every page is
// checked about every six weeks), picks the most distinctive sentence of
// each and has Claude run ONE web search for both (searches are billed
// separately, so this keeps the agent under about $1 a month). When copies
// turn up it, the same day:
//   - re-submits the original URLs to IndexNow (Bing, and ChatGPT search
//     through it), so they are re-read as the source,
//   - sends the finding to the site (/api/shield-agent, GitHub OIDC), which
//     shows it on /shield.html and e-mails the owner with the Google
//     copyright removal link (that form needs the owner's own sworn
//     statement, so it is never filed automatically).
import { readFileSync, appendFileSync } from 'node:fs';

const SITE = process.env.SITE_URL || 'https://www.complaintca.ca';
const DRY_RUN = process.env.DRY_RUN === '1';
const PAGES_PER_DAY = Number(process.env.PAGES_PER_DAY) || 2;
const INDEXNOW_KEY = '0f5530ca1853d5959e003403b74c6535';
const OWN_HOSTS = /(^|\.)complaintca\.ca$|complaint-ca.*\.vercel\.app$|complaintca\.netlify\.app$/i;

function report(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
}

export function pagesForDay(urls, day, n = PAGES_PER_DAY) {
  const start = (day * n) % urls.length;
  return Array.from({ length: Math.min(n, urls.length) }, (_, i) => urls[(start + i) % urls.length]);
}

// The longest plain sentence of the page's main text: long enough to be
// unique, without digits that change between versions.
export function distinctiveSentence(html) {
  const text = html
    .replace(/<(script|style|nav|header|footer|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim())
    .filter(s => s.length >= 80 && s.length <= 220 && !/\d/.test(s) && !/[{}<>|]/.test(s));
  return sentences.sort((a, b) => b.length - a.length)[0] || null;
}

async function githubToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, tok = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !tok) throw new Error('no OIDC token (workflow needs permissions: id-token: write)');
  const r = await fetch(`${url}&audience=complaintca-shield`, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error(`OIDC ${r.status}`);
  return (await r.json()).value;
}

const SYSTEM = `You look for copies of pages from complaintca.ca, a Canadian complaint-filing site (Spanish edition under /es/).
For each sentence you get, search the web for it as an exact quote and find pages on other websites that contain the same sentence or a lightly reworded copy of the same paragraph.
Ignore complaintca.ca itself, its vercel.app/netlify.app previews, and pages that only link to or properly quote and credit complaintca.ca.
You have exactly one web search: put all the sentences in it as exact quotes joined with OR.
Finish with one line of JSON and nothing after it: {"copies":[{"url":"<copying page>","source":"<complaintca.ca page it copies>"}]}. Use {"copies":[]} if you found none.`;

export function parseCopies(text, sources) {
  const m = String(text).match(/\{[^{}]*"copies"\s*:\s*\[[\s\S]*\]\s*\}\s*$/);
  if (!m) return [];
  try {
    const own = new Set(sources);
    return (JSON.parse(m[0]).copies || []).filter(c => {
      try {
        const u = new URL(c.url);
        return /^https?:$/.test(u.protocol) && !OWN_HOSTS.test(u.hostname) && own.has(c.source);
      } catch { return false; }
    });
  } catch { return []; }
}

async function searchCopies(client, items) {
  const messages = [{ role: 'user', content: items.map((it, i) => `${i + 1}. Source: ${it.url}\nSentence: "${it.sentence}"`).join('\n\n') }];
  let response;
  for (let turn = 0; turn < 4; turn++) {
    response = await client.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low' },
      system: SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      messages
    });
    if (response.stop_reason !== 'pause_turn') break;
    // Server-side search loop hit its limit: send the turn back to resume.
    messages.push({ role: 'assistant', content: response.content });
  }
  if (response.stop_reason === 'refusal') return [];
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  return parseCopies(text, items.map(it => it.url));
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    report('Copy watch: ANTHROPIC_API_KEY secret missing, skipped.');
    return;
  }
  const urls = [...readFileSync('sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
  const day = Math.floor(Date.now() / 86400000);
  const items = [];
  for (const url of pagesForDay(urls, day)) {
    const r = await fetch(url, { headers: { 'User-Agent': 'ComplaintCA-copy-watch/1.0 (+https://www.complaintca.ca)' } });
    if (!r.ok) continue;
    const sentence = distinctiveSentence(await r.text());
    if (sentence) items.push({ url, sentence });
  }
  if (!items.length) {
    report('Copy watch: no sentences to check today.');
    return;
  }

  // Loaded here so the helpers above can be tested without the SDK installed.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const copies = await searchCopies(new Anthropic(), items);
  report(`### Copy watch${DRY_RUN ? ' (dry run)' : ''}\nChecked ${items.length} pages: ${items.map(i => i.url).join(', ')}`);
  if (!copies.length) {
    report('No copies found.');
    return;
  }
  for (const c of copies) report(`- copy: ${c.url} ← ${c.source}`);
  if (DRY_RUN) return;

  const originals = [...new Set(copies.map(c => c.source))];
  const ping = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'www.complaintca.ca', key: INDEXNOW_KEY, keyLocation: `https://www.complaintca.ca/${INDEXNOW_KEY}.txt`, urlList: originals })
  });
  report(`IndexNow re-submit of ${originals.length} originals: ${ping.status}`);

  const token = await githubToken();
  const r = await fetch(`${SITE}/api/shield-agent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ copies })
  });
  report(`Saved to panel: ${r.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
