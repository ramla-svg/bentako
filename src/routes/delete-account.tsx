import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

import { LEGAL_CONTACT_EMAIL, LegalPage, Section } from "@/components/legal-page";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "Delete your BentaKo account and data" },
      {
        name: "description",
        content:
          "How to delete your BentaKo account and store records: from Settings inside the app, or by email request. What is deleted and how long it takes.",
      },
      { property: "og:title", content: "Delete your BentaKo account and data" },
      {
        property: "og:description",
        content: "Delete your account from Settings in the app, or ask us by email.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bentako.lovable.app/delete-account" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://bentako.lovable.app/delete-account" }],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your account and data"
      intro="You can remove your BentaKo account and everything in it whenever you want. Nothing is kept as a hostage."
    >
      <Section heading="Delete it inside the app">
        <ol className="ml-4 list-decimal space-y-1">
          <li>Open BentaKo and sign in.</li>
          <li>
            Go to <strong>Settings</strong> (tap your initials at the top right of the dashboard).
          </li>
          <li>
            Scroll to <strong>Delete my account</strong>.
          </li>
          <li>
            Type <strong>DELETE</strong> to confirm and tap the delete button.
          </li>
        </ol>
        <p>
          You can also open{" "}
          <Link to="/settings" className="text-primary underline">
            Settings
          </Link>{" "}
          directly if you are already signed in.
        </p>
      </Section>

      <Section heading="Ask us instead">
        <p>
          Email {LEGAL_CONTACT_EMAIL} from the address you signed in with, with the subject “Delete
          my BentaKo account”. We complete it within 7 days and reply when it is done.
        </p>
      </Section>

      <Section heading="What is deleted">
        <ul className="ml-4 list-disc space-y-1">
          <li>Your sign-in and profile (email, name).</li>
          <li>
            If you are the store owner: the store itself and all its sales, receipts, products,
            stock movements, cash entries, utang customers, expenses, phone records and staff
            sign-ins.
          </li>
          <li>Your store logo and any GCash payment screenshots you sent.</li>
          <li>Everything saved on the phone is cleared when you uninstall or clear the app data.</li>
        </ul>
        <p>
          Deletion is immediate and cannot be undone. Backup copies are cleared within 30 days.
          Records of payments we received are kept for up to 5 years for accounting, as explained in
          the{" "}
          <Link to="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section heading="Before you delete">
        <p>
          If you only want a copy of your figures, open Reports and export to a spreadsheet first —
          once the account is deleted we cannot bring the records back.
        </p>
      </Section>
    </LegalPage>
  );
}
