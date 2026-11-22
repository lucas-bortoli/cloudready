import LegalConsent from "./LegalConsent";
import { useLegalDocument } from "./useLegalDocument";

async function loadEula(): Promise<string> {
  const response = await fetch("/eula.txt");
  if (!response.ok) throw new Error("Could not load the EULA.");
  return response.text();
}

export default function EulaStep(props: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  onReadyChange: (ready: boolean) => void;
}) {
  const eula = useLegalDocument(loadEula, (ready) => props.onReadyChange(ready));

  return (
    <LegalConsent
      accepted={props.accepted}
      document={eula.document()}
      error={eula.error()}
      name="EULA"
      onAcceptedChange={props.onAcceptedChange}
    />
  );
}
