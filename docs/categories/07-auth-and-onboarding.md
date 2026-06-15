# Category 7 — Auth & Onboarding

**Status:** ✅ Fully documented (extra-detailed) · **Last verified against live auth + code:** 2026-06-12
**Owner:** Michael Bernard · **Supabase project:** `pdlkkfedovssaaecemkp`

How a person becomes a user, proves who they are, holds a session, and gets to their first successful mark. Category 1 governs what they can *do* once they have a plan; this category covers everything **before and around** that — identity, sessions, and the first-run journey.

The one-line truth: **email/password auth via Supabase, with email confirmation enforced, cookie-based sessions gated by edge middleware, a profile auto-created at signup — and then a dead end, because a new user lands blocked at R0 with no self-serve way forward.**

---

## 1. Auth architecture — three clients, three contexts

Supabase auth is accessed through **three distinct clients**, each for a different runtime/trust level. Never mix them up.

| Client | File | Runs | Key | RLS | Used for |
|--------|------|------|-----|-----|----------|
| **Browser** | `lib/supabase/client.ts` | Client components | anon (public) | Applies | Login page, sign-out, `AllowanceBar` reads |
| **Server** | `lib/supabase/server.ts` | Route handlers / server components | anon + request cookies | Applies (acts *as the user*) | `getUser()` in routes, auth callback |
| **Service** | `lib/supabase/service.ts` | Server only | **service-role** | **Bypasses** | Metering writes, plan grants (Cat 1) |

