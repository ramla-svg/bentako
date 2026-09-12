import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

import { LEGAL_CONTACT_EMAIL, LegalPage, Section } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — BentaKo" },
      {
        name: "description",
        content:
          "What BentaKo collects, what stays on your phone, how backups and GCash payment proofs are handled, and how to delete your data.",
      },
      { property: "og:title", content: "Privacy Policy — BentaKo" },
      {
        property: "og:description",
        content: "No ads, no selling of data. Here is exactly what BentaKo stores and why.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bentako.lovable.app/privacy" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://bentako.lovable.app/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="BentaKo is built for small stores. We keep as little as possible, we never sell your data, and we show no ads."
    >
      <Section heading="Who we are">
        <p>
          BentaKo is a point-of-sale app for sari-sari stores in the Philippines. For any privacy
          question or request, write to {LEGAL_CONTACT_EMAIL}.
        </p>
      </Section>

      <Section heading="What we collect">
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Account details</strong> — your email address and name. If you sign in with
            Google we receive your email, name and profile picture link from Google. We never see
            your Google password.
          </li>
          <li>
            <strong>Store records</strong> — store name, owner name, products, prices, stock, sales,
            receipts, cash entries, utang (credit) customers with the name and mobile number you type
            in, and expenses.
          </li>
          <li>
            <strong>Device record</strong> — a random device code, a device label and the last time it
            was used, so we can apply the phone limits of your plan.
          </li>
          <li>
            <strong>Payment records</strong> — if you upgrade to Pro: the amount, the plan period, the
            GCash reference number you type, and the payment screenshot if you attach one. We do not
            see or store your GCash login, card or bank details.
          </li>
        </ul>
      </Section>

      <Section heading="What stays on your phone only">
        <p>
          Activity history (the log of actions inside the app) and receipt or transaction photos are
          kept on your phone and are never uploaded. On the free plan <em>everything</em> stays on the
          phone — no store records leave the device at all.
        </p>
      </Section>

      <Section heading="What we upload, and why">
        <p>
          With BentaKo Pro, your store records are copied to our secure cloud backup so you can
          restore them on a new phone and use more than one phone. Payment records are uploaded so we
          can confirm your Pro payment. That is all.
        </p>
      </Section>

      <Section heading="Who can see it">
        <p>
          Only you and the people you invite to your store can see your store records. Our database
          rules limit every request to your own store. BentaKo staff can see payment records (amount,
          reference number, screenshot) to confirm upgrades. Our hosting and database provider stores
          the data on our behalf. We do not sell or share your data with advertisers or data brokers.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <p>
          Store records are kept while your account exists. Payment records are kept for up to 5
          years for accounting. When you delete your account, store records are deleted immediately
          and backup copies are cleared within 30 days.
        </p>
      </Section>

      <Section heading="Your choices">
        <p>
          You can view and correct your details in the app, ask us for a copy of your data, or delete
          your account and all its records at any time — see{" "}
          <Link to="/delete-account" className="text-primary underline">
            Delete my account
          </Link>
          . Under the Philippine Data Privacy Act you may also complain to the National Privacy
          Commission.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Data travels over encrypted connections and is stored with access rules per store. Payment
          screenshots and store logos are kept in private storage that is not publicly reachable. No
          system is perfect, so please keep your sign-in and your phone secure.
        </p>
      </Section>

      <Section heading="Children">
        <p>BentaKo is for store owners and their staff and is not intended for children under 13.</p>
      </Section>

      <Section heading="Changes">
        <p>
          If this policy changes we will update this page and the date above. Questions:{" "}
          {LEGAL_CONTACT_EMAIL}.
        </p>
      </Section>
    </LegalPage>
  );
}
