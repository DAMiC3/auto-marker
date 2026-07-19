// Client- and server-safe Refund Policy content. No server imports.
// Rendered by the public /refunds page via the shared PolicyBody component.
import { CURRENT_TERMS_VERSION, TERMS_CONTACT_EMAIL, TERMS_EFFECTIVE_DATE, TERMS_ENTITY } from "@/lib/terms";
import type { PolicySection } from "@/components/PolicyBody";

// Derived from the single acceptance version so all three agreements move together.
export const REFUNDS_VERSION = CURRENT_TERMS_VERSION;
export const REFUNDS_EFFECTIVE_DATE = TERMS_EFFECTIVE_DATE;

export const REFUNDS_SECTIONS: PolicySection[] = [
  {
    heading: "1. Overview",
    body: [
      `This Refund Policy applies to subscriptions to AutoMark, operated by ${TERMS_ENTITY}. AutoMark is a monthly subscription service billed in advance through our payment provider, PayFast.`,
    ],
  },
  {
    heading: "2. Try before you buy",
    body: [
      `Where a free trial is offered, it is your opportunity to evaluate AutoMark at no cost before subscribing. We encourage you to use the trial to confirm the service meets your needs.`,
    ],
  },
  {
    heading: "3. No refunds for partial periods",
    body: [
      `Except where the Consumer Protection Act 68 of 2008 or other applicable law requires otherwise, subscription fees already paid are non-refundable. We do not provide pro-rata refunds for partial months or for allowance you did not use.`,
    ],
  },
  {
    heading: "4. Cancelling your subscription",
    body: [
      `You can cancel at any time through the payment provider. Cancellation stops future renewals; your plan stays active until the end of the billing period you have already paid for, and is not renewed after that. You keep access for the period you paid for.`,
    ],
  },
  {
    heading: "5. Billing errors and duplicate charges",
    body: [
      `If you believe you were charged in error, charged twice, or charged after cancelling, contact us at ${TERMS_CONTACT_EMAIL}. We will investigate in good faith and refund any charge that was genuinely made in error.`,
    ],
  },
  {
    heading: "6. Service problems",
    body: [
      `If the service is materially unavailable for an extended period due to a fault on our side, contact us and we will consider a fair remedy, which may include a credit or refund. This does not cover downtime caused by third-party providers, your internet connection, or scheduled maintenance.`,
    ],
  },
  {
    heading: "7. Your consumer rights",
    body: [
      `Nothing in this policy limits any rights you may have under the Consumer Protection Act or other applicable South African law.`,
    ],
  },
  {
    heading: "8. How to request a refund",
    body: [
      `Email ${TERMS_CONTACT_EMAIL} with your account email and the details of the charge. Please contact us before raising a dispute or chargeback with your bank so we can resolve it directly and quickly.`,
    ],
  },
];
