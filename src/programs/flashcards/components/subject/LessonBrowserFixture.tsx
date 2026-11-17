import { render } from "solid-js/web";
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
