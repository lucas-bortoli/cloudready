import { createSignal, For } from "solid-js";
import DEFAULT_PICTURES, {
  type DefaultPictureKey,
} from "../../../data/default-user-pictures/pictures";
import TextInput from "../../text-input/TextInput";
import { sessions, type UserProfile } from "../SessionClient";

export default function ProfileCreationStep(props: {
  onCreated: (user: UserProfile) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const pictures = Object.keys(DEFAULT_PICTURES) as DefaultPictureKey[];
  const [name, setName] = createSignal("");
  const [selectedPicture, setSelectedPicture] = createSignal<DefaultPictureKey>("cone");
  const [error, setError] = createSignal<string>();

  const handlePictureKeyDown = (picture: DefaultPictureKey, event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedPicture(picture);
    }
  };

  const handlePictureClick = (picture: DefaultPictureKey) => setSelectedPicture(picture);

  const createProfile = async (event: SubmitEvent) => {
    event.preventDefault();
    props.onSavingChange(true);
    setError();
    try {
      // Resolve the bundled image before setup commits, so a missing asset cannot strand OOBE.
      const pictureResponse = await fetch(DEFAULT_PICTURES[selectedPicture()]);
      if (!pictureResponse.ok) throw new Error("Could not load the selected profile picture.");
      const picture = await pictureResponse.blob();

      await new Promise((r) => setTimeout(r, 1000));

      // Creating the first profile also starts its browser session on the kernel.
      const user = await sessions.createFirstProfile(name());
      const profilePicture = await sessions.setProfilePicture(picture);
      props.onCreated({ ...user, profilePicture });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create profile.");
    } finally {
      props.onSavingChange(false);
    }
  };

  return (
    <form
      id="create-profile-form"
      class="mt-12 flex w-full flex-col items-center"
      onSubmit={createProfile}
    >
      <label class="flex w-full max-w-72 flex-col text-left text-neutral-800">
        Profile picture
      </label>
      <ul
        class="mt-2 flex gap-4 transition-transform duration-500 ease-in-out"
        style={{
          transform: `translateX(${(Math.floor(pictures.length / 2) - pictures.indexOf(selectedPicture())) * 96}px)`,
        }}
      >
        <For each={pictures}>
          {(picture) => (
            <li
              class="inline-block size-20 cursor-pointer rounded-full bg-cover bg-center shadow-md outline-2 outline-transparent transition-[filter] duration-300 ease-in-out not-data-selected:filter-[brightness(90%)_contrast(90%)] hover:filter-none focus:outline-sky-200 data-selected:outline-6 data-selected:outline-sky-200 data-selected:filter-none"
              style={{ "background-image": `url(${DEFAULT_PICTURES[picture]})` }}
              data-selected={selectedPicture() === picture ? true : undefined}
              onClick={handlePictureClick.bind(null, picture)}
              onKeyDown={handlePictureKeyDown.bind(null, picture)}
              tabIndex={0}
            />
          )}
        </For>
      </ul>
      <label class="mt-8 flex w-full max-w-72 flex-col text-left text-neutral-800">
        Display name
        <TextInput
          x-role="profile display name"
          class="mt-1 w-full"
          value={name()}
          onValueChange={setName}
        />
      </label>
      {error() && <p class="mt-3 text-red-700">{error()}</p>}
    </form>
  );
}
