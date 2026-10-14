import { LegalPage } from "@/components/ui/LegalPage";
import { PRIVACY_LAST_UPDATED, PRIVACY_TEXT } from "@/content/legal/privacy";

// The text is pasted into src/content/legal/privacy.ts.
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      text={PRIVACY_TEXT}
      lastUpdated={PRIVACY_LAST_UPDATED}
      placeholderMessage="Our Privacy Policy is being finalized — check back soon. This page is not yet real legal content."
    />
  );
}
