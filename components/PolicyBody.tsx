// Generic renderer for a legal document (Terms, Privacy, Refunds) from a shared
// section structure, so every policy reads consistently and can't drift in layout.
// Colours are inherited from the parent so it works on a light page or in a modal.

export interface PolicySection {
  heading: string;
  body: string[]; // each string is a paragraph
}

export default function PolicyBody({
  entity,
  effectiveDate,
  sections,
}: {
  entity: string;
  effectiveDate: string;
  sections: PolicySection[];
}) {
  return (
    <div className="text-[13.5px] leading-relaxed">
      <p className="mb-1 font-semibold">{entity}</p>
      <p className="mb-6 opacity-70">Effective date: {effectiveDate}</p>
      {sections.map((s) => (
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
