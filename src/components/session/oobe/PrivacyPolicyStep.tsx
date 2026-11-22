import LegalConsent from "./LegalConsent";
import { useLegalDocument } from "./useLegalDocument";

async function loadPrivacyPolicy(): Promise<string> {
  const response = await fetch("/privacy-policy.txt");
  if (!response.ok) throw new Error("Could not load the privacy policy.");
  return response.text();
}

export default function PrivacyPolicyStep(props: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  onReadyChange: (ready: boolean) => void;
}) {
  const privacyPolicy = useLegalDocument(loadPrivacyPolicy, (ready) => props.onReadyChange(ready));

  return (
    <LegalConsent
      accepted={props.accepted}
      document={privacyPolicy.document()}
      error={privacyPolicy.error()}
      name="privacy policy"
      onAcceptedChange={props.onAcceptedChange}
    />
  );
}
