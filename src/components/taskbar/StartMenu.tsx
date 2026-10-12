import Folder16 from "@carbon/icons/es/folder/16.js";
import Power16 from "@carbon/icons/es/power/16.js";
import Search16 from "@carbon/icons/es/search/16.js";
import Settings16 from "@carbon/icons/es/settings/16.js";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import fallbackProfilePicture from "../../data/default-user-pictures/fallback-picture.png";
import FileManager from "../../programs/file-manager/FileManager";
import Kodekai from "../../programs/kodekai/Kodekai";
import { createMockModel } from "../../programs/kodekai/model/fixture";
import Button from "../button/Button";
import { useLayerItem } from "../layer-manager/LayerContext";
import { ProfilePictureMissingError } from "../session/errors";
import { sessions } from "../session/SessionClient";
import { useSession } from "../session/SessionContext";
import TextInput from "../text-input/TextInput";
import { useWindowManager } from "../window-manager/WindowManagerContext";
import CarbonIcon from "./CarbonIcon";

const applications = [
  {
    name: "Files",
    description: "Browse your files",
    icon: Folder16,
    launch: (windowManager: ReturnType<typeof useWindowManager>) =>
      windowManager.createWindow({
        title: "Files",
        size: { width: 800, height: 500 },
        minimumSize: { width: 500, height: 300 },
        content: () => <FileManager />,
      }),
  },
  {
    name: "Kodekai",
    description: "Organize projects and tasks",
    icon: Settings16,
    launch: (windowManager: ReturnType<typeof useWindowManager>) =>
      windowManager.createWindow({
        title: "Kodekai",
        size: { width: 960, height: 600 },
        minimumSize: { width: 640, height: 400 },
        content: () => <Kodekai model={createMockModel()} />,
      }),
  },
  {
    name: "Settings",
    description: "Configure CloudReady",
    icon: Settings16,
  },
] as const;

interface StartMenuProps {
  onClose: () => void;
}

export default function StartMenu(props: StartMenuProps) {
  const layerItem = useLayerItem("shell");
  const session = useSession();
  const windowManager = useWindowManager();
  const [query, setQuery] = createSignal("");
  const [profilePictureUrl, setProfilePictureUrl] = createSignal(fallbackProfilePicture);
  let searchInput: HTMLTextAreaElement | undefined;

  onMount(() => {
    let objectUrl: string | undefined;
    if (session.user().profilePicture) {
      void sessions
        .profilePicture()
        .then((picture) => {
          objectUrl = URL.createObjectURL(
            new Blob([picture], { type: session.user().profilePicture?.mimeType }),
          );
          setProfilePictureUrl(objectUrl);
        })
        .catch((error: unknown) => {
          if (error instanceof ProfilePictureMissingError)
            setProfilePictureUrl(fallbackProfilePicture);
        });
    }

    onCleanup(() => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
  });

  const matchingApplications = () => {
    const normalizedQuery = query().trim().toLowerCase();

    return normalizedQuery
      ? applications.filter((application) =>
          application.name.toLowerCase().includes(normalizedQuery),
        )
      : applications;
  };

  const handleApplicationClick = (application: (typeof applications)[number]) => {
    if ("launch" in application) application.launch(windowManager);
    props.onClose();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") props.onClose();
  };

  onMount(() => searchInput?.focus());

  return (
    <section
      id="start-menu"
      x-role="start menu"
      class="absolute bottom-13 left-1 w-2xl overflow-hidden rounded-xs border border-neutral-200 bg-white text-neutral-600 shadow-2xl"
      style={{ "z-index": layerItem.zIndex() }}
      onKeyDown={handleKeyDown}
    >
      <header class="flex w-full items-center gap-1 border-b border-neutral-200 p-4">
        <div class="flex items-center gap-2">
          <img
            class="pointer-events-none size-6 shrink-0 rounded-full bg-white object-cover"
            src={profilePictureUrl()}
          />
          <span>{session.user().displayName}</span>
        </div>
        <label x-role="launcher search" class="relative ml-4 h-7 w-full">
          <TextInput
            ref={searchInput}
            value={query()}
            onValueChange={setQuery}
            class="w-full"
            placeholder="Search..."
          />
          <CarbonIcon icon={Search16} class="absolute top-1.5 right-1.5" />
        </label>
        <Button startIcon={<CarbonIcon icon={Power16} class="ml-auto" />} />
      </header>
      <Show
        when={matchingApplications().length > 0}
        fallback={
          <p class="flex h-65 items-center justify-center text-center text-neutral-500">
            No matching apps
          </p>
        }
      >
        <div x-role="application grid" class="grid grid-cols-5 grid-rows-3 gap-1 p-1">
          <For each={matchingApplications()}>
            {(application) => (
              <button
                x-role="launcher application"
                class="flex w-32 cursor-pointer flex-col items-center gap-2 rounded-sm p-6 text-left leading-3 outline-sky-200 transition-colors hover:bg-neutral-100 focus:outline-2 focus:outline-offset-2"
                type="button"
                onClick={handleApplicationClick.bind(null, application)}
              >
                <span class="grid size-12 shrink-0 place-items-center rounded-xs bg-white shadow-sm">
                  <CarbonIcon icon={application.icon} />
                </span>
                <span title={application.description}>{application.name}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
