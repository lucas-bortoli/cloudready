import { createSignal, For, onCleanup, onSettled } from "solid-js";
import fallbackProfilePicture from "../../data/default-user-pictures/fallback-picture.png";
import { sessions, type UserProfile } from "./SessionClient";

export interface ProfilePickerProps {
  onSelected: (user: UserProfile) => void;
}

export default function ProfilePicker(props: ProfilePickerProps) {
  const [profiles, setProfiles] = createSignal<readonly UserProfile[]>([]);
  const [error, setError] = createSignal<string>();
  let disposed = false;

  const loadProfiles = async () => {
    try {
      const profiles = await sessions.profiles();
      if (!disposed) setProfiles(profiles);
    } catch (reason) {
      if (!disposed)
        setError(reason instanceof Error ? reason.message : "Could not load profiles.");
    }
  };

  onSettled(() => {
    void loadProfiles();
  });
  onCleanup(() => {
    disposed = true;
  });

  const profileImage = (profile: UserProfile) => {
    if (profile.profilePicture) return `/api/profile-picture/${profile.id}`;
    return fallbackProfilePicture;
  };

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
    <main
      x-role="profile picker"
      class="relative flex h-full flex-col items-center justify-center bg-neutral-800 p-6 text-neutral-100"
    >
      <h1>Choose a Profile</h1>
      <section class="mt-4 flex">
        <For each={profiles()}>
          {(profile) => (
            <button
              x-role="profile choice"
              class="group flex w-40 cursor-pointer flex-col items-center gap-4 rounded-lg p-8 outline-sky-300 transition-colors hover:bg-neutral-600 focus:outline-2 focus:outline-offset-2 active:bg-neutral-700"
              type="button"
              onClick={handleProfileClick.bind(null, profile)}
            >
              <div
                class="inline-block size-20 rounded-full bg-cover bg-center shadow-md outline-2 outline-transparent filter-[brightness(90%)_contrast(90%)] transition-[filter] duration-300 ease-in-out group-hover:filter-none"
                style={{ "background-image": `url(${profileImage(profile)})` }}
              />
              {profile.displayName}
            </button>
          )}
        </For>
      </section>
      {error() && <p class="mt-3 text-red-700">{error()}</p>}
      <h1 class="absolute bottom-8 left-1/2 -translate-x-1/2 text-4xl">
        Cloud<span class="font-bold">Ready</span>
      </h1>
    </main>
  );
}
