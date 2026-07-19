// Client- and server-safe Terms & Conditions content + version.
// NO server imports here — the /terms page, the signup form, and the acceptance
// gate all import from this file.
//
// HOW RE-PROMPTING WORKS: a user is considered to have accepted when their
// profiles.terms_version equals CURRENT_TERMS_VERSION. To force everyone to
// re-accept after a material change, bump CURRENT_TERMS_VERSION (and the date) —
// every existing user then sees the acceptance pop-up again on their next visit.

export const CURRENT_TERMS_VERSION = "2026-07-19";
export const TERMS_EFFECTIVE_DATE = "19 July 2026";

// The trading entity these terms are made with. Update if you register a company.
export const TERMS_ENTITY = "MA Bernard trading as AutoMark";
export const TERMS_CONTACT_EMAIL = "bernardmanne3@gmail.com";

export interface TermsSection {
  heading: string;
  body: string[]; // each string is a paragraph
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: "1. About these terms",
    body: [
      `These Terms and Conditions ("Terms") are a legal agreement between you and ${TERMS_ENTITY} ("AutoMark", "we", "us", "our"). They govern your access to and use of the AutoMark web application and related services (the "Service").`,
      `By creating an account, ticking the acceptance box, or using the Service, you confirm that you have read, understood, and agree to be bound by these Terms. If you do not agree, you may not use the Service.`,
      `These Terms are governed by the laws of the Republic of South Africa, including the Consumer Protection Act 68 of 2008 (the "CPA"), the Electronic Communications and Transactions Act 25 of 2002 ("ECTA"), and the Protection of Personal Information Act 4 of 2013 ("POPIA"), to the extent they apply.`,
    ],
  },
  {
    heading: "2. What AutoMark does",
    body: [
      `AutoMark is an AI-assisted marking tool for typed university test and exam papers. You upload students' answer documents together with a memorandum (answer key); AutoMark uses artificial intelligence to compare each answer to your memorandum, award marks, and stamp ticks, scores, and optional comments onto a copy of each paper.`,
      `AutoMark is a tool that assists a qualified marker. It does not replace the professional judgment of the educator using it.`,
    ],
  },
  {
    heading: "3. Eligibility and your account",
    body: [
      `You must be at least 18 years old and use the Service in a professional educational capacity (for example, as a lecturer, tutor, teacher, or marker). You must have the right and any necessary permission to upload the student answers and memoranda you submit.`,
      `You are responsible for keeping your login details secure and for all activity that occurs under your account. Tell us promptly if you suspect any unauthorised use. Do not share your account with others.`,
      `You must provide accurate information when registering and keep it up to date.`,
    ],
  },
  {
    heading: "4. AI marking — accuracy and your responsibility",
    body: [
      `IMPORTANT: AutoMark uses artificial intelligence, which can make mistakes. Marks, comments, and totals produced by the Service may be incorrect, incomplete, or inconsistent. AutoMark does not guarantee the accuracy, reliability, or suitability of any marking output.`,
      `You are solely responsible for reviewing and verifying every marked paper before returning any result, grade, or feedback to a student or recording it as final. AutoMark is an aid to marking, not a substitute for your own checking and professional judgment.`,
      `To the extent permitted by law, we are not liable for any marking errors, incorrect grades, student disputes, appeals, re-marks, or academic or other consequences arising from your reliance on the Service's output. The final marks you issue remain your decision and your responsibility.`,
    ],
  },
  {
    heading: "5. Plans, billing and renewals",
    body: [
      `The Service is offered on paid monthly subscription plans (currently "Standard" and "Pro"), and may include a free trial. Each plan includes a monthly usage allowance; once your allowance for a billing period is used up, marking is paused until your plan renews or you upgrade.`,
      `Paid subscriptions are billed in advance through our third-party payment provider, PayFast, and renew automatically each month until cancelled. By subscribing, you authorise the recurring charge for your chosen plan until you cancel.`,
      `We may change plan prices or features. We will give you reasonable advance notice of any price increase, and it will take effect from your next billing period. Continuing to use the Service after a change takes effect means you accept it.`,
      `Allowances are shown to you as a percentage of your monthly limit. We do not display remaining amounts in rand or in AI usage units.`,
    ],
  },
  {
    heading: "6. Cancellation and refunds",
    body: [
      `You may cancel your subscription at any time through the payment provider. Cancellation stops future renewals; your plan remains active until the end of the billing period you have already paid for, after which access ends.`,
      `Except where the CPA or other applicable law requires otherwise, fees already paid are non-refundable and we do not provide pro-rata refunds for partial billing periods or unused allowance.`,
      `If you believe you have been charged in error, contact us and we will investigate in good faith.`,
    ],
  },
  {
    heading: "7. Acceptable use",
    body: [
      `You agree not to: (a) upload content you do not have the right to process; (b) use the Service for anything unlawful, or to infringe anyone's rights; (c) attempt to disrupt, overload, reverse-engineer, or gain unauthorised access to the Service or its systems; (d) resell, sublicense, or provide the Service to third parties as your own; or (e) attempt to circumvent usage allowances, security, or payment controls.`,
      `We may investigate and take appropriate action, including suspending or terminating accounts, for any suspected breach of this section.`,
    ],
  },
  {
    heading: "8. Your content and data protection (POPIA)",
    body: [
      `You keep ownership of the documents you upload ("Your Content"). You grant us a limited licence to process Your Content solely to provide the Service to you.`,
      `Student answer PDFs are processed in your browser; the extracted text (and, for scanned pages, page images) is sent to our AI provider, Anthropic, whose processing may occur outside South Africa (including in the United States), in order to perform the marking. Anthropic does not use data submitted through its API to train its models.`,
      `Where the personal information of students is involved, you act as the responsible party for that information and you confirm that you have a lawful basis under POPIA to process it and to use a service like AutoMark, including any required cross-border transfer. Our handling of personal information is described in our Privacy Policy.`,
    ],
  },
  {
    heading: "9. Intellectual property",
    body: [
      `The Service, including its software, design, and branding, is owned by us and protected by law. We grant you a limited, non-exclusive, non-transferable right to use the Service in accordance with these Terms. Nothing in these Terms transfers any of our intellectual property to you.`,
    ],
  },
  {
    heading: "10. Third-party services",
    body: [
      `The Service relies on third parties including Anthropic (AI), Supabase (authentication and database), Cloudflare (hosting), and PayFast (payments). We are not responsible for the availability, acts, or omissions of these providers, and your use of the Service may also be subject to their terms.`,
    ],
  },
  {
    heading: "11. Availability and “as is”",
    body: [
      `The Service is provided on an "as is" and "as available" basis. We do not warrant that it will be uninterrupted, error-free, or available at any particular time, and we may modify, suspend, or discontinue features. We are not liable for downtime, maintenance, or failures of the internet or third-party providers.`,
    ],
  },
  {
    heading: "12. Limitation of liability",
    body: [
      `To the fullest extent permitted by law, we are not liable for any indirect, incidental, special, or consequential loss, or for loss of profits, data, goodwill, or academic outcomes, arising from your use of or inability to use the Service.`,
      `To the fullest extent permitted by law, our total liability to you for all claims arising out of or relating to the Service in any 12-month period is limited to the total fees you paid us for the Service in that period.`,
      `Nothing in these Terms excludes or limits any liability that cannot be excluded or limited under South African law, including under the CPA.`,
    ],
  },
  {
    heading: "13. Indemnity",
    body: [
      `You agree to indemnify and hold us harmless against any claims, losses, or costs (including reasonable legal fees) arising from your breach of these Terms, your misuse of the Service, or your unlawful processing of any personal information through the Service.`,
    ],
  },
  {
    heading: "14. Suspension and termination",
    body: [
      `We may suspend or terminate your access to the Service if you breach these Terms, fail to pay, or use the Service in a way that risks harm to us, other users, or third parties. You may stop using the Service and close your account at any time.`,
      `On termination, your right to use the Service ends. Sections that by their nature should survive (including intellectual property, limitation of liability, and indemnity) continue to apply.`,
    ],
  },
  {
    heading: "15. Changes to these terms",
    body: [
      `We may update these Terms from time to time. When we make a material change, we will update the version and ask you to accept the revised Terms before you continue using the Service. Your continued use after accepting means you agree to the updated Terms.`,
    ],
  },
  {
    heading: "16. Governing law and disputes",
    body: [
      `These Terms are governed by the laws of the Republic of South Africa, and you agree to the non-exclusive jurisdiction of the South African courts. We encourage you to contact us first so we can try to resolve any dispute directly.`,
    ],
  },
  {
    heading: "17. Contact us",
    body: [
      `Questions about these Terms can be sent to ${TERMS_CONTACT_EMAIL}.`,
    ],
  },
];
