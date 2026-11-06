import ArrowLeft16 from "@carbon/icons/es/arrow--left/16.js";
import ArrowRight16 from "@carbon/icons/es/arrow--right/16.js";
import BookmarkAdd16 from "@carbon/icons/es/bookmark--add/16.js";
import Home16 from "@carbon/icons/es/home/16.js";
import Renew16 from "@carbon/icons/es/renew/16.js";
import Search16 from "@carbon/icons/es/search/16.js";
import VmdkDisk16 from "@carbon/icons/es/vmdk-disk/16.js";
import { For, createEffect, createSignal } from "solid-js";
import Button from "../../components/button/Button";
import CarbonIcon from "../../components/taskbar/CarbonIcon";
import TextInput from "../../components/text-input/TextInput";
import useWindowCloser from "../../components/window-manager/useWindowCloser";
import PathBar from "./components/PathBar";

import useDialog from "../../components/dialog/Dialog";
import type { FileSystemEntry } from "../../filesystem/FileSystemClient";
import { cn } from "../../lib/dom";
import { filesystemList } from "../../lib/kernel-rpc/filesystem";
import rangeSelect from "./lib/rangeSelect";
import IconFile from "./icons/file.svg";
import IconDirectory from "./icons/folder.svg";

void rangeSelect;

function EntryIcon(props: {
  type: "file" | "directory";
  name: string;
  entryName: string;
  selected: boolean;
  handleClick: (event: MouseEvent) => void;
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
      onClick={props.handleClick}
      onDblClick={props.handleDoubleClick}
      aria-selected={props.selected}
      data-entry-name={props.entryName}
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
  // Shift-click ranges are measured from the last plain or modifier click.
  const [selectionAnchor, setSelectionAnchor] = createSignal<string | null>(null);

  function handleEntryClick(name: string, event: MouseEvent) {
    const currentEntries = entries();
    const index = currentEntries.findIndex((entry) => entry.name === name);
    const additive = event.ctrlKey || event.metaKey;

    if (event.shiftKey) {
      const anchor = selectionAnchor();
      const anchorIndex =
        anchor === null ? -1 : currentEntries.findIndex((entry) => entry.name === anchor);
      if (anchorIndex < 0 || index < 0) {
        setSelectedItems(new Set([name]));
        setSelectionAnchor(name);
        return;
      }
      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      // Ctrl/Cmd+Shift-click adds the range to the current selection.
      const next = additive ? new Set(selectedItems()) : new Set<string>();
      for (let i = start; i <= end; i += 1) next.add(currentEntries[i].name);
      setSelectedItems(next);
    } else if (additive) {
      const next = new Set(selectedItems());
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setSelectedItems(next);
      setSelectionAnchor(name);
    } else {
      setSelectedItems(new Set([name]));
      setSelectionAnchor(name);
    }
  }

  function handleEntryDoubleClick(name: string) {
    const entry = entries().find((candidate) => candidate.name === name);
    if (entry?.kind === "directory") {
      // File activation is not implemented yet; directories change the current location.
      setSelectedItems(new Set([]));
      setSelectionAnchor(null);
      setPath(entry.path);
    }
  }

  const showDialog = useDialog();

  createEffect(() => {
    const target = path();
    setSelectedItems(new Set([]));
    setSelectionAnchor(null);
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
        <ol
          class="relative shrink grow basis-0 gap-2 overflow-y-auto p-2"
          use:rangeSelect={{ selectedItems, setSelectedItems, setSelectionAnchor }}
        >
          <For each={entries()}>
            {(entry) => (
              <EntryIcon
                type={entry.kind}
                name={entry.name}
                selected={selectedItems().has(entry.name)}
                entryName={entry.name}
                handleClick={handleEntryClick.bind(null, entry.name)}
                handleDoubleClick={handleEntryDoubleClick.bind(null, entry.name)}
              />
            )}
          </For>
        </ol>
      </section>
      <footer class="flex h-7 items-center border-t border-neutral-200 px-1">
        <span>{entries().length === 1 ? "1 entry" : `${entries().length} entries`}</span>
      </footer>
    </section>
  );
}