- All three read `NEXT_PUBLIC_SUPABASE_URL` / `…ANON_KEY`; the service client adds `SUPABASE_SERVICE_ROLE_KEY` and disables session persistence/refresh (`persistSession: false, autoRefreshToken: false`).
- Each exports an `isSupabase*Configured()` guard so the app **degrades gracefully** when env is missing (Cat 4 §6) rather than crashing.
- Sessions are **cookie-based** via `@supabase/ssr` (`createBrowserClient` / `createServerClient`). The browser client manages cookies automatically; the server client reads them from the request and writes refreshed ones back (its `setAll` is `try/catch`-guarded because Server Components can't set cookies).

---

## 2. The route gate — `middleware.ts` (edge)

Every request (except static assets) passes through the middleware, which enforces "signed in or go to login."

- **Static/PWA allowlist** — `/_next`, `/icon*`, `/manifest.json`, `/sw.js`, `/favicon.ico` pass straight through.
- **Config fail-open** — if `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` are missing, it **doesn't gate at all** (local dev convenience). In prod this means a missing-env misconfig silently disables auth.
- **Public prefixes** — `/login` and `/auth` are reachable signed-out.
- **The two redirects:**
  - Not signed in + protected path → **redirect to `/login`**.
  - Signed in + on `/login` → **redirect to `/`**.
- **Matcher** — runs on everything except `_next/static`, `_next/image`, `favicon.ico`.
- **Why `middleware.ts` not `proxy.ts`** — Next 16 renamed edge middleware to `proxy.ts`, but `@opennextjs/cloudflare` only supports the old edge middleware. Pinned deliberately (Cat 6 §9).

> ⚠️ **No `try/catch` around `supabase.auth.getUser()`** (Cat 4 §3.5/§7). If Supabase auth is unreachable, this can throw and break page loads broadly — the single highest-value hardening target in the whole app. The *config* guard degrades gracefully; a *runtime auth outage* does not.

---

## 3. Sign-up & sign-in — `app/login/page.tsx`

A single dark-themed page with a `signin ⇄ signup` toggle (UI in Cat 3 §7).

- **Fields:** email + password (always); **full name** only on sign-up. Password `minLength={6}`.
- **Config guard:** if Supabase isn't configured → "Sign-in isn't configured yet."
- **Sign-in:** `supabase.auth.signInWithPassword({ email, password })`; on success `router.push("/")` + `refresh()`; on error shows `error.message` verbatim.
- **Sign-up:** `supabase.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: ${origin}/auth/callback } })`.
  - The `full_name` is stashed in `raw_user_meta_data` — which `handle_new_user` later reads (§5).
  - **Branch on `data.session`:**
    - `session` present → email confirmation disabled → straight into the app. **(Not the live path — see §4.)**
    - `session` null → **"Account created. Check your email to confirm, then sign in."** and flips to sign-in mode. **(This is the live path.)**

---

## 4. Email confirmation — ENABLED (empirically confirmed)

The login page handles *both* confirmation-on and confirmation-off, so the real setting matters. **Live data proves confirmation is enforced:**

- Of 6 auth users, **3 confirmed** (Michael, Nicola, Carien — each `email_confirmed_at` set ~30 s after signup, i.e. they clicked the link) and **3 unconfirmed**.
- **Lila** (`lila.ciao@mtn.co.za`) signed up 2026-05-31, has **`email_confirmed_at = null`** and **`last_sign_in_at = null`** — she signed up, never confirmed, and **has never been able to sign in**. That's the confirmation gate working as designed (and a live example of its friction).

**The confirmation round-trip — `app/auth/callback/route.ts`:**
1. Supabase emails a link to `${origin}/auth/callback?code=…`.
2. The route exchanges it: `supabase.auth.exchangeCodeForSession(code)`.
3. Success → `redirect(${origin}${next})` (defaults to `/`).
4. Failure (or no code) → `redirect(/login?error=auth)`.

> ⚠️ **`?error=auth` is silently dropped** (Cat 4 §7) — the login page never reads the query param, so a failed/expired confirmation link looks like a plain login screen with no explanation. Real onboarding paper-cut.

> **Config dependency:** `emailRedirectTo` points at `${location.origin}/auth/callback`, so the app's origin **must be in Supabase Auth's allowed redirect URLs** (and the confirmation email template must use it). Not verifiable from SQL — a deploy-time checklist item.

---

## 5. Profile creation — `handle_new_user()` trigger

- Trigger **`on_auth_user_created`** fires on **`auth.users` INSERT** (at signup, *before* confirmation), inserting a `profiles` row with `id` + `full_name` (from `raw_user_meta_data->>'full_name'`). Everything else takes defaults → **`plan='none'`, cap 0, used 0** (Cat 1 §4.3, Cat 6 §5.1).
- **Confirmed by live data:** Lila is unconfirmed yet *has* a profile — so the profile is created at signup, not at confirmation.
- **Not retroactive:** the trigger only fires on new inserts. See the orphan finding (§7).

So a brand-new user exists as: an `auth.users` row (possibly unconfirmed) + a `profiles` row at **R0, blocked**.

---

## 6. Session lifecycle & sign-out

- **Establish:** `signInWithPassword` (or `exchangeCodeForSession`) sets the auth cookies via the browser/server client.
- **Carry:** middleware reads cookies on every request and refreshes them; routes use the server client's `getUser()` to identify the caller (the metering `userId`, Cat 1 §7).
- **Sign-out** — two entry points, identical logic: `createClient().auth.signOut()` then `router.push("/login")` + `router.refresh()`:
  - `components/Sidebar.tsx` (user-menu → Sign out)
  - `components/SettingsPanel.tsx` (Account section → Sign out)
- The `router.refresh()` is important — it re-runs the middleware so the now-signed-out state is enforced server-side, not just client-side.

---

## 7. Live state & data-hygiene findings

Pulled from the live `auth.users` on 2026-06-12:

| Signal | Finding |
|--------|---------|
| **6 auth users, 4 profiles** | **2 orphaned auth users** (created 2025-11-07 & 2025-11-10) with **null email, null provider** — i.e. **anonymous sign-ins** from early testing, predating the `handle_new_user` trigger, so they have **no profile row**. |
| **Providers** | Everyone real is `provider = "email"`. **No OAuth/social, no magic-link** in use. |
| **Confirmation** | Enforced (§4). 3 confirmed, 3 unconfirmed (Lila + the 2 anon). |
| **Orphan risk** | An auth user with no profile would, if they marked, have a `userId` but `profile = null` → `isBlocked(null) = true` → **blocked** (Cat 1 §6.1 fail-closed handles it safely). Still worth cleaning up. |

> **Action:** consider deleting the 2 orphaned anonymous users, and decide whether anonymous sign-in should be disabled in Supabase Auth (it appears to have been possible at some point).

---

## 8. The onboarding journey (first-run) — and where it dead-ends

What a brand-new lecturer actually experiences today:

```
1. Hit the app → middleware redirects to /login
2. Sign up (name, email, password ≥6)
3. "Check your email to confirm"      ← must leave the app
4. Click the email link → /auth/callback → session → /
5. Land in the app … on the empty "Connect your files" state
6. profiles row = plan 'none', R0  → marking is BLOCKED
7. No "Start free trial" button, no guidance → DEAD END
   (only escape: Michael manually runs set_plan(uuid,'trial'))
```

**This is the product's biggest onboarding gap.** Steps 5–7 give a confirmed, signed-in user *no self-serve path to value*. The expansion plan's Phase 1 (a prominent first-launch help system that shrinks to a corner) and Phase 2 (a self-serve "Start free trial" button that calls `set_plan(user,'trial')`) are the fixes. Until then, every new signup requires a manual grant.

---

## 9. Known gaps & issues

- **No onboarding / help system** — first-run is a bare empty state; no tour, no help button (Phase 1). Biggest UX gap, shared with Cat 3 §10.
- **No self-serve trial** — new users are blocked until a manual SQL grant (§8). Phase 2.
- **No password-reset flow** — the login page has sign-in/sign-up only; there's **no "forgot password"** link or reset handling. A real production gap (`supabase.auth.resetPasswordForEmail` isn't wired anywhere).
- **Silent `?error=auth`** — failed confirmation links show no message (§4).
- **Middleware has no `try/catch`** around `getUser()` — auth outage isn't degraded (§2, Cat 4 §7).
- **Email-confirmation friction** — Lila is the live proof a user can sign up and get permanently stuck; no resend-confirmation UI exists.
- **Orphaned anonymous users** — 2 profile-less auth rows (§7).
- **No OAuth / social login** — email/password only (fine for now; just noting).

