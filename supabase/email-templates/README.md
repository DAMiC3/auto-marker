# AutoMark — branded auth email templates (P3-9)

Supabase's default auth emails are bare (`<h2>` + a raw link) and don't say what
they're for. These templates rebrand them so a recipient immediately sees it's an
**AutoMark** email and whether they're **confirming an account** or **resetting a
password**.

> ⚠️ These live in the **Supabase dashboard**, not in this repo — Supabase has no
> API in our toolchain to push them, so they must be pasted in by hand (one-time).
> The files here are the source of record; edit them here, then re-paste.

## How to apply

1. Open the Supabase dashboard → project `pdlkkfedovssaaecemkp`.
2. **Authentication → Email Templates.**
3. For each template below, switch to the **HTML / source** view, replace the
   contents with the matching file, and **Save**:

   | Supabase template   | File                     | Subject line suggestion              |
   |---------------------|--------------------------|--------------------------------------|
   | Confirm signup      | `confirm-signup.html`    | `Confirm your AutoMark account`      |
   | Reset Password      | `reset-password.html`    | `Reset your AutoMark password`       |
   | Magic Link          | `magic-link.html`        | `Your AutoMark sign-in link`         |

   (Set the subject in the field above the body editor.)

## The link target — `token_hash` (cross-device safe)

Each button/fallback link is built as:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=<signup|recovery|magiclink>
```

**Keep this — don't swap it for `{{ .ConfirmationURL }}`.** We deliberately use the
`token_hash` (OTP) pattern instead of the PKCE `?code=` link:

- **PKCE (`?code=`)** only completes in the *same browser* that requested the email
  (it needs a code-verifier cookie). Request a reset on a laptop, open it on a
  phone → "invalid/expired". That was the original reset complaint.
- **`token_hash`** is verified server-side by `/auth/callback` via
  `supabase.auth.verifyOtp({ type, token_hash })` — **no same-device cookie
  needed**, so the link works on any device.

`type` drives where the user lands (see `app/auth/callback/route.ts`):
`signup`/`magiclink` → `/auth/confirmed` ("You're all set!"); `recovery` →
`/reset-password` (the link also carries `&next=/reset-password`).

## Site URL is now required (one-time)

Because the links are built from `{{ .SiteURL }}`, **Authentication → URL
Configuration → Site URL must be exactly** the app origin or every link 404s:

- **Site URL:** `https://auto-marker.bernardmanne3.workers.dev`
- **Redirect URLs:** also add `https://auto-marker.bernardmanne3.workers.dev/auth/callback`
  (and `http://localhost:3000/auth/callback` for local dev).

## Why the landing page changed too

Previously a confirmation link that couldn't open a session here (e.g. opened on
a different device than sign-up) dumped the user on `/login?error=auth` — looked
broken even though the email **was** verified. Now `/auth/callback` always sends
sign-ups to `/auth/confirmed` ("You're all set!") and recovery to
`/reset-password`, so the link never lands on an error-looking URL. See
`app/auth/callback/route.ts` and `app/auth/confirmed/page.tsx`.
