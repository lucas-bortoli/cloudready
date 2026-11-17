import { createMemo, createSignal, For, Show, untrack } from "solid-js";
import Folder16 from "@carbon/icons/es/folder/16.js";
import Document16 from "@carbon/icons/es/document/16.js";
import Button from "../../components/button/Button";
import Sidebar from "../../components/sidebar/Sidebar";
import { SidebarItem } from "../../components/sidebar/SidebarItem";
import { SidebarSection } from "../../components/sidebar/SidebarSection";
import useFilePicker from "../file-manager/file-picker/FilePicker";
import type { TopicItem } from "./core/learning-program";
import { LessonView } from "./components/subject/LessonView";
import { createSubjectController } from "./ui/createSubjectController";

/**
 * Identifies the profile that owns this application window.
 */
export interface FlashcardsProps {
  userId: string;
}

/**
 * Opens and navigates read-only LAP subjects.
 *
 * @param _props The current window profile.
 */
export default function Flashcards(_props: FlashcardsProps) {
  untrack(() => _props.userId);
  const controller = createSubjectController();
  const [showTopics, setShowTopics] = createSignal(false);
  const picker = useFilePicker({ type: "file", suffixes: [".lap"], multiple: false });
  const handleBrowse = () => {
    void picker
      .show()
      .then(([file]) => file && controller.openFile(file.path))
      .catch(() => {});
  };
  const handleSelect = (id: string) => {
    controller.setSelection(id);
    setShowTopics(false);
  };
  const handleToggle = () => setShowTopics(!showTopics());
  const find = (entries: TopicItem[], id: string): TopicItem | undefined => {
    for (const item of entries) {
      if (item.id === id) return item;
      if (item.type === "topic") {
        const result = find(item.items, id);
        if (result) return result;
      }
    }
  };
  const selected = createMemo(() => {
    const id = controller.selection();
    const subject = controller.subject();
    return id && subject ? find(subject.content.topics, id) : undefined;
  });
  const SidebarEntry = (props: { item: TopicItem }) => (
    <SidebarItem
      itemKey={props.item.id}
      label={props.item.title}
      icon={props.item.type === "topic" ? Folder16 : Document16}
    >
      <Show when={props.item.type === "topic"}>
        <For each={props.item.type === "topic" ? props.item.items : []}>
          {(item) => <SidebarEntry item={item} />}
        </For>
      </Show>
    </SidebarItem>
  );
  return (
    <div x-role="flashcards" class="@container flex h-full min-h-0 flex-col text-neutral-800">
      <header class="flex items-center gap-2 bg-neutral-100 p-2">
        <button
          class="rounded p-2 outline-sky-300 focus:outline-2 focus:outline-offset-2 @min-[600px]:hidden"
          onClick={handleToggle}
        >
          Topics
        </button>
        <Button onClick={handleBrowse}>Open subject</Button>
        <Show when={controller.loading()}>
          <span>Opening…</span>
        </Show>
      </header>
      <Show when={controller.error()}>
        <div role="alert" class="bg-red-100 p-2">
          {controller.error()}{" "}
          <button
            class="outline-sky-300 focus:outline-2 focus:outline-offset-2"
            onClick={controller.clearError}
          >
            Dismiss
          </button>
        </div>
      </Show>
      <div class="relative flex min-h-0 flex-1">
        <div
          classList={{ hidden: !showTopics() }}
          class="absolute inset-y-0 left-0 z-10 flex bg-neutral-100 @min-[600px]:static @min-[600px]:flex"
        >
          <Sidebar selectedItem={controller.selection()} setSelectedItem={handleSelect}>
            <Show when={controller.subject()}>
              {(subject) => (
                <SidebarSection label={subject().manifest.title}>
                  <For each={subject().content.topics}>
                    {(item) => <SidebarEntry item={item} />}
                  </For>
                </SidebarSection>
              )}
            </Show>
          </Sidebar>
        </div>
        <main class="flex min-w-0 flex-1 flex-col overflow-auto bg-neutral-50 p-4">
          <Show when={controller.subject()} fallback={<p>Open a LAP subject to start learning.</p>}>
            {(subject) => (
              <>
                <Show when={subject().warnings.length}>
                  <details>
                    <summary>Subject references ({subject().warnings.length})</summary>
                    <For each={subject().warnings}>
                      {(warning) => (
                        <p>
                          {warning.sourceId}: {warning.reference}
                        </p>
                      )}
                    </For>
                  </details>
                </Show>
                <Show
                  when={selected()}
                  fallback={
                    <>
                      <h1>{subject().manifest.title}</h1>
                      <p>{subject().manifest.description}</p>
                      <p>{subject().manifest.language}</p>
                      <Show
                        when={subject().content.topics.length}
                        fallback={<p>This subject has no topics yet.</p>}
                      >
                        <ul>
                          <For each={subject().content.topics}>
                            {(topic) => <li>{topic.title}</li>}
                          </For>
                        </ul>
                      </Show>
                    </>
                  }
                >
                  {(item) => (
                    <>
                      <h1>{item().title}</h1>
                      <Show when={item().type === "lesson" && item()}>
                        {(lesson) => (
                          <LessonView
                            subject={subject()}
                            html={
                              lesson().type === "lesson"
                                ? (lesson() as Extract<TopicItem, { type: "lesson" }>).html
                                : ""
                            }
                            onSelect={handleSelect}
                          />
                        )}
                      </Show>
                      <Show when={item().type === "topic" && item()}>
                        {(topic) => (
                          <ul>
                            <For
                              each={
                                topic().type === "topic"
                                  ? (topic() as Extract<TopicItem, { type: "topic" }>).items
                                  : []
                              }
                            >
                              {(child) => <li>{child.title}</li>}
                            </For>
                          </ul>
                        )}
                      </Show>
                      <Show when={item().type === "exercise-set"}>
                        {item().type === "exercise-set" &&
                          `${(item() as Extract<TopicItem, { type: "exercise-set" }>).exercises.length} questions`}
                      </Show>
                      <Show when={item().type === "flashcard-deck"}>
                        {item().type === "flashcard-deck" &&
                          `${(item() as Extract<TopicItem, { type: "flashcard-deck" }>).cards.length} cards`}
                      </Show>
                    </>
                  )}
                </Show>
              </>
            )}
          </Show>
        </main>
      </div>
    </div>
  );
}
