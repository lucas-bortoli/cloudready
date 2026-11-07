import ArrowLeft16 from "@carbon/icons/es/arrow--left/16.js";
import ArrowRight16 from "@carbon/icons/es/arrow--right/16.js";
import BookmarkAdd16 from "@carbon/icons/es/bookmark--add/16.js";
import Home16 from "@carbon/icons/es/home/16.js";
import Renew16 from "@carbon/icons/es/renew/16.js";
import Search16 from "@carbon/icons/es/search/16.js";
import VmdkDisk16 from "@carbon/icons/es/vmdk-disk/16.js";
import { For, createEffect, createSignal } from "solid-js";
import Button from "../../components/button/Button";
import useDialog from "../../components/dialog/Dialog";
import CarbonIcon from "../../components/taskbar/CarbonIcon";
import TextInput from "../../components/text-input/TextInput";
import useWindowCloser from "../../components/window-manager/useWindowCloser";
import type { FileSystemEntry } from "../../filesystem/FileSystemClient";
import { cn } from "../../lib/dom";
import { filesystemList } from "../../lib/kernel-rpc/filesystem";
import PathBar from "./components/PathBar";
import IconFile from "./icons/file.svg";
import IconDirectory from "./icons/folder.svg";
import { SelectionProvider } from "../../components/range-select/SelectionContext";
import { selectionBoundary, selectionItem } from "../../components/range-select/rangeSelect";

// Solid directives must remain in scope for the compiler.
void selectionBoundary;
void selectionItem;

function SidebarCategory(props: {
  label: string;
  items: { icon: CarbonIconDescriptor; label: string; targetPath: string }[];
}) {
  return (
    <section>
      <h3 class="font-medium">{props.label}</h3>
      <ol class="flex flex-col">
        <For
          each={props.items}
          children={(item) => (
            <li
              class="flex h-5 cursor-pointer items-center gap-1 rounded-xs bg-neutral-100 outline-sky-300 focus-within:bg-sky-200 focus-within:outline-1 hover:bg-neutral-200 focus-within:hover:bg-sky-200 active:bg-neutral-300"
              tabIndex={0}
            >
              <CarbonIcon icon={item.icon} /> <h4>{item.label}</h4>
            </li>
          )}
        />
      </ol>
    </section>
  );
}

function EntryIcon(props: {
  type: "file" | "directory";
  name: string;
  entryName: string;
  selected: boolean;
  handleDoubleClick: (event: MouseEvent) => void;
}) {
  return (
    <li
      class={cn(
        "m-1 inline-flex h-20 w-20 cursor-default flex-col items-center gap-2 overflow-hidden rounded-sm px-1 py-2",
        "outline-sky-300 focus-within:outline-1",
        props.selected && "bg-sky-200",
        !props.selected && "hover:bg-sky-100",
      )}
      onDblClick={props.handleDoubleClick}
      aria-selected={props.selected}
      use:selectionItem={props.entryName}
      role="option"
      tabIndex={0}
    >
      <img src={props.type === "file" ? IconFile : IconDirectory} class="inline-block h-8 w-8" />
      <span class="line-clamp-2 text-center leading-3">{props.name}</span>
    </li>
  );
}

/** Browses the local kernel filesystem and exposes common file actions. */
export default function FileManager() {
  useWindowCloser(() => true);

  const [path, setPath] = createSignal("/");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [entries, setEntries] = createSignal<ReadonlyArray<FileSystemEntry>>([]);
  const [selectedItems, setSelectedItems] = createSignal<ReadonlySet<string>>(new Set());
  function handleEntryDoubleClick(name: string) {
    const entry = entries().find((candidate) => candidate.name === name);
    if (entry?.kind === "directory") {
      // File activation is not implemented yet; directories change the current location.
      setSelectedItems(new Set([]));
      setPath(entry.path);
    }
  }

  const showDialog = useDialog();

  createEffect(() => {
    const target = path();
    setSelectedItems(new Set([]));
    filesystemList({ path: target })
      .then(setEntries)
      .catch((error) => {
        showDialog({
          icon: "error",
          title: "Entry Fetch Fail",
          content: () => (
            <div>
              <p>
                Sorry, I couldn't list files in <code>{target}</code>.
              </p>
              <pre>{JSON.stringify(error)}</pre>
            </div>
          ),
          actions: { ok: "OK" },
        });
      });
  });

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
          <TextInput
            value={searchQuery()}
            onValueChange={setSearchQuery}
            class="shrink grow basis-0 pr-16!"
          />
          <CarbonIcon icon={Search16} class="absolute top-1/2 right-1 -translate-y-1/2" />
        </div>
      </header>
      <section class="flex grow">
        <aside class="flex w-35 flex-col border-r border-neutral-200 bg-neutral-100 p-1">
          <SidebarCategory
            label="Bookmarks"
            items={[{ icon: VmdkDisk16, label: "My Drive", targetPath: "/" }]}
          />
        </aside>
        <SelectionProvider selectedItems={selectedItems} setSelectedItems={setSelectedItems}>
          <ol class="relative shrink grow basis-0 gap-2 overflow-y-auto p-2" use:selectionBoundary>
            <For each={entries()}>
              {(entry) => (
                <EntryIcon
                  type={entry.kind}
                  name={entry.name}
                  selected={selectedItems().has(entry.name)}
                  entryName={entry.name}
                  handleDoubleClick={handleEntryDoubleClick.bind(null, entry.name)}
                />
              )}
            </For>
          </ol>
        </SelectionProvider>
      </section>
      <footer class="flex h-7 items-center border-t border-neutral-200 px-1">
        <span>{entries().length === 1 ? "1 entry" : `${entries().length} entries`}</span>
      </footer>
    </section>
  );
}
