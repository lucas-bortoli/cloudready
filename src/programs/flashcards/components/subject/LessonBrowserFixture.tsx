import { onMount } from "solid-js";
import { render } from "solid-js/web";
import { LayerProvider } from "../../../../components/layer-manager/LayerContext";
import { ContextMenuProvider } from "../../../../components/context-menu/ContextMenuContext";
import {
  WindowManagerProvider,
  useWindowManager,
} from "../../../../components/window-manager/WindowManagerContext";
import WindowsOutlet from "../../../../components/window-manager/WindowsOutlet";
import { filesystem } from "../../../../filesystem/FileSystemClient";
import Flashcards from "../../Flashcards";
import type { OpenSubjectPackage } from "../../core/subject-package/types";
import { LessonView } from "./LessonView";

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
      <LessonView
        html={html}
        subject={subject}
        onSelect={(id) => root.setAttribute("data-selected", id)}
      />
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
  filesystem.list = async () => [
    {
      id: "00000000-0000-4000-8000-000000000000" as never,
      path: "/spanish-starter.lap",
      name: "spanish-starter.lap",
      kind: "file",
      size: sample.size,
      mimeType: "application/octet-stream",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  filesystem.readFile = async () => sample;
  const Launcher = () => {
    const manager = useWindowManager();
    onMount(() => {
      manager.createWindow({
        title: "LAP",
        size: { width: 800, height: 600 },
        minimumSize: { width: 320, height: 360 },
        content: () => <Flashcards userId="test" />,
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
  };
}
