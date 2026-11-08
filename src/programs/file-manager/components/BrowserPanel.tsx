import ArrowLeft16 from "@carbon/icons/es/arrow--left/16.js";
import ArrowRight16 from "@carbon/icons/es/arrow--right/16.js";
import BookmarkAdd16 from "@carbon/icons/es/bookmark--add/16.js";
import Download16 from "@carbon/icons/es/download/16.js";
import FolderOpen16 from "@carbon/icons/es/folder--open/16.js";
import Home16 from "@carbon/icons/es/home/16.js";
import Renew16 from "@carbon/icons/es/renew/16.js";
import Search16 from "@carbon/icons/es/search/16.js";
import TrashCan16 from "@carbon/icons/es/trash-can/16.js";
import Upload16 from "@carbon/icons/es/upload/16.js";
import VmdkDisk16 from "@carbon/icons/es/vmdk-disk/16.js";
import { For } from "solid-js";
import Button from "../../../components/button/Button";
import { contextMenu } from "../../../components/context-menu/contextMenu";
import {
  ContextMenuProvider,
  type ContextMenuItem,
} from "../../../components/context-menu/ContextMenuContext";
import { selectionBoundary, selectionItem } from "../../../components/range-select/rangeSelect";
import { SelectionProvider } from "../../../components/range-select/SelectionContext";
import StatusBar from "../../../components/status-bar/StatusBar";
import StatusBarItem from "../../../components/status-bar/StatusBarItem";
import StatusBarSeparator from "../../../components/status-bar/StatusBarSeparator";
import CarbonIcon from "../../../components/taskbar/CarbonIcon";
import TextInput from "../../../components/text-input/TextInput";
import type { FileSystemEntry } from "../../../filesystem/FileSystemClient";
import { cn } from "../../../lib/dom";
import IconFile from "../icons/file.svg";
import IconDirectory from "../icons/folder.svg";
import { type NavigationController } from "../navigation-controller";
import PathBar from "./PathBar";

// Solid directives must remain in scope for the compiler.
void selectionBoundary;
void selectionItem;
void contextMenu;

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
  contextMenu: ContextMenuItem[];
}) {
  return (
    <li
      class={cn(
        "m-1 inline-flex h-20 w-20 cursor-default flex-col items-center gap-2 overflow-hidden rounded-sm px-1 py-2",
        "outline-sky-300 *:pointer-events-none focus-within:outline-1",
        props.selected && "bg-sky-200",
        !props.selected && "hover:bg-sky-100",
      )}
      onDblClick={props.handleDoubleClick}
      aria-selected={props.selected}
      use:selectionItem={props.entryName}
      use:contextMenu={props.contextMenu}
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

  function buildPanelContextMenu(): ContextMenuItem[] {
    return [
      { label: "Select all", disabled: entries().length === 0, onSelect: handleSelectAll },
      { type: "separator" },
      { type: "label", label: "This device" },
      { label: "Import files...", icon: Upload16, disabled: true, onSelect: handleUnavailable },
      { label: "Export files...", icon: Download16, disabled: true, onSelect: handleUnavailable },
    ];
  }

  function handleSelectAll() {
    setSelectedItems(new Set(entries().map((entry) => entry.name)));
  }

  function handleUnavailable() {}

  function buildEntryContextMenu(entry: FileSystemEntry): ContextMenuItem[] {
    return [
      {
        label: "Open",
        icon: FolderOpen16,
        disabled: entry.kind !== "directory",
        onSelect: handleEntryDoubleClick.bind(null, entry.name),
      },
      { type: "separator" },
      { label: "Delete", icon: TrashCan16, disabled: true, onSelect: handleUnavailable },
    ];
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
      <SelectionProvider selectedItems={selectedItems} setSelectedItems={setSelectedItems}>
        <ContextMenuProvider>
          <section class="flex min-h-0 min-w-0">
            <ol
              class={cn(
                "relative min-w-0 grow overflow-y-auto p-2",
                "-outline-offset-2 outline-sky-300 focus:outline-1",
              )}
              use:selectionBoundary
              use:contextMenu={buildPanelContextMenu()}
              tabIndex={0}
            >
              <For each={entries()}>
                {(entry) => (
                  <EntryIcon
                    type={entry.kind}
                    name={entry.name}
                    selected={selectedItems().has(entry.name)}
                    entryName={entry.name}
                    handleDoubleClick={handleEntryDoubleClick.bind(null, entry.name)}
                    contextMenu={buildEntryContextMenu(entry)}
                  />
                )}
              </For>
            </ol>
          </section>
        </ContextMenuProvider>
      </SelectionProvider>
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
