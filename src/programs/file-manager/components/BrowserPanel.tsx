import ArrowLeft16 from "@carbon/icons/es/arrow--left/16.js";
import ArrowRight16 from "@carbon/icons/es/arrow--right/16.js";
import BookmarkAdd16 from "@carbon/icons/es/bookmark--add/16.js";
import Home16 from "@carbon/icons/es/home/16.js";
import Renew16 from "@carbon/icons/es/renew/16.js";
import Search16 from "@carbon/icons/es/search/16.js";
import VmdkDisk16 from "@carbon/icons/es/vmdk-disk/16.js";
import { For } from "solid-js";
import Button from "../../../components/button/Button";
import { selectionBoundary, selectionItem } from "../../../components/range-select/rangeSelect";
import { SelectionProvider } from "../../../components/range-select/SelectionContext";
import StatusBar from "../../../components/status-bar/StatusBar";
import StatusBarItem from "../../../components/status-bar/StatusBarItem";
import StatusBarSeparator from "../../../components/status-bar/StatusBarSeparator";
import CarbonIcon from "../../../components/taskbar/CarbonIcon";
import TextInput from "../../../components/text-input/TextInput";
import { cn } from "../../../lib/dom";
import IconFile from "../icons/file.svg";
import IconDirectory from "../icons/folder.svg";
import { type NavigationController } from "../navigation-controller";
import PathBar from "./PathBar";

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

export default function BrowserPanel(props: { controller: NavigationController }) {
  const {
    path,
    navigateTo,
    entries,
    selectedItems,
    setSelectedItems,
    searchQuery,
    setSearchQuery,
  } = props.controller;

  function handleEntryDoubleClick(name: string) {
    const entry = entries().find((candidate) => candidate.name === name);
    if (entry?.kind === "directory") {
      // File activation is not implemented yet; directories change the current location.
      setSelectedItems(new Set([]));
      navigateTo(entry.path);
    }
  }

  return (
    <section
      x-role="browser panel"
      class="grid h-full min-h-0 grid-cols-[140px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] bg-white text-neutral-800"
    >
      <header class="col-span-2 flex h-9 gap-1 border-b border-neutral-200 bg-neutral-100 p-1">
        <Button startIcon={<CarbonIcon icon={ArrowLeft16} />} class="px-1.5!" />
        <Button startIcon={<CarbonIcon icon={ArrowRight16} />} class="px-1.5!" />
        <Button startIcon={<CarbonIcon icon={Renew16} />} class="px-1.5!" />
        <Button startIcon={<CarbonIcon icon={Home16} />} class="px-1.5!" />
        <PathBar path={path()} onPathSegmentClicked={navigateTo} />
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
      <aside class="flex min-h-0 flex-col overflow-y-auto border-r border-neutral-200 bg-neutral-100 p-1">
        <SidebarCategory
          label="Bookmarks"
          items={[{ icon: VmdkDisk16, label: "My Drive", targetPath: "/" }]}
        />
      </aside>
      <section class="flex min-h-0 min-w-0">
        <SelectionProvider selectedItems={selectedItems} setSelectedItems={setSelectedItems}>
          <ol class="relative min-w-0 grow overflow-y-auto p-2" use:selectionBoundary>
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
      <StatusBar class="col-span-2">
        <StatusBarItem text={entries().length === 1 ? "1 entry" : `${entries().length} entries`} />
        <StatusBarSeparator />
        <StatusBarItem
          text={`${selectedItems().size} ${selectedItems().size === 1 ? "entry" : `entries`} selected`}
        />
      </StatusBar>
    </section>
  );
}
