import { createSignal } from "solid-js";
import Button from "../components/button/Button";
import TextInput from "../components/text-input/TextInput";
import { sessions, type UserProfile } from "./SessionClient";

export default function Oobe(props: { onCreated: (user: UserProfile) => void }) {
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [saving, setSaving] = createSignal(false);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setSaving(true);
    setError();
    try {
      // Creating the first profile also starts its browser session on the kernel.
      props.onCreated(await sessions.createFirstProfile(name()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create profile.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <main x-role="profile setup" class="grid h-full place-items-center bg-neutral-100 p-6">
      <form
        class="w-full max-w-sm rounded-xl border border-neutral-300 bg-white p-6 shadow-xl"
        onSubmit={submit}
      >
        <h1 class="text-xl font-semibold text-neutral-900">Welcome to CloudReady</h1>
        <p class="mt-2 text-neutral-600">Create the first local profile to begin.</p>
        <label class="mt-5 block text-neutral-800">
          Display name
          <TextInput
            x-role="profile display name"
            class="mt-1 w-full"
            value={name()}
            onValueChange={setName}
          />
        </label>
        {error() && <p class="mt-3 text-red-700">{error()}</p>}
        <Button
          x-role="create profile"
          class="mt-5 w-full"
          loading={saving()}
          type="submit"
          variant="primary"
        >
          Continue
        </Button>
      </form>
    </main>
  );
}
