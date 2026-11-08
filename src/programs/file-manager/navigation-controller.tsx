import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import useDialog from "../../components/dialog/Dialog";
import { filesystem, type FileSystemEntry } from "../../filesystem/FileSystemClient";

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
  const [history, setHistory] = createSignal({ paths: ["/"], index: 0 });
  const path = createMemo(() => history().paths[history().index]);
  const canGoBack = createMemo(() => history().index > 0);
  const canGoForward = createMemo(() => history().index < history().paths.length - 1);
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
    setHistory((current) => {
      if (current.paths[current.index] === target) return current;
      return {
        paths: [...current.paths.slice(0, current.index + 1), target],
        index: current.index + 1,
      };
    });
  }

  function goBack() {
    setHistory((current) =>
      current.index > 0 ? { ...current, index: current.index - 1 } : current,
    );
  }

  function goForward() {
    setHistory((current) =>
      current.index < current.paths.length - 1 ? { ...current, index: current.index + 1 } : current,
    );
  }

  createEffect(() => {
    const target = path();
    let current = true;
    onCleanup(() => {
      current = false;
    });
    setSelectedItems(new Set([]));
    filesystem
      .list(target)
      .then((result) => {
        if (current) setEntries(result);
      })
      .catch((error) => {
        if (!current) return;
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
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    entries: visibleEntries,
    selectedItems,
    setSelectedItems,
    searchQuery,
    setSearchQuery,
  };
}

export type NavigationController = ReturnType<typeof createNavigationController>;
