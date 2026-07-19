import PolicyBody from "@/components/PolicyBody";
import { TERMS_EFFECTIVE_DATE, TERMS_ENTITY, TERMS_SECTIONS } from "@/lib/terms";

// Thin wrapper so the /terms page and the acceptance pop-up render the Terms from
// the single source in lib/terms.ts via the shared PolicyBody renderer.
export default function TermsBody() {
  return <PolicyBody entity={TERMS_ENTITY} effectiveDate={TERMS_EFFECTIVE_DATE} sections={TERMS_SECTIONS} />;
}
