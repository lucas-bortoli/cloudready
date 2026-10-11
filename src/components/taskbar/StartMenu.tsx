import Folder16 from "@carbon/icons/es/folder/16.js";
import Globe16 from "@carbon/icons/es/globe/16.js";
import Image16 from "@carbon/icons/es/image/16.js";
import Power16 from "@carbon/icons/es/power/16.js";
import Search16 from "@carbon/icons/es/search/16.js";
import Settings16 from "@carbon/icons/es/settings/16.js";
import { createSignal, For, onMount, Show } from "solid-js";
import { useLayerItem } from "../layer-manager/LayerContext";
import CarbonIcon from "./CarbonIcon";

const applications = [
  { name: "Files", description: "Browse your files", icon: Folder16, color: "bg-amber-500" },
  { name: "Web", description: "Explore the web", icon: Globe16, color: "bg-sky-500" },
  { name: "Gallery", description: "View your photos", icon: Image16, color: "bg-violet-500" },
  {
    name: "Settings",
    description: "Configure CloudReady",
    icon: Settings16,
    color: "bg-slate-600",
  },
] as const;

interface StartMenuProps {
  onClose: () => void;
}

export default function StartMenu(props: StartMenuProps) {
  const layerItem = useLayerItem("shell");
  const [query, setQuery] = createSignal("");
  let searchInput: HTMLInputElement | undefined;

  const matchingApplications = () => {
    const normalizedQuery = query().trim().toLowerCase();

    return normalizedQuery
      ? applications.filter((application) =>
          application.name.toLowerCase().includes(normalizedQuery),
        )
      : applications;
  };

  onMount(() => searchInput?.focus());

  return (
    <section
      id="start-menu"
      x-role="start menu"
      class="absolute bottom-13 left-1 w-lg overflow-hidden rounded-xl border border-neutral-600 bg-neutral-900/80 text-neutral-100 shadow-2xl backdrop-blur-lg"
      style={{ "z-index": layerItem.zIndex() }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          props.onClose();
        }
      }}
    >
      <div class="p-1">
        <label
          x-role="launcher search"
          class="flex items-center gap-2 rounded-lg border border-neutral-300 bg-neutral-50 px-3 text-neutral-500 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200"
        >
          <span class="grid size-4 shrink-0 place-items-center">
            <CarbonIcon icon={Search16} />
          </span>
          <input
            ref={searchInput}
            class="h-9 min-w-0 flex-1 bg-transparent text-neutral-900 outline-none placeholder:text-neutral-400"
            type="search"
            placeholder="Search apps"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
      </div>
      <Show
        when={matchingApplications().length > 0}
        fallback={
          <p class="flex h-65 items-center justify-center text-center text-neutral-500">
            No matching apps
          </p>
        }
      >
        <div x-role="application grid" class="grid grid-cols-5 grid-rows-4 gap-1 p-1">
          <For each={matchingApplications()}>
            {(application) => (
              <button
                x-role="launcher application"
                class="flex cursor-pointer flex-col items-center gap-2 rounded-lg p-1 text-left leading-3 transition-colors hover:bg-neutral-600 focus-visible:bg-neutral-600 focus-visible:outline-none"
                type="button"
                onClick={() => {
                  props.onClose();
                }}
              >
                <span
                  class={`grid size-8 shrink-0 place-items-center rounded-md text-white shadow-sm ${application.color}`}
                >
                  <CarbonIcon icon={application.icon} />
                </span>
                <span title={application.description}>{application.name}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
      <footer class="flex w-full items-center bg-neutral-800 p-4">
        <div class="flex items-center gap-2">
          <i class="inline-block size-6 rounded-full bg-white" />
          <span>User</span>
        </div>
        <CarbonIcon icon={Power16} class="ml-auto" />
      </footer>
    </section>
  );
}
