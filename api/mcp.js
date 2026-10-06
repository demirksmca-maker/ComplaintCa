import { randomBytes, timingSafeEqual } from 'node:crypto';
import { isRateLimited } from './_rateLimit.js';
import { buildBrandedHtml, SENDER } from './send-email.js';

// ComplaintCA connector for Claude (MCP over Streamable HTTP, JSON responses).
// Add it in Claude → Settings → Connectors → Add custom connector with the URL
//   https://www.complaintca.ca/api/mcp?key=<MCP_SECRET>
//
// Env:
//   MCP_SECRET    required — without it the endpoint refuses every request
//   GITHUB_TOKEN  optional — fine-grained token (Contents: read/write on this
//                 repo) so add_social_post can edit social/queue.json
//   BREVO_API_KEY optional — same key send-email.js uses; submit_complaint
//                 needs it to email the reference number and the institution
//
// Privacy: complaint tools read only category/date/status/priority/type from
// public (non-legal) complaints — never names, emails, titles or descriptions.

const SITE = 'https://www.complaintca.ca';
const FIRESTORE_DOCS = 'https://firestore.googleapis.com/v1/projects/ajan-d6070/databases/(default)/documents';
const FIRESTORE = `${FIRESTORE_DOCS}:runQuery`;
// The same public web key index.html ships to every browser.
const FIREBASE_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDtK_bODD77BICh9O1DfhPMf2ENOcwWx8g';
const REPO = 'demirksmca-maker/ComplaintCa';
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const PLATFORMS = ['facebook', 'instagram', 'linkedin'];
// Keys of AUTHORITIES in index.html.
const CATEGORIES = ['noise', 'property', 'billing', 'garbage', 'safety', 'service', 'other', 'telecom', 'privacy', 'repairs', 'harassment', 'wages', 'wrongful', 'road', 'utility', 'transit', 'construction', 'environment', 'animal', 'malpractice', 'delays', 'benefits', 'immigration', 'police', 'race', 'gender', 'religion', 'disability', 'age', 'sexual', 'language', 'indigenous', 'education', 'condo', 'studentloan'];
const TARGETS = ['business', 'municipality', 'government', 'school', 'health', 'landlord', 'other'];
const PRIORITIES = ['low', 'medium', 'high'];
const CTYPES = ['notice', 'legal', 'access'];

const COMPLAINT_PROPS = {
  title: { type: 'string', maxLength: 200 },
  description: { type: 'string', maxLength: 5000, description: 'What happened, in the filer\'s words (English or French).' },
  category: { type: 'string', enum: CATEGORIES },
  target: { type: 'string', enum: TARGETS, description: 'Who the complaint is about.' },
  target_name: { type: 'string', maxLength: 200 },
  target_address: { type: 'string', maxLength: 300 },
  location: { type: 'string', maxLength: 200, description: 'City and province, e.g. Etobicoke, ON' },
  priority: { type: 'string', enum: PRIORITIES, default: 'medium' },
  type: { type: 'string', enum: CTYPES, default: 'notice', description: 'notice = complaint; legal = legal-rights case (Case Pool, hidden from the public feed); access = access-to-information request' },
  anonymous: { type: 'boolean', default: false },
  name: { type: 'string', maxLength: 120, description: 'Filer\'s name; required unless anonymous' },
  email: { type: 'string', description: 'Filer\'s email; the reference number is sent here' },
  authority_name: { type: 'string', maxLength: 200 },
  authority_email: { type: 'string', description: 'Institution inbox to email the complaint to (optional)' },
  letter: { type: 'string', maxLength: 10000, description: 'Full letter to the institution. If omitted, a plain letter is built from the fields.' },
};

