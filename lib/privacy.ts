// Client- and server-safe Privacy Policy content. No server imports.
// Rendered by the public /privacy page via the shared PolicyBody component.
import { TERMS_CONTACT_EMAIL, TERMS_ENTITY } from "@/lib/terms";
import type { PolicySection } from "@/components/PolicyBody";

export const PRIVACY_VERSION = "2026-07-19";
export const PRIVACY_EFFECTIVE_DATE = "19 July 2026";

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    heading: "1. Who we are",
    body: [
      `This Privacy Policy explains how ${TERMS_ENTITY} ("AutoMark", "we", "us") collects, uses, and protects personal information when you use the AutoMark service. We are the responsible party for the personal information described here under the Protection of Personal Information Act 4 of 2013 ("POPIA").`,
      `Our Information Officer can be contacted at ${TERMS_CONTACT_EMAIL} for any privacy question or request.`,
    ],
  },
  {
    heading: "2. Information we collect",
    body: [
      `Account information: your name, email address, and a password (stored only as a secure hash by our authentication provider — we never see it in plain text).`,
      `Subscription and billing information: your plan, your usage against your monthly allowance, and confirmation of payments. Payments are handled by PayFast — we receive confirmation and a payment reference, but we do NOT collect or store your card or banking details.`,
      `Documents you upload: student answer papers and memoranda you submit for marking. These are processed to produce marks and feedback (see section 4).`,
      `Technical information: basic server logs, and cookies/local storage needed to keep you signed in and remember your app settings.`,
    ],
  },
  {
    heading: "3. How we use your information",
    body: [
      `We use your information to: provide and operate the marking service; authenticate you and keep your account secure; apply your plan and measure usage; process subscriptions and confirm payments; provide support; maintain, protect, and improve the service; and comply with our legal obligations.`,
      `We do not sell your personal information, and we do not use it for advertising.`,
    ],
  },
  {
    heading: "4. Student documents — how they are handled",
    body: [
      `Student answer PDFs are processed in your browser. Only the extracted text (and, for scanned pages, page images) is transmitted to our AI provider, Anthropic, to perform the marking. The marked PDF is produced on your device and saved by you.`,
      `We do NOT store the student answer documents or their content on our servers. We retain only usage metadata (for example, how many papers were marked and the cost), not the answers themselves.`,
      `Where student personal information is involved, you are the responsible party for that information. You confirm that you have a lawful basis under POPIA to process it and to use AutoMark, including any cross-border processing described below.`,
    ],
  },
  {
    heading: "5. Who we share information with (operators)",
    body: [
      `We use trusted service providers ("operators") who process information on our behalf, only as needed to run the service: Anthropic (AI marking), Supabase (authentication and database), Cloudflare (hosting), and PayFast (payments). Each is bound to use the information only to provide their service to us.`,
      `We may also disclose information if required by law, or to protect our rights, users, or the security of the service.`,
    ],
  },
  {
    heading: "6. Cross-border transfers",
    body: [
      `To perform marking, extracted answer text and page images are sent to Anthropic, which may process them outside South Africa (including in the United States). Anthropic does not use data submitted through its API to train its models. This transfer is necessary to provide the service you have requested.`,
    ],
  },
  {
    heading: "7. How long we keep information",
    body: [
      `We keep account information for as long as your account is active. We keep subscription, payment, and usage records for as long as needed for the service and to meet legal, tax, and accounting requirements. As noted above, we do not retain the content of student answer documents.`,
    ],
  },
  {
    heading: "8. How we protect information",
    body: [
      `We use encryption in transit (HTTPS), hashed passwords, database access controls (row-level security), and separation of privileged operations. No method of transmission or storage is completely secure, but we take reasonable steps to protect your information and to limit access to it.`,
    ],
  },
  {
    heading: "9. Your rights",
    body: [
      `Under POPIA you have the right to access the personal information we hold about you, to ask us to correct or delete it, to object to certain processing, and to withdraw consent where processing is based on consent. To exercise any of these, contact ${TERMS_CONTACT_EMAIL}.`,
      `You also have the right to lodge a complaint with the Information Regulator (South Africa) — see inforegulator.org.za.`,
    ],
  },
  {
    heading: "10. Cookies",
    body: [
      `We use only essential cookies and local storage: to keep you signed in (session) and to remember your app preferences. We do not use advertising or third-party tracking cookies.`,
    ],
  },
  {
    heading: "11. Children",
    body: [
      `AutoMark is intended for educators and other professional users, not for children. Where an educator uses AutoMark to mark work belonging to student minors, that educator (or their institution) is responsible for the lawful handling of those students' information.`,
    ],
  },
  {
    heading: "12. Changes to this policy",
    body: [
      `We may update this Privacy Policy from time to time. We will change the effective date above and, where the change is material, bring it to your attention.`,
    ],
  },
  {
    heading: "13. Contact us",
    body: [
      `For any privacy question or to exercise your rights, contact our Information Officer at ${TERMS_CONTACT_EMAIL}.`,
    ],
  },
];
