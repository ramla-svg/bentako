import { createFileRoute } from "@tanstack/react-router";

import { LEGAL_CONTACT_EMAIL, LegalPage, Section } from "@/components/legal-page";
import { PRO_PRICE_MONTHLY, PRO_PRICE_YEARLY } from "@/lib/plan";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — BentaKo" },
      {
        name: "description",
        content:
          "The rules for using BentaKo: what the free plan covers, how BentaKo Pro billing works, refunds, and your responsibilities as a store owner.",
      },
      { property: "og:title", content: "Terms of Service — BentaKo" },
      {
        property: "og:description",
        content: "Free plan, BentaKo Pro billing, refunds and store owner responsibilities.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bentako.lovable.app/terms" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://bentako.lovable.app/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="Please read these terms before using BentaKo. By creating a store you agree to them."
    >
      <Section heading="1. What BentaKo is">
        <p>
          BentaKo is a point-of-sale app for small neighbourhood stores in the Philippines. It
          records sales, products, stock, cash, utang (credit) and expenses. It works offline on your
          phone; with BentaKo Pro your records are also kept as a backup copy outside the phone.
        </p>
        <p>
          BentaKo is a record-keeping tool. It is not a bank, an e-wallet, a payment processor or an
          accounting or tax service. Money never passes through BentaKo.
        </p>
      </Section>

      <Section heading="2. Your account">
        <p>
          You need an email sign-in or a Google account to use BentaKo. You are responsible for
          keeping your sign-in private and for anyone you let use your store, including cashiers. You
          must be at least 18 years old, or use the app with the consent of the store owner.
        </p>
      </Section>

      <Section heading="3. Free plan">
        <p>
          The free plan costs ₱0 and stays free. It covers selling, receipts, cash and utang on one
          phone, up to 60 active products and 7 days of reports. There is no cloud backup on the free
          plan and receipts show “Powered by BentaKo”.
        </p>
      </Section>

      <Section heading="4. BentaKo Pro and billing">
        <p>
          BentaKo Pro costs ₱{PRO_PRICE_MONTHLY} per month or ₱{PRO_PRICE_YEARLY} per year. It adds
          unlimited products, up to 3 phones, 2 cashier sign-ins, cloud backup and restore, full
          report history, spreadsheet export and your own logo and message on receipts.
        </p>
        <p>
          Pro is bought on the BentaKo website (bentako.lovable.app) by sending payment to the GCash
          account shown on the upgrade screen and submitting the reference number. We confirm it
          manually, usually within the day. Nothing renews automatically and no card is stored — when
          your paid days end, the store simply returns to the free plan.
        </p>
        <p>
          The Android app does not sell anything. It only reads the plan your account already has.
        </p>
      </Section>

      <Section heading="5. Refunds">
        <p>
          If a payment is confirmed by mistake, or Pro features do not work for a reason on our side,
          write to {LEGAL_CONTACT_EMAIL} within 7 days and we will refund the affected period by
          GCash or add the days to your plan, whichever you prefer. Paid days already used are not
          refundable. Payments that cannot be matched to a GCash reference are returned to the
          sender.
        </p>
      </Section>

      <Section heading="6. Your data is yours">
        <p>
          You own your store records. You are responsible for their accuracy and for any legal
          requirement that applies to your business, such as receipts, permits and taxes. Keep your
          own copy of anything you must keep by law: on the free plan the records live only on your
          phone, and if that phone is lost, reset or its browser data cleared, the records are gone.
        </p>
      </Section>

      <Section heading="7. Fair use">
        <p>
          Do not use BentaKo for anything illegal, do not try to break into other stores’ data, and
          do not resell or copy the app. We may suspend an account that does.
        </p>
      </Section>

      <Section heading="8. No warranty and limits">
        <p>
          BentaKo is provided “as is”. We work hard to keep it correct and available, but we cannot
          promise it will never have an error or downtime. To the extent allowed by Philippine law,
          our total responsibility to you is limited to the amount you paid us in the previous 12
          months.
        </p>
      </Section>

      <Section heading="9. Ending your use">
        <p>
          You may stop at any time and delete your account and data from the app or from the delete
          account page. We may end service if these terms are broken.
        </p>
      </Section>

      <Section heading="10. Changes and contact">
        <p>
          If these terms change we will update this page and the date above, and show a notice in the
          app for important changes. Questions: {LEGAL_CONTACT_EMAIL}. These terms follow the laws of
          the Republic of the Philippines.
        </p>
      </Section>
    </LegalPage>
  );
}
