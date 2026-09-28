import ArrowLeft16 from "@carbon/icons/es/arrow--left/16.js";
import ArrowRight16 from "@carbon/icons/es/arrow--right/16.js";
import BookmarkAdd16 from "@carbon/icons/es/bookmark--add/16.js";
import Home16 from "@carbon/icons/es/home/16.js";
import Renew16 from "@carbon/icons/es/renew/16.js";
import Search16 from "@carbon/icons/es/search/16.js";
import VmdkDisk16 from "@carbon/icons/es/vmdk-disk/16.js";
import { createSignal } from "solid-js";
import Button from "../../components/button/Button";
import CarbonIcon from "../../components/taskbar/CarbonIcon";
import TextInput from "../../components/text-input/TextInput";
import PathBar from "./components/PathBar";

/** Browses the local kernel filesystem and exposes common file actions. */
export default function FileManager() {
  const [path, setPath] = createSignal("/");

  return (
    <section x-role="file manager" class="flex h-full min-h-0 flex-col bg-white text-neutral-800">
      <header class="flex gap-1 border-b border-neutral-200 bg-neutral-100 p-1">
        <Button startIcon={<CarbonIcon icon={ArrowLeft16} />} class="px-1.5!" />
        <Button startIcon={<CarbonIcon icon={ArrowRight16} />} class="px-1.5!" />
        <Button startIcon={<CarbonIcon icon={Renew16} />} class="px-1.5!" />
        <Button startIcon={<CarbonIcon icon={Home16} />} class="px-1.5!" />
        <PathBar path={path()} onPathSegmentClicked={setPath} />
        <Button startIcon={<CarbonIcon icon={BookmarkAdd16} />} class="px-1.5!" />
        <div class="relative inline-flex">
          <TextInput value={path()} onValueChange={setPath} class="shrink grow basis-0 pr-16!" />
          <CarbonIcon icon={Search16} class="absolute top-1/2 right-1 -translate-y-1/2" />
        </div>
      </header>
      <section class="flex grow">
        <aside class="flex w-35 flex-col border-r border-neutral-200 bg-neutral-100 p-1">
          <h3 class="font-medium">Bookmarks</h3>
          <ol class="flex flex-col">
            <li
              class="flex h-5 cursor-pointer items-center gap-1 rounded-xs bg-neutral-100 focus-within:bg-neutral-200 hover:bg-neutral-200 active:bg-neutral-300"
              tabIndex={0}
            >
              <CarbonIcon icon={VmdkDisk16} /> My Drive
            </li>
          </ol>
        </aside>
        <main class="flex shrink grow basis-0 overflow-y-auto" />
      </section>
      <footer class="flex h-7 items-center border-t border-neutral-200 px-1">
        <span>0 items</span>
      </footer>
    </section>
  );
}