---

## 10. Onboarding roadmap (from `../expansion-plan.md`)
- **Phase 1:** prominent first-launch help (big → corner), plain-language copy, the cross-browser file picker (so step 5 isn't a wall for non-Chromium users).
- **Phase 2:** self-serve **"Start free trial"** button → a server action calling `set_plan(user,'trial')` with abuse guards (one trial per user/email), so steps 6–7 become a real path to value. Also: trial-expiry / confirmation emails (Cat 3 §8).

---

## 11. Invariants — do not break these
1. **New users stay R0/blocked** until explicitly granted (Cat 1) — don't auto-grant a plan in `handle_new_user`.
2. **`handle_new_user` must keep reading `full_name` from `raw_user_meta_data`** — the signup form depends on it.
3. **Sign-out must `router.refresh()`** so the middleware re-evaluates server-side.
4. **`emailRedirectTo` origin must stay in Supabase's allowed redirect URLs** across every deploy/domain change.
5. **Never use the service client in anything that ships to the browser** — auth identity comes from the cookie-bound server/browser clients only.
6. **Keep middleware on `middleware.ts`** (edge), not `proxy.ts`, while on OpenNext (Cat 6 §9).

---

## Problems / To-Fix Backlog

> Severity: 🔴 fix before real paying customers · 🟠 important · 🟡 minor/polish · 🔵 not-built/roadmap. Items marked *(advisor NNNN)* are from Supabase's own linter (run 2026-06-12).

| ID | Sev | Problem | Fix direction |
|----|-----|---------|---------------|
| **P7-1** | 🔴 | **First-run dead-ends** — a confirmed, signed-in user lands at R0/blocked with **no self-serve path** (no trial button, no guidance); only a manual `set_plan` unblocks them. | Build the self-serve "Start free trial" button (Phase 2) + onboarding (Phase 1). |
| **P7-2** | 🔴 | **No password-reset flow** — `resetPasswordForEmail` is wired nowhere; a user who forgets their password is stuck. (= P3-2) | Add "Forgot password?" + reset page + callback handling. |
| **P7-3** | 🟠 | **Anonymous sign-ins enabled** *(advisor 0012; + 2 orphaned anon users)* — anyone can create an anonymous session and pass middleware into the app shell. | Disable anonymous sign-in in Supabase Auth (unless intentionally used). |
| **P7-4** | 🟠 | **Weak password security** — leaked-password protection is **disabled** *(advisor)*, and the only rule is `minLength 6`. | Enable HaveIBeenPwned check; raise minimum length / add strength rules. |
| **P7-5** | 🔴 | **Middleware no `try/catch`** around `getUser()` → auth outage breaks page loads. (= P4-1) | Wrap + degrade gracefully. |
| **P7-6** | 🟡 | **Silent confirmation failure** — `?error=auth` never shown (= P4-5); and **no resend-confirmation UI** (Lila is permanently stuck unconfirmed). | Show the error; add a "resend confirmation" action. |
| **P7-7** | 🟡 | **Orphaned anonymous users** — 2 profile-less `auth.users` rows from Nov 2025 (pre-trigger). | Delete them; decide on anonymous sign-in (P7-3). |
| **P7-8** | 🟠 | **No account deletion / data-subject flow** — POPIA gives SA users deletion/access rights; there's no path. | Add account deletion + data export (Phase 4). |
| **P7-9** | 🟡 | **`signOut` errors unhandled** — if it fails, the user thinks they're out but isn't; also no OAuth/social (acceptable, noted). | Handle the sign-out error path. |
| **P7-10** | 🟡 | **Redirect-URL coupling** — `emailRedirectTo` origin must stay in Supabase's allowed redirect URLs across every deploy/domain change. | Deploy checklist item. |

---

## 12. Key files & objects (quick reference)
| File / object | Role |
|---------------|------|
| `lib/supabase/client.ts` | Browser client (anon) |
| `lib/supabase/server.ts` | Server client (cookie-bound, acts as user) |
| `lib/supabase/service.ts` | Service-role client (bypasses RLS) |
| `middleware.ts` | Edge auth gate (redirects, public prefixes) |
| `app/login/page.tsx` | Sign-in / sign-up UI + logic |
| `app/auth/callback/route.ts` | Email-confirmation / code-exchange handler |
| `components/Sidebar.tsx`, `components/SettingsPanel.tsx` | Sign-out entry points |
| DB: `handle_new_user()` + `on_auth_user_created` | Auto-creates the profile at signup |
| `auth.users`, `auth.identities` | Supabase-managed identity store |

## 13. Cross-references
- What a signed-in user is *allowed* to do (R0/blocked default, trial via `set_plan`) → **Category 1**
- Login/onboarding UI, help-system plans → **Category 3**
- Middleware/auth-callback error handling, fail-open config → **Category 4**
- The three Supabase clients, RLS, the `handle_new_user` trigger → **Category 6**
- First-run help + self-serve trial → `../expansion-plan.md` Phases 1–2
