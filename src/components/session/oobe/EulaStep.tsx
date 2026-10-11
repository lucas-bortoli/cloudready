import { createEffect, createResource } from "solid-js";
import LegalConsent from "./LegalConsent";

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
  const [eula] = createResource(loadEula);

  createEffect(() => props.onReadyChange(eula() !== undefined));

  return (
    <LegalConsent
      accepted={props.accepted}
      document={eula()}
      error={eula.error}
      name="EULA"
      onAcceptedChange={props.onAcceptedChange}
    />
  );
}
