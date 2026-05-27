"use client";

import Link from "next/link";

const WHATSAPP = "27799050642"; // 079 905 0642 in international format

const PLANS = [
  {
    key: "standard",
    name: "Standard",
    price: "R1000",
    blurb: "Ideal for most marking.",
    points: ["Full AI marking", "Enough allowance for regular tests", "Standard accuracy"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "R3000",
    blurb: "5× the allowance — for large groups and exam season.",
    points: ["5× the monthly allowance", "Best for exam season", "High accuracy available"],
    featured: true,
  },
];

function waLink(plan: string) {
  const msg = `Hi! I'd like to activate the ${plan} plan. Here is my proof of payment.`;
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;
}

export default function PlansPage() {
  return (
    <div className="min-h-screen bg-[#F3F6FB] px-4 py-10">
      <div className="max-w-3xl mx-auto">
        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition-colors mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to AutoMark
        </Link>

        <h1 className="text-[26px] font-bold text-slate-900 mb-1">Choose your plan</h1>
        <p className="text-[14px] text-slate-500 mb-8">
          Choose a plan and activate it with a simple EFT payment. No card needed.
        </p>

        {/* Plans */}
        <div className="grid sm:grid-cols-2 gap-5 mb-10">
          {PLANS.map((p) => (
            <div
              key={p.key}
              className={`rounded-2xl border bg-white p-6 flex flex-col ${
                p.featured ? "border-[var(--accent-500)] ring-1 ring-[var(--accent-500)]" : "border-slate-200"
              }`}
            >
              {p.featured && (
                <span className="self-start mb-3 text-[11px] font-semibold text-[var(--accent-700)] bg-[var(--accent-50)] px-2.5 py-1 rounded-full">
                  Most popular
                </span>
              )}
              <h2 className="text-[18px] font-bold text-slate-900">{p.name}</h2>
              <p className="text-[13px] text-slate-500 mb-4">{p.blurb}</p>
              <div className="mb-4">
                <span className="text-[28px] font-bold text-slate-900">{p.price}</span>
                <span className="text-[14px] text-slate-400"> / month</span>
              </div>
              <ul className="flex flex-col gap-2 mb-6">
                {p.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2 text-[13px] text-slate-600">
                    <svg className="w-4 h-4 text-[var(--accent-600)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {pt}
                  </li>
                ))}
              </ul>
              <a
                href={waLink(p.name)}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-auto text-center rounded-xl py-3 text-[14px] font-semibold transition-colors ${
                  p.featured
                    ? "bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                }`}
              >
                Choose {p.name}
              </a>
            </div>
          ))}
        </div>

        {/* How to pay */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 mb-5">
          <h3 className="text-[15px] font-semibold text-slate-900 mb-4">How to pay</h3>
          <ol className="flex flex-col gap-3">
            {[
              "Pay the amount for your chosen plan into the account below (EFT).",
              "WhatsApp us your proof of payment.",
              "Your subscription is activated within 24 hours.",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-[14px] text-slate-700">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--accent-600)] text-white text-[12px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Bank details */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 mb-5">
          <h3 className="text-[15px] font-semibold text-slate-900 mb-4">Banking details</h3>
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-[14px]">
            <dt className="text-slate-500">Account name</dt><dd className="text-slate-900 font-medium">MA Bernard</dd>
            <dt className="text-slate-500">Account number</dt><dd className="text-slate-900 font-medium">10012930071</dd>
            <dt className="text-slate-500">Branch code</dt><dd className="text-slate-900 font-medium">580105</dd>
            <dt className="text-slate-500">Bank</dt><dd className="text-slate-900 font-medium">Investec</dd>
          </dl>
        </div>

        {/* WhatsApp */}
        <a
          href={waLink("chosen")}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2.5 rounded-2xl py-4 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold text-[15px] transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
          WhatsApp your proof of payment
        </a>
        <p className="text-center text-[13px] text-slate-500 mt-3">079 905 0642</p>
      </div>
    </div>
  );
}
