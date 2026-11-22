import Book16 from "@carbon/icons/es/book/16.js";
import DocumentAdd16 from "@carbon/icons/es/document--add/16.js";
import DocumentMultiple16 from "@carbon/icons/es/document--multiple-01/16.js";
import Folder16 from "@carbon/icons/es/folder/16.js";
import Save16 from "@carbon/icons/es/save/16.js";
import Task16 from "@carbon/icons/es/task/16.js";
import TrashCan16 from "@carbon/icons/es/trash-can/16.js";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import AppFrame from "../../components/app-frame/AppFrame";
import Button from "../../components/button/Button";
import useDialog from "../../components/dialog/Dialog";
import { SidebarItem } from "../../components/sidebar/SidebarItem";
import { SidebarSection } from "../../components/sidebar/SidebarSection";
import CarbonIcon from "../../components/taskbar/CarbonIcon";
import useFilePicker from "../file-manager/file-picker/FilePicker";
import { SubjectsProvider, useSubjects } from "./components/subjects/SubjectsContext";
import { useCurrentSubjectEntry } from "./components/subjects/useCurrentSubject";
import type { TopicItem } from "./core/learning-program";
import { NavigationProvider, useNavigation } from "./navigation/NavigationContext";
import PageRouter from "./pages/PageRouter";

/** An item and the subject path used for sidebar navigation. */
export interface SidebarEntryProps {
  item: TopicItem;
  subjectPath: string;
}

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
  const [sidebarCloseCount, setSidebarCloseCount] = createSignal(0);

  const navigateSidebar = (route: Parameters<typeof navigation.navigate>[0]) => {
    if (JSON.stringify(navigation.route()) === JSON.stringify(route)) {
      setSidebarCloseCount((count) => count + 1);
    } else {
      navigation.navigate(route);
    }
  };

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
  createEffect(subjectOpener.error, (error) => {
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
      navigateSidebar({ id: "/trash" });
      return;
    }
  };

  const handleItemClick = (subjectPath: string, itemId: string) => {
    navigateSidebar({
      id: "/subjects/:subjectId/items/:itemId",
      subjectId: subjectPath,
      itemId,
    });
  };

  const handleSubjectClick = (subjectPath: string) => {
    navigateSidebar({ id: "/subjects/:subjectId", subjectId: subjectPath });
  };

  const subjectKey = (subjectPath: string) => JSON.stringify([subjectPath]);
  const itemKey = (subjectPath: string, itemId: string) => JSON.stringify([subjectPath, itemId]);

  const SidebarEntry = (props: SidebarEntryProps) => (
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
    <div x-role="flashcards" class="h-full min-h-0">
      <AppFrame>
        <AppFrame.SidebarHeader>
          <h1 class="text-2xl">LAP</h1>
        </AppFrame.SidebarHeader>
        <AppFrame.Sidebar
          sizeKey="flashcards.sidebar.width"
          navigationKey={JSON.stringify([navigation.entry().id, sidebarCloseCount()])}
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
        </AppFrame.Sidebar>
        <Show when={currentSubject()}>
          {(entry) => (
            <AppFrame.Header>
              <section class="flex items-center justify-end gap-2">
                <span role="status" class="text-sm">
                  <Show
                    when={entry().saving()}
                    fallback={<Show when={entry().dirty()}>Unsaved changes</Show>}
                  >
                    Saving subject…
                  </Show>
                </span>
                <Button
                  disabled={!entry().dirty()}
                  loading={entry().saving()}
                  startIcon={<CarbonIcon icon={Save16} />}
                  onClick={handleSave}
                >
                  Save
                </Button>
                <Show when={entry().saveError()}>
                  <p role="alert" class="text-sm text-red-700">
                    Could not save subject. {entry().saveError()} Select Save to retry.
                  </p>
                </Show>
              </section>
            </AppFrame.Header>
          )}
        </Show>
        <AppFrame.Main>
          <PageRouter />
        </AppFrame.Main>
      </AppFrame>
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
