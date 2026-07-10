# Security Notes — ComplaintCA

This file tracks the security posture of the client-heavy, mostly-static
ComplaintCA app: what's been reviewed and fixed, and what remains a known
limitation of the current architecture (no real backend — data lives in
the browser's `localStorage` and in a public Firebase/Firestore project).

## Fixed

| Area | Issue | Fix |
|---|---|---|
| Public complaint feed (`renderFeedHTML`, `renderLawyerPanelHTML`, local feed fallback) | `title`/`desc`/`location`/`category` from the shared Firestore `complaints` collection were inserted into `innerHTML` unescaped — anyone submitting a complaint could run script in every visitor's browser (stored, cross-user XSS). | All fields now pass through `escHtml()` before rendering. |
| Account passwords (`cc_users` in `localStorage`) | Stored as `btoa(password)` — Base64 is reversible in one line (`atob()`), effectively plaintext. | Per-user random salt + SHA-256 (Web Crypto) via `hashPass()`/`genSalt()`. |
| Document verification (Asya/Claude AI analysis, `vfy-text`) | AI-derived `verdict`/`detail`/`advice` text (influenced by an attacker-crafted uploaded image/PDF) was inserted into `innerHTML` unescaped. | Escaped with `escHtml()`. |
| "Find Representative" card renderer (`mvRender`) | `name`/`party`/`district` from the external Represent API went into `innerHTML` unescaped; `photo_url`/`url` were used as `src`/`href` with no scheme check (`javascript:` injection possible); the email button built an `onclick="mvEmail('...','...')"` attribute by only stripping `'`, so a value containing `"` could break out of the attribute. | Text fields escaped; `photo_url`/`url` restricted to `http(s)://` via `safeUrl()`; the button now uses `data-mv-idx` + `addEventListener` instead of a string-built inline handler. |
| Location autocomplete dropdowns (both address search boxes) | Nominatim result text inserted into `innerHTML` unescaped. | Escaped with `escHtml()`. |
| `mailto:` links (`createLegalPetition`, `mvEmail`) | The address portion wasn't URL-encoded, so a stray `&` could append extra mailto parameters (e.g. inject a `bcc`). | Wrapped in `encodeURIComponent()`. |
| Response headers | Netlify had no security headers at all; Vercel's CSP was already missing hosts the page depends on (Firebase SDK on `gstatic.com`, Firestore/Auth endpoints, Google Fonts, Groq API), so if actually enforced it would have silently broken those features. | `vercel.json` CSP corrected and expanded (`base-uri 'self'`, `object-src 'none'` added too). `netlify.toml` removed — project only deploys via Vercel. |
| `V.init()` timing | Ran before the "Find Representative" modal existed in the DOM, so its fields never picked up the selected language on first load. | Deferred to `DOMContentLoaded`. |

New helpers added: `escHtml()` (existing), `escAttr()` (HTML-attribute-safe escaping), `safeUrl()` (http/https scheme allowlist).

## Known limitations (architectural, not fixable by an index.html patch alone)

- **Firestore access control lives outside this repo.** There's no
  `firestore.rules` / `firebase.json` checked in, so who can read/write the
  `complaints` collection is controlled entirely from the Firebase Console
  and isn't reviewable here. Worth confirming: anonymous complaints should
  be write-only from the client's perspective (or restricted by App
  Check/reCAPTCHA) and should never be broadly readable with full PII
  (name, email, location) — only the fields the public feed actually needs.
- **`_fbUpdateStatus` / `_fbDelete` authorize by `ref` + `email` match, not
  a real session/auth token.** `ref` is generated with `Math.random()`
  (not cryptographically random) and email is self-reported at submission
  time with no verification. This is a plausible IDOR / account-takeover
  path for a specific complaint if both values leak or are guessed. A real
  fix needs either Firebase Auth-gated writes or a server-side function
  that owns the update/delete logic.
- **Rate limiting in `api/claude-proxy.js` / `api/groq-proxy.js` is an
  in-memory `Map`.** On serverless platforms this resets on cold start and
  isn't shared across concurrent instances, so it throttles a lot less
  than the "10 requests/minute" it advertises. A real limit needs a shared
  store (Vercel KV, Upstash Redis, etc.).
- **The whole "account" system is client-side only** (`localStorage`,
  no backend). Anyone with local script execution on the same origin (or
  physical/device access) can read `cc_users` and `cc_session` directly.
  Password hashing here raises the bar against casual snooping but is not
  equivalent to server-verified auth.
- **AI prompt inputs** (uploaded documents, previous AI verdict text
  re-fed into the legal-petition prompt) are not sanitized against
  prompt injection. Low security impact today since output is now escaped
  before rendering, but worth keeping in mind if AI output is ever used
  to drive something more sensitive than displayed text.

## Suggested next steps (not yet done)

1. Review and tighten the actual Firestore security rules in the Firebase
   Console; consider adding `firestore.rules` to this repo so they're
   version-controlled and reviewable like the rest of the app.
2. Replace `Math.random()` in `genRef()` with `crypto.getRandomValues()`
   if complaint reference numbers are meant to be unguessable.
3. Move rate limiting to a shared store, or accept it as a soft
   deterrent only and rely on Firestore/API-provider quotas as the real
   backstop.
4. If accounts are meant to be more than a local convenience, migrate to
   Firebase Auth (already a dependency) instead of the hand-rolled
   `localStorage` user table.
