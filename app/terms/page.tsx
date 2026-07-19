import Link from "next/link";
import TermsBody from "@/components/TermsBody";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

export const metadata = { title: "Terms & Conditions · AutoMark" };

// Public page — reachable without signing in (allow-listed in middleware) so it can
// be linked from the signup form and the acceptance pop-up.
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#F3F6FB] px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition-colors mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to AutoMark
        </Link>

        <h1 className="text-[26px] font-bold text-slate-900 mb-6">Terms &amp; Conditions</h1>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 text-slate-700">
          <TermsBody />
        </div>

        <p className="text-center text-[12px] text-slate-400 mt-4">Version {CURRENT_TERMS_VERSION}</p>
      </div>
    </div>
  );
}
