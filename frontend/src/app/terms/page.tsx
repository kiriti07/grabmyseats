import { LegalPage } from "@/components/ui/LegalPage";
import { TERMS_LAST_UPDATED, TERMS_TEXT } from "@/content/legal/terms";

// The text is pasted into src/content/legal/terms.ts.
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      text={TERMS_TEXT}
      lastUpdated={TERMS_LAST_UPDATED}
      placeholderMessage="Our Terms & Conditions are being finalized — check back soon. This page is not yet real legal content."
    />
  );
}
