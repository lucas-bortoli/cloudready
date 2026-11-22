import { createSignal, onSettled, type ParentProps } from "solid-js";
import { render } from "@solidjs/web";
import { ContextMenuProvider } from "../../../../components/context-menu/ContextMenuContext";
import { LayerProvider } from "../../../../components/layer-manager/LayerContext";
import {
  WindowManagerProvider,
  useWindowManager,
} from "../../../../components/window-manager/WindowManagerContext";
import WindowsOutlet from "../../../../components/window-manager/WindowsOutlet";
import { filesystem } from "../../../../filesystem/FileSystemClient";
import { SubjectsContext } from "../../components/subjects/SubjectsContext";
import { UserHtml } from "../../components/user-html/UserHtml";
import type { OpenSubjectPackage } from "../../core/subject-package/types";
import Flashcards from "../../Flashcards";
import { NavigationContext } from "../../navigation/NavigationContext";

function FixtureSubject(props: ParentProps<{ subject: OpenSubjectPackage }>) {
  const navigation = {
    route: () => ({ id: "/subjects/:subjectId", subjectId: "fixture" }),
  } as never;
  const subjects = { subjects: () => [{ path: "fixture", subject: props.subject }] } as never;
  return (
    <NavigationContext value={navigation}>
      <SubjectsContext value={subjects}>{props.children}</SubjectsContext>
    </NavigationContext>
  );
}

/**
 * Mounts a lesson with in-memory media for browser isolation tests.
 *
 * @param html Untrusted lesson HTML to exercise in the browser.
 * @returns A function that disposes the mounted viewer.
 */
export function mountLessonFixture(html: string) {
  const root = document.createElement("div");
  document.body.append(root);
  const subject = {
    getAsset(path: string) {
      const bytes = path.endsWith(".svg")
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>'
        : "audio";
      const blob = new Blob([bytes]);
      return { size: blob.size, openStream: () => blob.stream() };
    },
  } as unknown as OpenSubjectPackage;
  const dispose = render(
    () => (
      <FixtureSubject subject={subject}>
        <UserHtml
          title="Lesson"
          html={html}
          onSelect={(id) => root.setAttribute("data-selected", id)}
        />
      </FixtureSubject>
    ),
    root,
  );
  return () => {
    dispose();
    root.remove();
  };
}

/**
 * Mounts the LAP application with a supplied sample in a virtual filesystem.
 *
 * @param sample The subject package to expose through the file picker.
 * @returns A function that disposes the application and restores the filesystem.
 */
export function mountLapFixture(sample: Blob) {
  const root = document.createElement("div");
  root.style.cssText = "width: 800px; height: 600px; background: white";
  document.body.append(root);
  const originalList = filesystem.list;
  const originalReadFile = filesystem.readFile;
  const originalWriteFile = filesystem.writeFile;
  let stored = sample;
  filesystem.list = async () => [
    {
      id: "00000000-0000-4000-8000-000000000000" as never,
      path: "/spanish-starter.lap",
      name: "spanish-starter.lap",
      kind: "file",
      size: stored.size,
      mimeType: "application/octet-stream",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  filesystem.readFile = async () => stored;
  filesystem.writeFile = async (path, content) => {
    stored = new Blob([content instanceof Blob ? content : new Uint8Array(content)]);
    root.dataset.saved = path;
    const [file] = await filesystem.list("/");
    if (file.kind !== "file") throw new Error("Expected a fixture file.");
    return file;
  };
  const Launcher = () => {
    const manager = useWindowManager();
    onSettled(() => {
      manager.createWindow({
        title: "LAP",
        size: { width: 800, height: 600 },
        minimumSize: { width: 320, height: 360 },
        content: () => <Flashcards />,
      });
    });
    return null;
  };
  const dispose = render(
    () => (
      <LayerProvider>
        <WindowManagerProvider>
          <ContextMenuProvider>
            <Launcher />
            <WindowsOutlet />
          </ContextMenuProvider>
        </WindowManagerProvider>
      </LayerProvider>
    ),
    root,
  );
  return () => {
    dispose();
    root.remove();
    filesystem.list = originalList;
    filesystem.readFile = originalReadFile;
    filesystem.writeFile = originalWriteFile;
  };
}

/** Mounts a card whose front asset remains pending until its stream is aborted. */
export function mountPendingCardFixture() {
  const root = document.createElement("div");
  document.body.append(root);
  const [html, setHtml] = createSignal('<p>Front</p><img src="assets/pending.png">');
  const subject = {
    getAsset() {
      return {
        size: 1,
        openStream({ signal }: { signal: AbortSignal }) {
          return new ReadableStream({
            start(controller) {
              root.dataset.asset = "loading";
              signal.addEventListener(
                "abort",
                () => {
                  root.dataset.asset = "aborted";
                  controller.error(signal.reason);
                },
                { once: true },
              );
            },
          });
        },
      };
    },
  } as unknown as OpenSubjectPackage;
  const flip = () => setHtml("<p>Back</p>");
  const select = () => {};
  render(
    () => (
      <>
        <button onClick={flip}>Flip fixture card</button>
        <FixtureSubject subject={subject}>
          <UserHtml html={html()} title="Flashcard" onSelect={select} />
        </FixtureSubject>
      </>
    ),
    root,
  );
}
