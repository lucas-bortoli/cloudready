import { Grip } from "lucide-solid";

import Clock from "./Clock";

export default function Taskbar() {
  return (
    <section
      x-role="taskbar"
      class="absolute right-0 bottom-0 left-0 flex h-12 items-center bg-neutral-800 p-1 text-neutral-100"
    >
      <button class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-neutral-800 px-3 transition-colors hover:bg-neutral-700">
        <Grip aria-hidden="true" />
        Apps
      </button>
      <section x-role="window list" />
      <Clock />
    </section>
  );
}
