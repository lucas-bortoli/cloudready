import DocumentAdd16 from "@carbon/icons/es/document--add/16.js";
import Document16 from "@carbon/icons/es/document/16.js";
import Folder16 from "@carbon/icons/es/folder/16.js";
import TrashCan16 from "@carbon/icons/es/trash-can/16.js";
import { createEffect, createMemo, For, Show } from "solid-js";
import useDialog from "../../components/dialog/Dialog";
import ResizableSidebar from "../../components/sidebar/ResizableSidebar";
import { SidebarItem } from "../../components/sidebar/SidebarItem";
import { SidebarSection } from "../../components/sidebar/SidebarSection";
import useFilePicker from "../file-manager/file-picker/FilePicker";
import { NavigationProvider, useNavigation } from "./components/navigation/NavigationContext";
import { SubjectsProvider, useSubjects } from "./components/subjects/SubjectsContext";
import type { TopicItem } from "./core/learning-program";
import PageRouter from "./pages/PageRouter";

function MainWindow() {
  const subjectOpener = useSubjects();
  const navigation = useNavigation();
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
          navigation.navigate({ page: "subject", subjectPath: file.path });
      })
      .catch(() => {});
  };

  const handleSelect = (id: string) => {
    if (id === "management:trash") {
      navigation.navigate({ page: "trash" });
      return;
    }
  };

  const handleItemClick = (subjectPath: string, itemId: string) => {
    navigation.navigate({ page: "item", subjectPath, itemId });
  };

  const handleSubjectClick = (subjectPath: string) => {
    navigation.navigate({ page: "subject", subjectPath });
  };

  const subjectKey = (subjectPath: string) => JSON.stringify([subjectPath]);
  const itemKey = (subjectPath: string, itemId: string) => JSON.stringify([subjectPath, itemId]);

  const SidebarEntry = (props: { item: TopicItem; subjectPath: string }) => (
    <SidebarItem
      itemKey={itemKey(props.subjectPath, props.item.id)}
      label={props.item.title}
      icon={props.item.type === "topic" ? Folder16 : Document16}
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

    if (route.page === "item") {
      return itemKey(route.subjectPath, route.itemId);
    } else if (route.page === "subject") {
      return subjectKey(route.subjectPath);
    } else if (route.page === "trash") {
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
          <PageRouter />
        </section>
      </div>
    </div>
  );
}

/**
 * Opens and navigates read-only LAP subjects.
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
