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

- **Fields:** email + password (always); **full name** only on sign-up. Password `minLength` is **8 on sign-up, 6 on sign-in** (P7-4 — the higher floor applies to new passwords without locking out anyone who set a 6-char one before).
- **Config guard:** if Supabase isn't configured → "Sign-in isn't configured yet."
- **Sign-in:** `supabase.auth.signInWithPassword({ email, password })`; on success `router.push("/")` + `refresh()`; on error shows a friendly message. If the error is *email not confirmed*, a **"Resend confirmation link"** action appears (P7-6 — `supabase.auth.resend({ type: 'signup' })`).
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

**The confirmation round-trip — `app/auth/callback/route.ts` (hardened 2026-06-25, P3-9):**
1. Supabase emails a link to `${origin}/auth/callback?…`.
2. The route establishes a session from whichever flow the link uses: `?code=…` → `exchangeCodeForSession`; `?token_hash=…&type=…` → `verifyOtp`. (Supporting both means branding the email templates can't silently break the flow.)
3. **Sign-up / email confirmation** → always `redirect(${origin}/auth/confirmed)` — the friendly "You're all set!" page (Cat 3). If the session couldn't be opened here (e.g. link opened on a *different device* than sign-up, so the PKCE verifier cookie is absent) it appends `?signin=1` and the page tells them to sign in — because the email **was** still verified by Supabase. **No more `/login?error=auth` for confirmations.**
4. **Recovery** (`type=recovery` or `next=/reset-password`) → `redirect(${origin}/reset-password)`, which checks the session itself and shows a clear invalid/expired state if needed.

> ✅ **The silent `?error=auth` paper-cut is gone for the email flows** — sign-ups land on `/auth/confirmed`, recovery on `/reset-password`, both with real copy. (P7-6's *resend-confirmation* sub-item is still open.)

> **Config dependency:** `emailRedirectTo` points at `${location.origin}/auth/callback`, so the app's origin **must be in Supabase Auth's allowed redirect URLs** (and the confirmation email template must use `{{ .ConfirmationURL }}`). Not verifiable from SQL — a deploy-time checklist item. Branded templates + the redirect allow-list are documented in [`supabase/email-templates/README.md`](../../supabase/email-templates/README.md).

---

## 4b. Password reset — BUILT 2026-06-16 (P7-2 / P3-2)

A forgotten-password recovery flow, deliberately built to **reuse the existing `/auth/callback` code-exchange** rather than add a second exchange path.

```
1. /login → "Forgot your password?" (mode "reset", email-only form)
2. resetPasswordForEmail(email, { redirectTo: ${origin}/auth/callback?next=/reset-password })
3. Supabase emails a recovery link → ${origin}/auth/callback?code=…&next=/reset-password
4. /auth/callback exchanges the code for a (recovery) session, redirects to /reset-password
5. /reset-password (signed in via the recovery session) → updateUser({ password })
6. Success → router.push("/") (already signed in) → into the app
```

- **Login surface:** `app/login/page.tsx` gained a third mode `"reset"` (email-only; password field hidden). The notice is deliberately **non-committal** — *"If that email is registered, a password-reset link is on its way"* — so it doesn't reveal which emails exist.
- **Reset page:** `app/reset-password/page.tsx` — checks for the recovery session on mount (`getUser()`); shows the new-password form (password + confirm, `minLength 6`) when present, or a *"link invalid or expired → back to sign in"* message when not.
- **No middleware change.** `/reset-password` is a **protected** route: the user arrives already signed in (the callback set the session), so middleware lets them through. As of 2026-06-25 the callback sends **all** recovery links straight to `/reset-password` (not `/login?error=auth`); a bad/expired link arrives without a session, and the page's own `getUser()` check renders the friendly *"link invalid or expired → back to sign in"* state. So recovery no longer hits the silent-`?error=auth` gap.
- **Config dependency (same as §4):** `${origin}/auth/callback` must be in Supabase Auth's allowed redirect URLs, and the **recovery** email template must point at it. Deploy-checklist item (P7-10).

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

Pulled from the live `auth.users` (orphan cleanup applied 2026-06-30):

| Signal | Finding |
|--------|---------|
| **5 auth users, 5 profiles** | **No orphans** — one-to-one `auth.users` ↔ `profiles`. The 2 anonymous orphans (2025-11-07 & 2025-11-10) were **deleted 2026-06-30 (P7-7)**, and anonymous sign-in is now **disabled (P7-3)** so no new ones can appear. |
| **Providers** | Everyone is `provider = "email"`. **No OAuth/social, no magic-link** in use. |
| **Confirmation** | Enforced (§4). The unconfirmed (e.g. Lila) can now self-resend the link (P7-6). |
| **Orphan risk** | Closed: no profile-less rows remain, and the source (anon sign-in) is off. The fail-closed guard (`isBlocked(null) = true`, Cat 1 §6.1) still protects against any future mismatch. |

> **Action:** ✅ done — orphans deleted (P7-7), anonymous sign-in disabled (P7-3).

---

## 8. The onboarding journey (first-run) — and where it dead-ends

What a brand-new lecturer actually experiences today:

```
1. Hit the app → middleware redirects to /login
2. Sign up (name, email, password ≥8)
3. "Check your email to confirm"      ← must leave the app
4. Click the email link → /auth/callback → session → /
5. Land in the app … on the empty "Connect your files" state
6. profiles row = plan 'none', R0  → marking is BLOCKED
7. A "Start your free trial" card is shown (TrialCta) → one click activates
   a 7-day / R50 trial and marking is unblocked.  ✅ (P7-1, 2026-06-29)
```

**The hard dead-end is closed (P7-1).** A `no_plan` user now sees a prominent **"Start free trial"** card on the main page:

```
TrialCta (no_plan only)
  └─ POST /api/trial/start
       ├─ identify caller from THEIR cookie session (never a body uuid)
       ├─ refuse if plan != 'none' (don't downgrade a paid/active user)   → 409 already_has_plan
       ├─ service-role  set_plan(user,'trial')   (EXECUTE is service_role-only)
       │     └─ P1-7 one-trial-per-email guard → raises trial_already_used → 409
       └─ ok → dispatch 'allowance-refresh' → AllowanceBar/PlanNotice/Mark gate re-read
```

- **Files:** `components/TrialCta.tsx` (the card + its idle/starting/started/used/error states), `app/api/trial/start/route.ts` (the grant route). `AllowanceBar` gained a `trial` → "Free trial" label.
- **Already-used path:** a repeat claim (same email) surfaces P1-7's `trial_already_used` as an amber "you've already used your free trial → see plans" card, not an error.
- **Still open (Phase 1):** the richer first-launch help/tour and plain-language onboarding copy — the *guidance* half — remain unbuilt (tracked under Cat 3 §10 and P7-6's onboarding bundle). What's fixed is the **path to value**; what's pending is the **hand-holding**.

---

## 8a. Account deletion & data export (P7-8, POPIA) — built 2026-06-30

POPIA gives SA users the right to **access** and **delete** their personal data. Both now live in **Settings → Advanced** — a deliberately low-key, collapsed disclosure (not advertised), with **"Export my data"** at the bottom and **"Delete my account"** behind a confirmation step.

**What we actually hold on a user** is mundane: identity (name/email), plan window, and a marking-activity log. **Student PDFs never reach the server** (marking is client-side), so there's no sensitive content to export or purge.

**Export — `GET /api/account/export`:** raw CSV, **bare-minimum** fields only — name, email, plan, plan start/end, and the activity log (date · papers · quality tier). **Deliberately excludes Rand** (ADR-002: never show the user Rand) and all accounting/revenue rows (those are the business's books, not the user's personal data). Caller is identified from their own session; the file downloads client-side via a Blob.

**Delete — `POST /api/account/delete`:** identifies the caller from their session, then `auth.admin.deleteUser(userId)` (service-role). The schema's FKs encode the entire retention policy — **no migration needed**:

| Table | FK on `auth.users` | On delete | Why |
|-------|--------------------|-----------|-----|
| `profiles` | `on delete cascade` | **removed** | personal account row |
| `usage_events` | `on delete cascade` | **removed** | personal activity log |
| `trial_claims` | *(no FK; email-keyed)* | **kept** | so delete-then-re-signup can't re-claim the free trial (P1-7) |
| `revenue_events` | `on delete set null` (+ `email` snapshot) | **kept** | financial/tax records must survive account deletion |

After a successful delete the client signs out and routes to `/login`. The delete button has a two-step confirm ("Yes, delete my account" / "Cancel") and the warning explicitly notes the trial can't be re-claimed.

> **Retention justification (POPIA):** keeping a single email + timestamp in `trial_claims` is minimal data retained for **fraud prevention** (a recognised lawful basis); `revenue_events` is retained for **financial record-keeping**. A future hardening could store a *hash* of the email in `trial_claims` so re-claims are still blocked without holding readable PII.

---

## 9. Known gaps & issues

- **No onboarding / help system** — first-run still has no tour or help button (Phase 1). Biggest *remaining* UX gap, shared with Cat 3 §10.
- ~~**No self-serve trial**~~ — **BUILT 2026-06-29** (§8, P7-1): the "Start free trial" card activates a 7-day/R50 trial in one click; no more manual SQL grant.
- ~~**No password-reset flow**~~ — **BUILT 2026-06-16** (§4b). Login page now has a "Forgot your password?" path; `/reset-password` sets the new password.
- ~~**Silent `?error=auth`**~~ — **resolved for the email flows 2026-06-25** (§4, P3-9): sign-ups land on `/auth/confirmed`, recovery on `/reset-password`, both with real copy.
- ~~**Middleware has no `try/catch`**~~ — **FIXED 2026-06-27** (P7-5): `getUser()` wrapped, fails closed to `/login`.
- ~~**Email-confirmation friction / no resend UI**~~ — **BUILT 2026-06-30** (P7-6): login page has a "Resend confirmation link" action; a stuck-unconfirmed user (e.g. Lila) can re-trigger the email themselves.
- ~~**Orphaned anonymous users**~~ — **DELETED 2026-06-30** (P7-7); anon sign-in disabled (P7-3) so no new ones appear.
- ~~**`signOut` errors unhandled**~~ — **FIXED 2026-06-30** (P7-9): both entry points surface the failure and don't fake a sign-out.
- **No account deletion / data-export** — POPIA gap (P7-8), still open.
- **No OAuth / social login** — email/password only (fine for now; just noting).

---

## 9a. Supabase Auth dashboard hardening (P7-3 / P7-4) — done 2026-06-30

These live in **GoTrue auth config**, which the app's SQL/MCP tooling can't write, so they were changed by hand in the Supabase dashboard (project `pdlkkfedovssaaecemkp`). Recorded here so the exact location is known if they ever need re-checking.

**P7-3 — anonymous sign-ins → DISABLED ✅**
- **Authentication → Sign In / Providers → User Signups → "Allow anonymous sign-ins"** toggled **off**.
- Verified: security advisor **0012 no longer appears** in `get_advisors(security)`.
- Still open: delete the 2 orphaned anon users left from before (P7-7).

**P7-4 — password policy:**
- **(a) Minimum length → 8 ✅** — **Authentication → Sign In / Providers → Email provider → "Minimum password length"** raised **6 → 8** (matches the sign-up form). Server-enforced now, not just client-side.
- **(b) Leaked-password protection (HaveIBeenPwned) → DEFERRED ⬜** — the toggle (Email provider → *"Prevent use of leaked passwords"*, also surfaced on **Attack Protection**) is labelled **"Only available on Pro plan and above"**, and the org is on the **Free** tier. Cannot be enabled without upgrading Supabase. Tracked as **P7-11**; the `auth_leaked_password_protection` WARN advisor persists until then.

> Zero-downtime, no effect on existing sessions. Sign-in min length stays at 6 client-side so anyone who set a 6-char password before this change can still get in and (if needed) reset it.

---

## 10. Onboarding roadmap (from `../expansion-plan.md`)
- **Phase 1:** prominent first-launch help (big → corner), plain-language copy, the cross-browser file picker (so step 5 isn't a wall for non-Chromium users).
- **Phase 2:** ✅ self-serve **"Start free trial"** is **built** (P7-1, 2026-06-29) — `TrialCta` → `POST /api/trial/start` → service-role `set_plan(user,'trial')`, with P1-7's one-trial-per-email guard surfaced as `trial_already_used`. Remaining Phase-2 onboarding work: trial-expiry / confirmation emails (Cat 3 §8).

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
| ~~**P7-1**~~ | ✅ | ~~**First-run dead-ends** — a confirmed, signed-in user lands at R0/blocked with **no self-serve path**; only a manual `set_plan` unblocks them.~~ — **FIXED 2026-06-29** (see §8): a `no_plan` user now sees a **"Start free trial"** card (`components/TrialCta.tsx`) → `POST /api/trial/start` → service-role `set_plan(user,'trial')` (7 days / R50). Self-identifies from the cookie session, refuses to downgrade an existing plan, and surfaces P1-7's `trial_already_used` as a "see plans" nudge. *(The richer onboarding/help tour — Phase 1 — is still open under P7-6/Cat 3.)* | Done. |
| ~~**P7-2**~~ | ✅ | ~~**No password-reset flow** — `resetPasswordForEmail` is wired nowhere; a user who forgets their password is stuck. (= P3-2)~~ — **FIXED 2026-06-16** (see §4b): "Forgot your password?" on the login page → `resetPasswordForEmail` → existing `/auth/callback` → `app/reset-password/page.tsx` → `updateUser({ password })`. | Done. |
| ~~**P7-3**~~ | ✅ | ~~**Anonymous sign-ins enabled** *(advisor 0012)* — anyone can create an anonymous session and pass middleware into the app shell.~~ — **FIXED 2026-06-30** (Auth → Sign In / Providers → "Allow anonymous sign-ins" turned **off**). Verified: security advisor **0012 no longer appears**. *(The 2 orphaned anon users remain — see P7-7.)* | Done. |
| **P7-4** | 🟠 (partial) | **Weak password security.** Two halves: **(a) min length** — ✅ **done 2026-06-30**: sign-up form requires **≥8** (sign-in left at 6 so pre-existing 6-char passwords still work) **and** Supabase Auth → Email → *Minimum password length* raised **6 → 8**, so it's enforced server-side too. **(b) leaked-password protection (HaveIBeenPwned)** — ⬜ **blocked: Pro-only.** The dashboard toggle reads *"Only available on Pro plan and above"* and the org is on the **Free** tier, so the `auth_leaked_password_protection` advisor (WARN) will persist until Supabase is upgraded. | ✅ min length raised both sides. ⬜ HIBP deferred until Supabase Pro (see P7-11). |
| ~~**P7-5**~~ | 🟢 | ✅ **FIXED (2026-06-27).** `getUser()` wrapped in try/catch in `middleware.ts`: a thrown lookup is logged and treated as no-user (fail closed), routing protected pages to `/login` instead of crashing page loads. (= P4-1) | Done. |
| ~~**P7-6**~~ | ✅ | ~~`?error=auth` never shown~~ — error-display half resolved earlier (P3-9). ~~Remaining: no **resend-confirmation UI**.~~ — **FIXED 2026-06-30:** `app/login/page.tsx` now offers a **"Didn't get the email? Resend confirmation link"** action (`supabase.auth.resend({ type: 'signup' })`) — shown after a sign-up and after a failed sign-in whose error is *email not confirmed*. Email throttles surface via `authErrorMessage`. So a user like Lila can now re-trigger the link themselves. | Done. |
| ~~**P7-7**~~ | ✅ | ~~**Orphaned anonymous users** — 2 profile-less `auth.users` rows from Nov 2025 (pre-trigger).~~ — **DELETED 2026-06-30** (`b90df96d…` 2025-11-07, `ccbf6e3f…` 2025-11-10; scoped `delete` requiring `is_anonymous` + null email + no profile). Verified: `auth.users` = 5, **anon = 0**, profiles = 5 (one-to-one, no orphans). | Done. |
| ~~**P7-8**~~ | ✅ | ~~**No account deletion / data-subject flow** — POPIA gives SA users deletion/access rights; there's no path.~~ — **BUILT 2026-06-30** (see §8a). Settings → **Advanced** (low-key, collapsed) → **"Export my data (CSV)"** (`GET /api/account/export`, bare-minimum fields, no Rand) + **"Delete my account"** (confirmation step → `POST /api/account/delete`). Deletion hard-deletes `auth.users`; FK cascades remove `profiles`/`usage_events`, while `trial_claims` (re-trial guard) and `revenue_events` (tax records) are kept by design. **No migration needed** — the schema's cascade rules already encode the retention policy. | Done. |
| ~~**P7-9**~~ | ✅ | ~~**`signOut` errors unhandled** — if it fails, the user thinks they're out but isn't.~~ — **FIXED 2026-06-30:** both sign-out entry points (`Sidebar.tsx`, `SettingsPanel.tsx`) now check `signOut()`'s returned error; on failure they show *"Couldn't sign you out — check your connection and try again"* and **do not navigate to `/login`** (so the user isn't misled into thinking a still-live session is closed). Button shows "Signing out…" + disabled during the call. *(No OAuth/social is still acceptable, noted.)* | Done. |
| **P7-10** | 🟡 | **Redirect-URL coupling** — `emailRedirectTo` origin must stay in Supabase's allowed redirect URLs across every deploy/domain change. | Deploy checklist item. |
| **P7-11** | 🔵 | **Leaked-password protection (HIBP) is Pro-gated** — the split-off remainder of P7-4(b). Supabase only offers the HaveIBeenPwned check on **Pro plan and above**; the org is on Free, so the `auth_leaked_password_protection` advisor stays WARN. | When/if Supabase is upgraded to Pro: Auth → Email → enable *"Prevent use of leaked passwords"*, then confirm the advisor clears. |

---

## 12. Key files & objects (quick reference)
| File / object | Role |
|---------------|------|
| `lib/supabase/client.ts` | Browser client (anon) |
| `lib/supabase/server.ts` | Server client (cookie-bound, acts as user) |
| `lib/supabase/service.ts` | Service-role client (bypasses RLS) |
| `middleware.ts` | Edge auth gate (redirects, public prefixes) |
| `app/login/page.tsx` | Sign-in / sign-up / **reset** UI + logic |
| `app/reset-password/page.tsx` | Set-new-password page (recovery session → `updateUser`); see §4b |
| `app/auth/callback/route.ts` | Email-link handler — PKCE + OTP; routes sign-ups → `/auth/confirmed`, recovery → `/reset-password` (P3-9) |
| `app/auth/confirmed/page.tsx` | Friendly "You're all set!" landing after confirmation (P3-9) |
| `components/TrialCta.tsx` | Self-serve "Start free trial" card for `no_plan` users (P7-1) |
| `app/api/trial/start/route.ts` | Grants the trial — service-role `set_plan(user,'trial')`, P1-7-guarded (P7-1) |
| `app/api/account/export/route.ts` | POPIA data export — bare-minimum CSV of the caller's data (P7-8) |
| `app/api/account/delete/route.ts` | POPIA account deletion — `auth.admin.deleteUser`; cascades + retention by schema (P7-8) |
| `components/Sidebar.tsx`, `components/SettingsPanel.tsx` | Sign-out entry points |
| DB: `handle_new_user()` + `on_auth_user_created` | Auto-creates the profile at signup |
| `auth.users`, `auth.identities` | Supabase-managed identity store |

## 13. Cross-references
- What a signed-in user is *allowed* to do (R0/blocked default, trial via `set_plan`) → **Category 1**
- Login/onboarding UI, help-system plans → **Category 3**
- Middleware/auth-callback error handling, fail-open config → **Category 4**
- The three Supabase clients, RLS, the `handle_new_user` trigger → **Category 6**
- First-run help + self-serve trial → `../expansion-plan.md` Phases 1–2
