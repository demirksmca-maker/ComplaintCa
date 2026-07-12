# Security Notes — ComplaintCA

This file tracks the security posture of the client-heavy, mostly-static
ComplaintCA app: what's been reviewed and fixed, and what remains a known
limitation of the current architecture (no real backend — data lives in
the browser's `localStorage` and in a public Firebase/Firestore project).

## Fixed

| Area | Issue | Fix |
|---|---|---|
| Public complaint feed (`renderFeedHTML`, `renderLawyerPanelHTML`, local feed fallback) | `title`/`desc`/`location`/`category` from the shared Firestore `complaints` collection were inserted into `innerHTML` unescaped — anyone submitting a complaint could run script in every visitor's browser (stored, cross-user XSS). | All fields now pass through `escHtml()` before rendering. |
| Account passwords | Originally `btoa(password)` (reversible Base64), then per-user salt + SHA-256 in `localStorage`. | Replaced entirely — accounts now use **Firebase Authentication** (`createUserWithEmailAndPassword`/`signInWithEmailAndPassword`), so passwords never touch this app's own storage or code at all. |
| Document verification (Asya/Claude AI analysis, `vfy-text`) | AI-derived `verdict`/`detail`/`advice` text (influenced by an attacker-crafted uploaded image/PDF) was inserted into `innerHTML` unescaped. | Escaped with `escHtml()`. |
| "Find Representative" card renderer (`mvRender`) | `name`/`party`/`district` from the external Represent API went into `innerHTML` unescaped; `photo_url`/`url` were used as `src`/`href` with no scheme check (`javascript:` injection possible); the email button built an `onclick="mvEmail('...','...')"` attribute by only stripping `'`, so a value containing `"` could break out of the attribute. | Text fields escaped; `photo_url`/`url` restricted to `http(s)://` via `safeUrl()`; the button now uses `data-mv-idx` + `addEventListener` instead of a string-built inline handler. |
| Location autocomplete dropdowns (both address search boxes) | Nominatim result text inserted into `innerHTML` unescaped. | Escaped with `escHtml()`. |
| `mailto:` links (`createLegalPetition`, `mvEmail`) | The address portion wasn't URL-encoded, so a stray `&` could append extra mailto parameters (e.g. inject a `bcc`). | Wrapped in `encodeURIComponent()`. |
| Response headers | Netlify had no security headers at all; Vercel's CSP was already missing hosts the page depends on (Firebase SDK on `gstatic.com`, Firestore/Auth endpoints, Google Fonts, Groq API), so if actually enforced it would have silently broken those features. | `vercel.json` CSP corrected and expanded (`base-uri 'self'`, `object-src 'none'` added too). `netlify.toml` removed — project only deploys via Vercel. |
| `V.init()` timing | Ran before the "Find Representative" modal existed in the DOM, so its fields never picked up the selected language on first load. | Deferred to `DOMContentLoaded`. |
| Complaint reference numbers (`genRef()`) | Generated with `Math.random()` — not cryptographically random, in principle guessable/brute-forceable. | Rewritten to use `crypto.getRandomValues()` over a 32-character alphabet (6 chars ≈ 1 billion combinations). |
| API rate limiting (`api/claude-proxy.js`, `api/groq-proxy.js`, `api/groq-transcribe.js`) | In-memory `Map`, reset on cold start, not shared across concurrent instances. | Shared `api/_rateLimit.js` uses **Upstash Redis** (via `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`) when configured, so limits actually hold across instances; falls back to the previous in-memory behavior if those env vars aren't set, so it degrades gracefully rather than breaking. |
| Account system | Hand-rolled `localStorage` user table (`cc_users`), no server-side verification. | Migrated to Firebase Authentication (email/password + the existing Google sign-in, both already using the Firebase Auth SDK). `cc_session` in `localStorage` is now just a UI convenience cache kept in sync via `onAuthStateChanged`, not the source of truth. |
| Firestore access control | No `firestore.rules` in the repo — access control lived entirely in the Firebase Console, unreviewable here. | Added `firestore.rules` (see below — **must be deployed manually**, this repo can't do that for you). |
| Outbound email (`api/send-email.js`) | The frontend already called `/api/send-email`, but the file never existed — every "automatic" institution/admin email silently 404'd and fell back to a `mailto:` link, with no indication anything was wrong. | Added the missing endpoint (Brevo API, rate-limited via `api/_rateLimit.js`). Email body is HTML-escaped before being wrapped in the branded template to prevent HTML injection into the rendered email. Sender is fixed to `ComplaintCA <complaintcaca@gmail.com>`; `replyTo` is only ever set to the complainant's own address, never exposed to the institution for anonymous submissions. |
| No bot/spam protection on submissions | Both submission forms (File a Complaint, Cyber Crime Report) could be scripted and hit repeatedly — only defense was the existing per-device cooldown/rate limiting, not real bot detection. | Added **Cloudflare Turnstile** (free, no card required) — a checkbox/challenge widget on both forms; `doSubmit()`/`doSubmitCyber()` block submission unless the token is verified server-side (`api/verify-turnstile.js`, calls Cloudflare's `siteverify`). See "Action required" below — ships with Cloudflare's public always-passes test key until a real one is configured. |
| No protection against direct Firestore/Auth API abuse | Anyone with the Firebase config (visible in any browser's page source, by design) could call Firestore/Auth directly, bypassing the app entirely and its rate limits. | Added **Firebase App Check** wiring (reCAPTCHA v3 provider). Off by default (`APP_CHECK_SITE_KEY=''` — zero network calls, nothing changes) until configured. See "Action required" below. |

New helpers added: `escHtml()` (existing), `escAttr()` (HTML-attribute-safe escaping), `safeUrl()` (http/https scheme allowlist).

## Cloudflare Turnstile & Firebase App Check — action required

Both ship in a safe default state (Turnstile with Cloudflare's public
always-passes test key; App Check disabled entirely) so nothing breaks
before you finish setup. Neither provides real protection until you do:

**Turnstile (bot/spam protection on the two submission forms):**
1. dash.cloudflare.com → Turnstile → Add a site → pick "Managed" → add
   `complaintca.ca` (and your `.vercel.app` preview domain if you test
   there).
2. Copy the **Site Key** and replace `data-sitekey="1x00000000000000000000AA"`
   in **both** `.cf-turnstile` widgets in `index.html` (one near `#sub-btn`,
   one near `#cy-sub-btn`).
3. Copy the **Secret Key** and set `TURNSTILE_SECRET_KEY` in Vercel
   (Settings → Environment Variables), then redeploy.
4. Without step 3, `api/verify-turnstile.js` fails open (submissions still
   work, just unverified) — same graceful-degradation pattern as
   `BREVO_API_KEY` below.

**App Check (protects Firestore/Auth from direct API abuse):**
1. Firebase Console → App Check → register the web app → provider
   **reCAPTCHA v3** (free) → copy the site key.
2. Paste it into `APP_CHECK_SITE_KEY` in `index.html`'s Firebase module
   script (currently `''`).
3. Deploy, then watch the App Check console in **"Unenforced" / monitoring
   mode** for a while to confirm real user traffic is passing (not being
   misclassified).
4. Only once that looks healthy, manually flip **Enforce** for Firestore
   and Authentication in the same console — enforcing too early, before
   confirming real traffic passes, would lock out legitimate users. This
   step can't be done from this repo.

## `firestore.rules` — action required

`firestore.rules` is now in the repo, but **Vercel does not deploy Firestore
rules** — you need to push it yourself, either:
- `firebase deploy --only firestore:rules` (Firebase CLI, project `ajan-d6070`), or
- paste its contents into Firebase Console → Firestore Database → Rules.

It validates the shape of writes (required fields, correct types, can't
forge a `resolved` status on create, updates can only ever touch
`status`/`timeline`) but **cannot** verify that whoever holds a document
reference actually knows its email — there's no signed-in identity tied to
complaint ownership to check that against. That's not a regression from
these rules; it reflects how `_fbUpdateStatus`/`_fbDelete`/"Track by
Reference" already work (ref+email match, no auth token). Closing that gap
for real needs complaint ownership tied to Firebase Auth (e.g. requiring
sign-in to file a non-anonymous complaint, or anonymous-auth + custom
claims), which is a bigger change than a rules file — noted as a next step
below.

## Known limitations (still architectural, not fixable by an index.html patch alone)

- **`_fbUpdateStatus` / `_fbDelete` / "Track by Reference" authorize by
  `ref` + `email` match, not a real session/auth token.** Reference numbers
  are now unguessable (see above), which makes this a reasonably strong
  shared-secret in practice, but it's still not equivalent to verifying the
  requester's identity server-side.
- **Non-anonymous complaint documents are broadly readable** by the
  Firestore rules above (`allow read: if true`) because there's no
  authenticated identity to scope reads to. Anyone who can guess/obtain a
  `complaints` document's ID could read its full contents, including name
  and email — the app's own UI doesn't expose this, but the underlying data
  access isn't restricted by rules alone. A real fix means either requiring
  auth to read non-anonymous documents, or splitting each complaint into a
  public-safe document and a separate PII document with stricter rules.
- **AI prompt inputs** (uploaded documents, previous AI verdict text
  re-fed into the legal-petition prompt) are not sanitized against
  prompt injection. Low security impact today since output is now escaped
  before rendering, but worth keeping in mind if AI output is ever used
  to drive something more sensitive than displayed text.
- **Partner Lawyer access is still just a `mailto:` link** — there's no
  real payment gate or auth tier distinguishing a "Partner Lawyer" from
  any other visitor of the Lawyer Panel. Explicitly out of scope for this
  round of fixes.
- **Lawyer Panel now requires sign-in, but not lawyer verification.**
  `firestore.rules` requires `request.auth != null` to read `isLegal==true`
  complaints, and `showTab('lawyerpanel')` gates the tab behind the same
  login check already used for filing a new complaint — this stops
  anonymous/public browsing of legal-track cases, which is a real,
  server-enforced improvement (not just hiding a tab in the UI). It does
  **not** verify the signed-in account actually belongs to a lawyer; any
  registered user can view the feed once logged in. Real lawyer
  verification would need a separate vetting/role system — out of scope
  here, same as Partner Lawyer payment above. Also note: as the Firebase
  project owner, you can always read this data from the Firebase Console
  regardless of these rules — that's a policy commitment, not something
  client-side or rules-file code can technically prevent. The only way to
  make "even the platform owner can't read this" cryptographically true is
  end-to-end encryption scoped to the user + their matched lawyer, which is
  a materially bigger undertaking (key management, recovery, etc.) and not
  implemented here.

## Suggested next steps (not yet done)

1. Deploy `firestore.rules` (see above) and confirm the app still works
   end-to-end against it — this repo can't do that step for you.
2. If Upstash Redis isn't already connected, add it from the Vercel
   dashboard (Storage → Upstash) so `UPSTASH_REDIS_REST_URL`/`_TOKEN` get
   set automatically — no code changes needed once it's there.
3. Confirm the Firebase Console has the **Email/Password** sign-in
   provider enabled under Authentication → Sign-in method (required for
   the new `doSignup`/`doLogin` to work) — this also can't be done from
   this repo.
4. If non-anonymous complaint privacy matters, revisit the Firestore
   read model (auth-gated reads, or split public/private documents) —
   the "known limitations" section above has the specifics.
5. Set `BREVO_API_KEY` in the Vercel dashboard (Settings → Environment
   Variables) and verify `complaintcaca@gmail.com` as a sender in Brevo —
   `api/send-email.js` returns a clean 503 without it, so nothing breaks,
   but no confirmation/institution emails go out until it's set. This
   repo can't do that step for you.
