import Apps16 from "@carbon/icons/es/apps/16.js";
import { createSignal, Show } from "solid-js";

import CarbonIcon from "./CarbonIcon";
import Clock from "./Clock";
import StartMenu from "./StartMenu";

export default function Taskbar() {
  const [isStartMenuOpen, setIsStartMenuOpen] = createSignal(false);

  return (
    <section
      x-role="taskbar"
      class="absolute right-0 bottom-0 left-0 flex h-12 items-center bg-neutral-800 p-1 text-neutral-100"
    >
      <button
        aria-controls="start-menu"
        aria-expanded={isStartMenuOpen()}
        class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-neutral-800 px-3 transition-colors hover:bg-neutral-700"
        type="button"
        onClick={() => setIsStartMenuOpen(!isStartMenuOpen())}
      >
        <span class="grid size-4 shrink-0 place-items-center">
          <CarbonIcon icon={Apps16} />
        </span>
        Apps
      </button>
      <section x-role="window list" />
      <Clock />
      <Show when={isStartMenuOpen()}>
        <StartMenu onClose={() => setIsStartMenuOpen(false)} />
      </Show>
    </section>
  );
}
