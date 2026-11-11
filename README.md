# Kato.8 Studios — Legal Agent

An internal legal-review assistant for studio leadership. Paste a contract, describe a compliance situation or an operation,
and get a structured analysis with HIGH / MEDIUM / LOW risk flags, California-specific references (AB 5, IP assignment, NDA
enforceability) and recommended next steps. Review history stays in the browser.

> Part of the **Kato.8 internal-tools suite** (ten tools plus the [`central-command`](https://github.com/Terry-Resume/central-command)
> hub), all built on [`@kato8/core`](https://github.com/Terry-Resume/kato8-core) for auth, model config and shared data.
> The public build runs on a **fictional studio** in demo mode, with canned reviews and no keys.

**This is an analysis aid, not legal advice.** It exists to help a team spot issues before talking to outside counsel.

## Try it (no accounts, no keys)

```bash
npm install
KATO8_DEMO=1 VITE_KATO8_DEMO=1 npm run dev      # http://localhost:5175
```

`npm run dev` serves `/api` locally too. A role switcher appears at the bottom of the screen: only `super_admin` gets in
(the suite registry lists this tool as leadership-only), and the API answers `403` to every other role, exactly as in production.

## What changed in the suite integration

| Before | Now |
| --- | --- |
| A private copy of the JWT/JWKS verification code | Shared `requireUser` from `@kato8/core/server` |
| The role was only checked **if** `CLERK_SECRET_KEY` happened to be set, so a misconfigured deploy let any signed-in user in | Fails closed: no Clerk config means `503`, never "allowed" |
| `claude-opus-4-7` hard-coded in the route | Premium tier from `@kato8/core` (`ANTHROPIC_MODEL_PREMIUM` to override; retired ids refused) |
| Provider errors returned verbatim (`Anthropic error: …`) | Generic `502`; details never reach the browser |
| Unbounded `prompt`, any `type` | 60,000-character cap and a fixed list of review types |
| System prompt duplicated in the browser, with the real founder email and address | One server-side prompt built from `@kato8/core` studio data; nothing real in source |
| Floating `clerk-js@5` script, hand-rolled role screens | Pinned Clerk build and the shared `AuthShell` |
| A stale "start the HR server on port 3001" hint | Removed; the server's own error text is shown |

## API

| Route | Method | Access |
| --- | --- | --- |
| `/api/legal-review` | POST `{ prompt, type }` | `super_admin` |
| `/api/health` | GET | public, check names only |

`type` is `document_review`, `compliance_check` or `operations_review`. The response is `{ result }` (markdown).
Text inside a reviewed document is fenced as material to analyse, not instructions.

## Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Auth (required outside demo mode) |
| `ANTHROPIC_API_KEY` | Server side only |
| `ANTHROPIC_MODEL_PREMIUM` | Optional override of the premium model |
| `KATO8_DEMO` / `VITE_KATO8_DEMO` | Fictional demo; ignored when `CLERK_SECRET_KEY` is set |

## Privacy note

Review history (document summaries and results) is stored in this browser's `localStorage` and can be cleared from the History
tab. Documents are sent to Anthropic's API for analysis; do not paste anything your agreements forbid you from sharing.

## Scripts

`npm run dev` · `npm test` · `npm run lint` · `npm run build`

## License

MIT
