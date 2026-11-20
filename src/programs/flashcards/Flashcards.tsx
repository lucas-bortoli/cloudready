import DocumentAdd16 from "@carbon/icons/es/document--add/16.js";
import Book16 from "@carbon/icons/es/book/16.js";
import DocumentMultiple16 from "@carbon/icons/es/document--multiple-01/16.js";
import Folder16 from "@carbon/icons/es/folder/16.js";
import Task16 from "@carbon/icons/es/task/16.js";
import TrashCan16 from "@carbon/icons/es/trash-can/16.js";
import { createEffect, createMemo, For, Show } from "solid-js";
import Button from "../../components/button/Button";
import useDialog from "../../components/dialog/Dialog";
import ResizableSidebar from "../../components/sidebar/ResizableSidebar";
import { SidebarItem } from "../../components/sidebar/SidebarItem";
import { SidebarSection } from "../../components/sidebar/SidebarSection";
import useFilePicker from "../file-manager/file-picker/FilePicker";
import { SubjectsProvider, useSubjects } from "./components/subjects/SubjectsContext";
import { useCurrentSubjectEntry } from "./components/subjects/useCurrentSubject";
import type { TopicItem } from "./core/learning-program";
import { NavigationProvider, useNavigation } from "./navigation/NavigationContext";
import PageRouter from "./pages/PageRouter";

const itemIcons = {
  topic: Folder16,
  lesson: Book16,
  "exercise-set": Task16,
  "flashcard-deck": DocumentMultiple16,
} satisfies Record<TopicItem["type"], typeof Folder16>;

function MainWindow() {
  const subjectOpener = useSubjects();
  const navigation = useNavigation();
  const currentSubject = useCurrentSubjectEntry();

  const handleSave = () => {
    void currentSubject()?.save();
  };

  const showDialog = useDialog();
  const picker = useFilePicker({
    type: "file",
    suffixes: [".lap"],
    multiple: false,
  });

  // show a message box error whenever a package fails to load
  createEffect(() => {
    const error = subjectOpener.error();
    if (!error) return;
    subjectOpener.clearError();
    void showDialog({
      icon: "error",
      title: "Could not open package",
      content: () => (
        <div>
          <p>Sorry, we couldn't open this subject.</p>
          <p>Reason: {error}</p>
          <p>Please check the console for more details.</p>
        </div>
      ),
      actions: { ok: "OK" },
    }).result.catch(() => {});
  });

  const handleBrowse = () => {
    void picker
      .show()
      .then(async ([file]) => {
        if (!file) return;
        await subjectOpener.openFile(file.path);
        if (subjectOpener.subjects().some((entry) => entry.path === file.path))
          navigation.navigate({ id: "/subjects/:subjectId", subjectId: file.path });
      })
      .catch(() => {});
  };

  const handleSelect = (id: string) => {
    if (id === "management:trash") {
      navigation.navigate({ id: "/trash" });
      return;
    }
  };

  const handleItemClick = (subjectPath: string, itemId: string) => {
    navigation.navigate({
      id: "/subjects/:subjectId/items/:itemId",
      subjectId: subjectPath,
      itemId,
    });
  };

  const handleSubjectClick = (subjectPath: string) => {
    navigation.navigate({ id: "/subjects/:subjectId", subjectId: subjectPath });
  };

  const subjectKey = (subjectPath: string) => JSON.stringify([subjectPath]);
  const itemKey = (subjectPath: string, itemId: string) => JSON.stringify([subjectPath, itemId]);

  const SidebarEntry = (props: { item: TopicItem; subjectPath: string }) => (
    <SidebarItem
      itemKey={itemKey(props.subjectPath, props.item.id)}
      label={props.item.title}
      icon={itemIcons[props.item.type]}
      onClick={handleItemClick.bind(null, props.subjectPath, props.item.id)}
    >
      <Show when={props.item.type === "topic"}>
        <For each={props.item.type === "topic" ? props.item.items : []}>
          {(item) => <SidebarEntry item={item} subjectPath={props.subjectPath} />}
        </For>
      </Show>
    </SidebarItem>
  );

  const sidebarSelectedItem = createMemo(() => {
    const route = navigation.route();

    if (route.id === "/subjects/:subjectId/items/:itemId") {
      return itemKey(route.subjectId, route.itemId);
    } else if (route.id === "/subjects/:subjectId") {
      return subjectKey(route.subjectId);
    } else if (route.id === "/trash") {
      return "management:trash";
    } else {
      return null;
    }
  });

  return (
    <div x-role="flashcards" class="@container flex h-full min-h-0 text-neutral-800">
      <div class="relative flex min-h-0 flex-1">
        <ResizableSidebar
          class="flex border-r border-neutral-200 bg-neutral-100"
          sizeKey="flashcards.sidebar.width"
          selectedItem={sidebarSelectedItem()}
          setSelectedItem={handleSelect}
        >
          <SidebarSection label="Management">
            <SidebarItem
              icon={DocumentAdd16}
              label="Add Subject..."
              itemKey="management:add-subject"
              onClick={handleBrowse}
            />
            <SidebarItem icon={TrashCan16} label="Trash" itemKey="management:trash" />
          </SidebarSection>
          <SidebarSection label="Subjects">
            <For each={subjectOpener.subjects()}>
              {(entry) => (
                <SidebarItem
                  label={entry.subject.manifest.title}
                  icon={Folder16}
                  itemKey={subjectKey(entry.path)}
                  onClick={handleSubjectClick.bind(null, entry.path)}
                >
                  <For each={entry.subject.content.topics}>
                    {(item) => <SidebarEntry item={item} subjectPath={entry.path} />}
                  </For>
                </SidebarItem>
              )}
            </For>
          </SidebarSection>
        </ResizableSidebar>
        <section class="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-neutral-50">
          <Show when={currentSubject()}>
            {(entry) => (
              <header
                x-role="subject-toolbar"
                class="flex shrink-0 items-center justify-end gap-2 border-b border-neutral-200 px-4 py-2"
              >
                <span role="status" class="text-sm">
                  <Show
                    when={entry().saving()}
                    fallback={<Show when={entry().dirty()}>Unsaved changes</Show>}
                  >
                    Saving subject…
                  </Show>
                </span>
                <Button disabled={!entry().dirty()} loading={entry().saving()} onClick={handleSave}>
                  Save
                </Button>
                <Show when={entry().saveError()}>
                  <p role="alert" class="text-sm text-red-700">
                    Could not save subject. {entry().saveError()} Select Save to retry.
                  </p>
                </Show>
              </header>
            )}
          </Show>
          <div class="flex min-h-0 flex-1 flex-col">
            <PageRouter />
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Opens LAP subjects and supports flashcard review.
 */
export default function Flashcards() {
  return (
    <SubjectsProvider>
      <NavigationProvider>
        <MainWindow />
      </NavigationProvider>
    </SubjectsProvider>
  );
}