const TOOLS = [
  {
    name: 'complaint_stats',
    title: 'Complaint statistics',
    description: 'Counts of public ComplaintCA complaints over the last N days, by category, status, priority and type, plus the previous period for comparison. No personal data.',
    inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 7 } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'social_queue',
    title: 'Social posting schedule',
    description: 'Lists scheduled social posts (Facebook, Instagram, LinkedIn) with their date, caption and which platforms already published them.',
    inputSchema: { type: 'object', properties: { filter: { type: 'string', enum: ['upcoming', 'published', 'all'], default: 'upcoming' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'add_social_post',
    title: 'Add a social post to the schedule',
    description: 'Adds a post to social/queue.json. It is published automatically on its date (Toronto). Use an existing image from social/images (see social_queue) or a public JPEG URL. Always show the user the date, caption and image and get their OK before calling this.',
    inputSchema: {
      type: 'object',
      required: ['date', 'caption'],
      properties: {
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD (Toronto)' },
        caption: { type: 'string', maxLength: 2000 },
        hashtags: { type: 'string', maxLength: 200 },
        image: { type: 'string', description: 'Existing file name in social/images, e.g. 01-brand.jpg' },
        image_url: { type: 'string', description: 'https URL of a JPEG to copy into the site (instead of image)' },
        platforms: { type: 'array', items: { type: 'string', enum: PLATFORMS } },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'draft_complaint',
    title: 'Preview a complaint',
    description: 'Checks a complaint and returns exactly what submit_complaint would save and email. Saves and sends nothing. Show the preview to the user in full and ask for their explicit approval before calling submit_complaint.',
    inputSchema: { type: 'object', required: ['title', 'description', 'category', 'email'], properties: COMPLAINT_PROPS },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'submit_complaint',
    title: 'File a complaint on ComplaintCA',
    description: 'Files the complaint on complaintca.ca and emails the reference number to the filer. With send_to_authority=true it also emails the letter to authority_email. Call only with the same fields the user approved in draft_complaint, and only after the user explicitly said to submit. Never retry automatically: a second call files a second complaint.',
    inputSchema: {
      type: 'object',
      required: ['title', 'description', 'category', 'email', 'confirmed'],
      properties: {
        ...COMPLAINT_PROPS,
        send_to_authority: { type: 'boolean', default: false, description: 'Email the letter to authority_email' },
        confirmed: { type: 'boolean', description: 'Must be true: the user approved this exact preview' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
];

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }
function text(obj, isError) {
  return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }], ...(isError ? { isError: true } : {}) };
}

export function authorized(req, secret) {
  if (!secret) return false;
  const auth = String(req.headers.authorization || '');
  const given = (auth.startsWith('Bearer ') ? auth.slice(7) : '') || String((req.query && req.query.key) || '');
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- complaints (public fields only) ----------
const val = (f) => f == null ? null : (f.stringValue ?? f.booleanValue ?? f.integerValue ?? f.timestampValue ?? null);

async function fetchComplaints(fetchImpl) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'complaints' }],
      select: { fields: ['category', 'date', 'status', 'priority', 'ctype'].map((fieldPath) => ({ fieldPath })) },
      // Firestore rules only let the public read non-legal complaints.
      where: { fieldFilter: { field: { fieldPath: 'isLegal' }, op: 'EQUAL', value: { booleanValue: false } } },
      limit: 5000,
    },
  };
  const r = await fetchImpl(`${FIRESTORE}?key=${FIREBASE_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Firestore HTTP ${r.status}`);
  const rows = await r.json();
  return rows.filter((x) => x.document).map((x) => {
    const f = x.document.fields || {};
    return { category: val(f.category), date: val(f.date), status: val(f.status), priority: val(f.priority), ctype: val(f.ctype) };
  });
}

const tally = (list, key) => list.reduce((m, c) => { const k = c[key] || 'unknown'; m[k] = (m[k] || 0) + 1; return m; }, {});
const sorted = (m) => Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));

export function stats(all, days, now = Date.now()) {
  const from = now - days * 864e5, prevFrom = from - days * 864e5;
  const t = (c) => Date.parse(c.date);
  const cur = all.filter((c) => t(c) >= from && t(c) <= now);
  const prev = all.filter((c) => t(c) >= prevFrom && t(c) < from);
  const perDay = {};
  for (const c of cur) { const d = String(c.date).slice(0, 10); perDay[d] = (perDay[d] || 0) + 1; }
  return {
    period: { days, from: new Date(from).toISOString().slice(0, 10), to: new Date(now).toISOString().slice(0, 10) },
    total: cur.length,
    previous_period_total: prev.length,
    change_pct: prev.length ? Math.round(((cur.length - prev.length) / prev.length) * 100) : null,
    by_category: sorted(tally(cur, 'category')),
    by_status: sorted(tally(cur, 'status')),
    by_priority: sorted(tally(cur, 'priority')),
    by_type: sorted(tally(cur, 'ctype')),
    per_day: Object.fromEntries(Object.entries(perDay).sort()),
    all_time_total: all.length,
  };
}

// ---------- social schedule ----------
async function siteJson(fetchImpl, path) {
  const r = await fetchImpl(`${SITE}/${path}?t=${Date.now()}`);
  if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
  return r.json();
}

function torontoToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function queueView(queue, posted, filter) {
  return queue.posts.map((p) => {
    const done = p.platforms.filter((pl) => (posted[p.id] || {})[pl]);
    return { id: p.id, date: p.date, image: `${SITE}/${p.image}`, platforms: p.platforms, published_on: done, fully_published: done.length === p.platforms.length, caption: p.caption, hashtags: p.hashtags || '' };
  }).filter((p) => filter === 'all' || (filter === 'published' ? p.fully_published : !p.fully_published))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const slug = (s) => s.toLowerCase().replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'post';

async function gh(fetchImpl, path, opts = {}) {
  const r = await fetchImpl(`https://api.github.com/repos/${REPO}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${j.message || ''}`);
  return j;
}

async function addPost(fetchImpl, a) {
  if (!process.env.GITHUB_TOKEN) return text('Not configured: GITHUB_TOKEN is not set on the server.', true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '') || isNaN(Date.parse(a.date))) return text('date must be YYYY-MM-DD', true);
  if (a.date < torontoToday()) return text('date is in the past', true);
  const caption = String(a.caption || '').trim(), hashtags = String(a.hashtags || '').trim();
  if (!caption) return text('caption is required', true);
  if ((caption + '\n\n' + hashtags).length > 2200) return text('caption + hashtags must be 2200 characters or fewer (Instagram limit)', true);
  const platforms = (a.platforms && a.platforms.length ? a.platforms : PLATFORMS).filter((p) => PLATFORMS.includes(p));
  if (!platforms.length) return text('platforms must include facebook, instagram or linkedin', true);
  if (!a.image === !a.image_url) return text('give exactly one of image or image_url', true);

  const qf = await gh(fetchImpl, '/contents/social/queue.json?ref=main');
  const queue = JSON.parse(Buffer.from(qf.content, 'base64').toString('utf8'));
  let id = `${a.date}-${slug(caption.split('\n')[0])}`;
  for (let n = 2; queue.posts.some((p) => p.id === id); n++) id = `${a.date}-${slug(caption.split('\n')[0])}-${n}`;

  let image;
  if (a.image) {
    const name = String(a.image).replace(/^.*\//, '');
    if (!/^[A-Za-z0-9._-]+\.jpe?g$/.test(name)) return text('image must be a .jpg file name from social/images', true);
    const head = await fetchImpl(`${SITE}/social/images/${name}`, { method: 'HEAD' });
    if (!head.ok) return text(`social/images/${name} not found`, true);
    image = `social/images/${name}`;
  } else {
    const u = new URL(a.image_url);
    if (u.protocol !== 'https:') return text('image_url must be https', true);
    const r = await fetchImpl(u.href);
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/image\/jpe?g/.test(type)) return text('image_url must return a JPEG (Instagram accepts JPEG only)', true);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > 8 * 1024 * 1024) return text('image is larger than 8 MB', true);
    image = `social/images/${id}.jpg`;
    await gh(fetchImpl, `/contents/${image}`, { method: 'PUT', body: JSON.stringify({ message: `Social: image for ${id} (via Claude connector)`, content: bytes.toString('base64'), branch: 'main' }) });
  }

  const post = { id, date: a.date, image, platforms, caption, hashtags };
  queue.posts.push(post);
  await gh(fetchImpl, '/contents/social/queue.json', {
    method: 'PUT',
    body: JSON.stringify({ message: `Social: add ${id} (via Claude connector)`, content: Buffer.from(JSON.stringify(queue, null, 2) + '\n').toString('base64'), sha: qf.sha, branch: 'main' }),
  });
  return text({ added: post, note: 'Scheduled. The image is live on the site about a minute after this commit deploys.' });
}

// ---------- filing complaints ----------
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // same alphabet as genRef() in index.html

export function genRef(year = new Date().getFullYear()) {
  const bytes = randomBytes(6);
  return `VC-${year}-${Array.from(bytes, (b) => REF_CHARS[b % REF_CHARS.length]).join('')}`;
}

