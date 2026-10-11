import { createSignal, onMount, Show } from "solid-js";
import Button from "../../components/button/Button";
import DEFAULT_PICTURES from "../../data/default-user-pictures/pictures";
import defaultWallpaper from "../../data/default-wallpaper.png";
import type { UserProfile } from "./SessionClient";
import CompletionStep from "./oobe/CompletionStep";
import EulaStep from "./oobe/EulaStep";
import PrivacyPolicyStep from "./oobe/PrivacyPolicyStep";
import ProfileCreationStep from "./oobe/ProfileCreationStep";
import WelcomeStep from "./oobe/WelcomeStep";

const STEP_TITLES = [
  "Welcome to CloudReady",
  "End User License Agreement",
  "Privacy Policy",
  "Create your profile",
  "All done!",
] as const;

export default function Oobe(props: { onCreated: (user: UserProfile) => void }) {
  const [page, setPage] = createSignal(0);
  const [eulaAccepted, setEulaAccepted] = createSignal(false);
  const [privacyPolicyAccepted, setPrivacyPolicyAccepted] = createSignal(false);
  const [eulaReady, setEulaReady] = createSignal(false);
  const [privacyPolicyReady, setPrivacyPolicyReady] = createSignal(false);
  const [createdUser, setCreatedUser] = createSignal<UserProfile>();
  const [saving, setSaving] = createSignal(false);

  onMount(() => {
    // Warm the browser cache before profile creation needs to upload the chosen bundled image.
    for (const picture of Object.values(DEFAULT_PICTURES)) {
      void fetch(picture).catch(() => undefined);
    }
  });

  const goToDesktop = () => {
    const user = createdUser();
    if (user) props.onCreated(user);
  };

  const canContinue = () =>
    page() === 0 ||
    (page() === 1 && eulaReady() && eulaAccepted()) ||
    (page() === 2 && privacyPolicyReady() && privacyPolicyAccepted());

  return (
    <main
      x-role="profile setup"
      class="grid h-full place-items-center bg-cover bg-center p-6 text-base"
      style={{ "background-image": `url(${defaultWallpaper})` }}
    >
      <section class="flex h-full max-h-144 w-full max-w-3xl flex-col overflow-hidden rounded-sm border border-neutral-300 bg-white p-12 text-center shadow-xl">
        <header class="flex w-full flex-col items-center">
          <p class="text-sm text-neutral-500">Step {page() + 1} of 5</p>
          <h1 class="mt-2 text-3xl font-thin text-neutral-900">{STEP_TITLES[page()]}</h1>
        </header>
        <div class="mt-6 flex min-h-0 flex-1 flex-col items-center">
          <Show when={page() === 0}>
            <WelcomeStep />
          </Show>
          <Show when={page() === 1}>
            <EulaStep
              accepted={eulaAccepted()}
              onAcceptedChange={setEulaAccepted}
              onReadyChange={setEulaReady}
            />
          </Show>
          <Show when={page() === 2}>
            <PrivacyPolicyStep
              accepted={privacyPolicyAccepted()}
              onAcceptedChange={setPrivacyPolicyAccepted}
              onReadyChange={setPrivacyPolicyReady}
            />
          </Show>
          <Show when={page() === 3}>
            <ProfileCreationStep
              onCreated={(user) => {
                setCreatedUser(user);
                setPage(4);
              }}
              onSavingChange={setSaving}
            />
          </Show>
          <Show when={page() === 4}>
            <CompletionStep />
          </Show>
        </div>
        <footer class="mt-8 flex w-full justify-between">
          <Show when={page() < 4}>
            <Button disabled={page() === 0 || saving()} onClick={() => setPage(page() - 1)}>
              Back
            </Button>
          </Show>
          <Show when={page() < 3}>
            <Button disabled={!canContinue()} variant="primary" onClick={() => setPage(page() + 1)}>
              Continue
            </Button>
          </Show>
          <Show when={page() === 3}>
            <Button
              x-role="create profile"
              form="create-profile-form"
              loading={saving()}
              type="submit"
              variant="primary"
            >
              Create profile
            </Button>
          </Show>
          <Show when={page() === 4}>
            <Button x-role="go to desktop" variant="primary" onClick={goToDesktop} class="ml-auto">
              Go to desktop
            </Button>
          </Show>
        </footer>
      </section>
    </main>
  );
}
