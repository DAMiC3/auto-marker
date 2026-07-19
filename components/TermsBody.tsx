import { TERMS_EFFECTIVE_DATE, TERMS_ENTITY, TERMS_SECTIONS } from "@/lib/terms";

// Renders the Terms & Conditions body from the single source in lib/terms.ts, so
// the /terms page and the acceptance pop-up can never drift apart. Colours are
// inherited from the parent so it reads correctly on both the light /terms page
// and the modal.
export default function TermsBody() {
  return (
    <div className="text-[13.5px] leading-relaxed">
      <p className="mb-1 font-semibold">{TERMS_ENTITY}</p>
      <p className="mb-6 opacity-70">Effective date: {TERMS_EFFECTIVE_DATE}</p>
      {TERMS_SECTIONS.map((s) => (
        <section key={s.heading} className="mb-5">
          <h3 className="font-semibold mb-1.5">{s.heading}</h3>
          {s.body.map((p, i) => (
            <p key={i} className="mb-2 opacity-90">
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
