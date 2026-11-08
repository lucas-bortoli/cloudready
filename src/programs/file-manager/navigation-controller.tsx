import { createEffect, createMemo, createSignal, on } from "solid-js";
import useDialog from "../../components/dialog/Dialog";
import type { FileSystemEntry } from "../../filesystem/FileSystemClient";
import { filesystemList } from "../../lib/kernel-rpc/filesystem";

/**
 * Creates navigation state for browsing filesystem entries.
 *
 * @param options.entryFilter Controls which entries are visible; reactive reads are tracked.
 */
export default function createNavigationController(
  options: {
    entryFilter?: (entry: FileSystemEntry) => boolean;
  } = {},
) {
  const [path, setPath] = createSignal("/");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [entries, setEntries] = createSignal<ReadonlyArray<FileSystemEntry>>([]);
  const [selectedItems, setSelectedItems] = createSignal<ReadonlySet<string>>(new Set());
  const visibleEntries = createMemo(() => {
    const query = searchQuery().toLowerCase();
    return entries().filter(
      (entry) => entry.name.toLowerCase().includes(query) && (options.entryFilter?.(entry) ?? true),
    );
  });

  createEffect(
    on(visibleEntries, (visible) => {
      const names = new Set(visible.map((entry) => entry.name));
      setSelectedItems((selected) => {
        const retained = [...selected].filter((name) => names.has(name));
        return retained.length === selected.size ? selected : new Set(retained);
      });
    }),
  );

  const showDialog = useDialog();

  function navigateTo(target: string) {
    setPath(target);
  }

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

  return {
    path,
    navigateTo,
    entries: visibleEntries,
    selectedItems,
    setSelectedItems,
    searchQuery,
    setSearchQuery,
  };
}

export type NavigationController = ReturnType<typeof createNavigationController>;