// Returns { errors } or { c, letter, subject, authority } — the record and emails submit_complaint would produce.
export function buildComplaint(a, ref = 'VC-YYYY-XXXXXX', now = new Date().toISOString()) {
  const errors = [];
  const title = str(a.title, 200), desc = str(a.description, 5000);
  const anonymous = a.anonymous === true;
  const name = anonymous ? null : str(a.name, 120);
  const email = str(a.email, 254).toLowerCase();
  const ctype = CTYPES.includes(a.type) ? a.type : 'notice';
  if (!title) errors.push('title is required');
  if (!desc) errors.push('description is required');
  if (!CATEGORIES.includes(a.category)) errors.push(`category must be one of: ${CATEGORIES.join(', ')}`);
  if (!EMAIL_RE.test(email)) errors.push('email must be a valid address');
  if (!anonymous && !name) errors.push('name is required unless anonymous is true');
  if (ctype === 'access' && anonymous) errors.push('access-to-information requests cannot be anonymous');
  const authEmail = str(a.authority_email, 254).toLowerCase();
  if (authEmail && !EMAIL_RE.test(authEmail)) errors.push('authority_email must be a valid address');
  if (errors.length) return { errors };

  const c = {
    ref, title, desc, category: a.category,
    target: TARGETS.includes(a.target) ? a.target : '',
    targetName: str(a.target_name, 200), targetAddress: str(a.target_address, 300),
    priority: PRIORITIES.includes(a.priority) ? a.priority : 'medium',
    location: str(a.location, 200), anonymous, name, email, ctype, isLegal: ctype === 'legal',
    photoCount: 0, status: 'received', date: now, timeline: [{ status: 'received', date: now }],
    source: 'claude-connector',
  };
  const authName = str(a.authority_name, 200);
  const isFoi = ctype === 'access';
  let letter = str(a.letter, 10000);
  if (!letter) {
    letter = (isFoi
      ? `I am writing to submit an access to information request to ${authName || 'your office'} through ComplaintCA. No reason is required to be given for this request.\n\n`
      : anonymous
        ? 'This is an anonymous advisory notice submitted via ComplaintCA regarding the following matter, for your awareness and possible review:\n\n'
        : `I am writing to formally file a complaint with ${authName || 'your office'} through ComplaintCA.\n\n`)
      + `Subject: ${title}\nCategory: ${c.category}\n`
      + (c.targetName ? `Concerning: ${c.targetName}${c.targetAddress ? ' — ' + c.targetAddress : ''}\n` : '')
      + (c.location ? `Location: ${c.location}\n` : '')
      + `\n${isFoi ? 'Records or information requested' : 'Details'}:\n${desc}\n\n`
      + (isFoi ? 'Please confirm receipt of this request and respond in writing within the statutory deadline.'
        : anonymous ? 'This notice is submitted anonymously; no identifying contact information has been shared.'
          : 'I ask that this matter be reviewed and that you let me know the next steps or an expected timeline for resolution.');
  }
  const contact = anonymous ? `Reference: ${ref} | Filed anonymously via ComplaintCA` : `Contact: ${name} <${email}> | Reference: ${ref}`;
  letter += `\n\n---\n${contact} | Date: ${now.slice(0, 10)}\nFiled via ComplaintCA (complaintca.ca)`
    + '\n\nPRIVACY NOTICE: The personal information in this complaint is provided solely to address this matter and should be handled in accordance with applicable Canadian privacy legislation. '
    + (anonymous ? 'The complainant has chosen to remain anonymous; no identifying contact information has been shared with you.'
      : 'The complainant retains the right to access, correct, or request deletion of their personal information.');
  const subject = `${isFoi ? 'Access to Information Request' : 'Formal Complaint'} — ${ref} — ${title}`;
  return { c, letter, subject, authority: authEmail ? { name: authName, email: authEmail } : null };
}

const toValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number') return { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
};
const toFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]));

async function brevo(fetchImpl, to, subject, body, replyTo) {
  const payload = { sender: SENDER, to: [{ email: to.email, name: to.name || undefined }], subject, htmlContent: buildBrandedHtml(body), textContent: body };
  if (replyTo) payload.replyTo = { email: replyTo };
  const r = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.ok;
}

function draftComplaint(a) {
  const d = buildComplaint(a);
  if (d.errors) return text({ errors: d.errors }, true);
  const { c } = d;
  return text({
    preview: {
      saved_on_complaintca: { title: c.title, description: c.desc, category: c.category, type: c.ctype, priority: c.priority, target: c.target, target_name: c.targetName, target_address: c.targetAddress, location: c.location, anonymous: c.anonymous, name: c.name, email: c.email, public_feed: !c.isLegal },
      confirmation_email_to: c.email,
      institution_email: d.authority ? { to: d.authority.email, subject: d.subject, body: d.letter, only_if: 'send_to_authority=true' } : null,
    },
    next: 'Show this to the user. Call submit_complaint with the same fields and confirmed=true only after they explicitly approve.',
  });
}

