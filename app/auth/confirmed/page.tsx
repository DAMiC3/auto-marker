import Link from "next/link";

// Friendly landing page after an email-confirmation link is clicked (P3-9).
// Reached from /auth/callback. `?signin=1` means the email was verified but we
// couldn't open a session here (link opened on another device) — so we send the
// user to sign in rather than into the app.
export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string }>;
}) {
  const { signin } = await searchParams;
  const needSignIn = signin === "1";

  return (
    <div className="min-h-screen bg-[#0E1525] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-600)] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <span className="text-white text-[20px] font-bold tracking-tight">AutoMark</span>
        </div>

        {/* Card */}
        <div className="bg-[#161E2E] rounded-2xl border border-white/10 px-8 py-9 text-center">
          {/* Success check */}
          <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 6" />
            </svg>
          </div>

          <h1 className="text-white text-[19px] font-semibold mb-2">You&rsquo;re all set!</h1>
          <p className="text-slate-400 text-[13px] leading-relaxed mb-7">
            Your email has been confirmed and your AutoMark account is ready.
            {needSignIn ? " Sign in to start marking." : " Welcome aboard — let’s get marking."}
          </p>

          <Link
            href={needSignIn ? "/login" : "/"}
            className="block w-full rounded-xl py-3 font-semibold text-[14px] text-white bg-[var(--accent-600)] hover:bg-[var(--accent-700)] transition-all"
          >
            {needSignIn ? "Sign in" : "Go to AutoMark"}
          </Link>
        </div>

        <p className="text-slate-600 text-[12px] text-center mt-6">AutoMark · AI-powered answer marking</p>
      </div>
    </div>
  );
}
