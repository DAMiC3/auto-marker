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

## Don't change the link target

Each button and fallback link uses `{{ .ConfirmationURL }}` — Supabase's own
verify URL. **Keep it as-is.** It redirects through our `/auth/callback`, which
establishes the session and forwards to a friendly landing page
(`/auth/confirmed` for sign-ups, `/reset-password` for recovery). Swapping it for
a hand-built link can break that flow.

## Redirect allow-list (one-time)

For the links to come back to the app, **Authentication → URL Configuration**
must allow our callback:

- **Site URL:** `https://auto-marker.bernardmanne3.workers.dev`
- **Redirect URLs:** add `https://auto-marker.bernardmanne3.workers.dev/auth/callback`
  (and `http://localhost:3000/auth/callback` for local dev).

## Why the landing page changed too

Previously a confirmation link that couldn't open a session here (e.g. opened on
a different device than sign-up) dumped the user on `/login?error=auth` — looked
broken even though the email **was** verified. Now `/auth/callback` always sends
sign-ups to `/auth/confirmed` ("You're all set!") and recovery to
`/reset-password`, so the link never lands on an error-looking URL. See
`app/auth/callback/route.ts` and `app/auth/confirmed/page.tsx`.