async function submitComplaint(fetchImpl, a) {
  if (a.confirmed !== true) return text('Not submitted: confirmed must be true, after the user approved the draft_complaint preview.', true);
  const d = buildComplaint(a, genRef());
  if (d.errors) return text({ errors: d.errors }, true);
  if (a.send_to_authority === true && !d.authority) return text('send_to_authority is true but authority_email is missing.', true);
  const { c } = d;

  const r = await fetchImpl(`${FIRESTORE_DOCS}/complaints?key=${FIREBASE_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: toFields(c) }) });
  if (!r.ok) return text(`Not submitted: Firestore HTTP ${r.status} ${(await r.text()).slice(0, 300)}`, true);

  const track = `${SITE}/?track=${encodeURIComponent(c.ref)}`;
  const out = { submitted: true, ref: c.ref, track, confirmation_email: 'not sent', institution_email: 'not requested' };
  if (!process.env.BREVO_API_KEY) {
    out.confirmation_email = 'not sent: BREVO_API_KEY is not set';
    if (a.send_to_authority === true) out.institution_email = 'not sent: BREVO_API_KEY is not set';
    return text(out);
  }
  const conf = `Hi,\n\nYour complaint has been received by ComplaintCA.\n\nReference: ${c.ref}\nSubject: ${c.title}\n\nKeep this reference — we'll email you whenever the status changes.\n\n🔗 Track it directly: ${track}\n\nComplaintCA (complaintca.ca)`;
  out.confirmation_email = (await brevo(fetchImpl, { email: c.email, name: c.name }, `Your ComplaintCA reference — ${c.ref}`, conf).catch(() => false)) ? `sent to ${c.email}` : 'failed';
  if (a.send_to_authority === true) {
    const ok = await brevo(fetchImpl, d.authority, d.subject, d.letter, c.anonymous ? undefined : c.email).catch(() => false);
    out.institution_email = ok ? `sent to ${d.authority.email}` : 'failed';
  }
  return text(out);
}

export async function callTool(name, args, fetchImpl = fetch) {
  args = args || {};
  try {
    if (name === 'complaint_stats') {
      const days = Math.min(365, Math.max(1, parseInt(args.days, 10) || 7));
      return text(stats(await fetchComplaints(fetchImpl), days));
    }
    if (name === 'social_queue') {
      const filter = ['upcoming', 'published', 'all'].includes(args.filter) ? args.filter : 'upcoming';
      const [queue, posted] = await Promise.all([siteJson(fetchImpl, 'social/queue.json'), siteJson(fetchImpl, 'social/posted.json').catch(() => ({}))]);
      return text({ today_toronto: torontoToday(), posts: queueView(queue, posted, filter) });
    }
    if (name === 'add_social_post') return await addPost(fetchImpl, args);
    if (name === 'draft_complaint') return draftComplaint(args);
    if (name === 'submit_complaint') return await submitComplaint(fetchImpl, args);
    return text(`Unknown tool: ${name}`, true);
  } catch (e) {
    return text(`Error: ${e.message}`, true);
  }
}

export async function handleRpc(msg, fetchImpl = fetch) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg && msg.id, -32600, 'Invalid Request');
  const isNotification = msg.id === undefined || msg.id === null;
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params && msg.params.protocolVersion;
      return rpcResult(msg.id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'complaintca', title: 'ComplaintCA', version: '1.0.0' },
        instructions: 'ComplaintCA (complaintca.ca) tools: complaint statistics without personal data, the social media posting schedule, and filing complaints. Ask the user before adding a post. To file a complaint: call draft_complaint, show the user the full preview, and call submit_complaint only after they explicitly approve it.',
      });
    }
    case 'ping': return rpcResult(msg.id, {});
    case 'tools/list': return rpcResult(msg.id, { tools: TOOLS });
    case 'tools/call': return rpcResult(msg.id, await callTool(msg.params && msg.params.name, msg.params && msg.params.arguments, fetchImpl));
    default:
      if (isNotification) return null;
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json(rpcError(null, -32000, 'Use POST (MCP Streamable HTTP)'));
  }
  if (!process.env.MCP_SECRET) return res.status(503).json(rpcError(null, -32000, 'Connector not configured (MCP_SECRET)'));
  if (!authorized(req, process.env.MCP_SECRET)) return res.status(401).json(rpcError(null, -32001, 'Unauthorized'));
  const ip = req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown';
  if (await isRateLimited(ip, { limit: 60, windowMs: 60000, bucket: 'mcp' })) return res.status(429).json(rpcError(null, -32000, 'Too many requests'));

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json(rpcError(null, -32700, 'Parse error')); } }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(m)))).filter(Boolean);
    return out.length ? res.status(200).json(out) : res.status(202).end();
  }
  const out = await handleRpc(body);
  return out ? res.status(200).json(out) : res.status(202).end();
}
