import Link from "next/link";
import PolicyBody from "@/components/PolicyBody";
import { TERMS_ENTITY } from "@/lib/terms";
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_SECTIONS, PRIVACY_VERSION } from "@/lib/privacy";

export const metadata = { title: "Privacy Policy · AutoMark" };

// Public page — allow-listed in middleware so it's readable without signing in.
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#F3F6FB] px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition-colors mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to AutoMark
        </Link>

        <h1 className="text-[26px] font-bold text-slate-900 mb-6">Privacy Policy</h1>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 text-slate-700">
          <PolicyBody entity={TERMS_ENTITY} effectiveDate={PRIVACY_EFFECTIVE_DATE} sections={PRIVACY_SECTIONS} />
        </div>

        <div className="flex items-center justify-center gap-4 text-[12px] text-slate-400 mt-4">
          <span>Version {PRIVACY_VERSION}</span>
          <span>·</span>
          <Link href="/terms" className="hover:text-slate-600 underline underline-offset-2">Terms</Link>
          <Link href="/refunds" className="hover:text-slate-600 underline underline-offset-2">Refunds</Link>
        </div>
      </div>
    </div>
  );
}
