import { createEffect, createResource } from "solid-js";
import LegalConsent from "./LegalConsent";

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
  const [privacyPolicy] = createResource(loadPrivacyPolicy);

  createEffect(() => props.onReadyChange(privacyPolicy() !== undefined));

  return (
    <LegalConsent
      accepted={props.accepted}
      document={privacyPolicy()}
      error={privacyPolicy.error}
      name="privacy policy"
      onAcceptedChange={props.onAcceptedChange}
    />
  );
}
