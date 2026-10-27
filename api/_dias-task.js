// Dias Panel > Claude: hands a task to Claude without leaving the panel.
// POST {text} opens a GitHub issue that mentions @claude; the Claude Code
// workflow (.github/workflows/claude.yml) picks it up, works on a branch and
// keeps one comment updated with its progress. GET ?task=N reads that
// comment back. Called from shieldView after the key check. Needs the
// GITHUB_TOKEN env var (fine-grained, Issues: read and write on this repo).
const REPO = process.env.GITHUB_REPO || 'demirksmca-maker/ComplaintCa';
const MAX_TEXT = 4000;

const gh = (path, init = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, {
  ...init,
  headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'dias-panel'
  }
});

export function issueFor(text) {
  const clean = String(text || '').trim().slice(0, MAX_TEXT);
  const first = clean.split('\n')[0].slice(0, 70);
  return {
    title: `Dias: ${first}`,
    body: `@claude ${clean}\n\n_Dias Panel'den gönderildi. CLAUDE.md kurallarına uy; işi bir dalda yap ve PR aç, main'e birleştirme._`
  };
}

// Claude's tracking comment, newest first; null while it has not answered.
export function claudeReply(comments) {
  const own = (comments || []).filter(c => c && c.user && /^claude(\[bot\])?$/.test(c.user.login));
  const c = own[own.length - 1];
  return c ? { text: String(c.body || '').slice(0, 6000), at: c.updated_at } : null;
}

export async function diasTask(req, res) {
  if (!process.env.GITHUB_TOKEN) return res.status(503).json({ error: 'no_github_token' });
  try {
    if (req.method === 'POST') {
      const text = String((req.body || {}).text || '').trim();
      if (!text) return res.status(400).json({ error: 'empty' });
      const r = await gh('/issues', { method: 'POST', body: JSON.stringify({ ...issueFor(text), labels: ['dias'] }) });
      if (!r.ok) return res.status(502).json({ error: `github ${r.status}` });
      const issue = await r.json();
      return res.status(200).json({ number: issue.number, url: issue.html_url });
    }
    const n = Number(req.query.task);
    if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'bad_task' });
    const r = await gh(`/issues/${n}/comments?per_page=100`);
    if (!r.ok) return res.status(502).json({ error: `github ${r.status}` });
    return res.status(200).json({ number: n, reply: claudeReply(await r.json()) });
  } catch (err) {
    console.error('dias task error:', err && err.message);
    return res.status(502).json({ error: 'github' });
  }
}
