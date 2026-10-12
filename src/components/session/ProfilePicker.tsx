import { createSignal, For, onMount } from "solid-js";
import { sessions, type UserProfile } from "./SessionClient";
export default function ProfilePicker(props: { onSelected: (user: UserProfile) => void }) {
  const [profiles, setProfiles] = createSignal<readonly UserProfile[]>([]);
  const [error, setError] = createSignal<string>();

  onMount(async () => {
    try {
      setProfiles(await sessions.profiles());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load profiles.");
    }
  });
  const choose = async (profile: UserProfile) => {
    try {
      // Profile selection receives a new browser session rather than reusing another profile's.
      props.onSelected(await sessions.start(profile.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start profile.");
    }
  };
  const handleProfileClick = (profile: UserProfile) => void choose(profile);
  return (
    <main x-role="profile picker" class="grid h-full place-items-center bg-neutral-100 p-6">
      <section class="w-full max-w-sm rounded-xl border border-neutral-300 bg-white p-6 shadow-xl">
        <h1 class="text-xl font-semibold text-neutral-900">Choose a profile</h1>
        <div class="mt-4 grid gap-2">
          <For each={profiles()}>
            {(profile) => (
              <button
                x-role="profile choice"
                class="rounded-lg border border-neutral-300 p-3 text-left text-neutral-800 hover:bg-blue-50"
                type="button"
                onClick={handleProfileClick.bind(null, profile)}
              >
                {profile.displayName}
              </button>
            )}
          </For>
        </div>
        {error() && <p class="mt-3 text-red-700">{error()}</p>}
      </section>
    </main>
  );
}
