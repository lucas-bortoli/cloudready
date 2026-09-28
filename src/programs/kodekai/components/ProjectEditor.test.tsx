// @vitest-environment happy-dom

import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Model } from "../model/model";
import ProjectEditor from "./ProjectEditor";

function renderEditor(project?: ReturnType<Model["getProject"]>) {
  const onClose = vi.fn();
  const onCreate = vi.fn();
  const onDelete = vi.fn();
  const onUpdate = vi.fn();
  const root = document.createElement("section");
  root.setAttribute("x-role", "kodekai");
  root.className = "relative";
  document.body.append(root);
  const dispose = render(
    () => (
      <ProjectEditor
        project={project}
        onClose={onClose}
        onCreate={onCreate}
        onDelete={onDelete}
        onUpdate={onUpdate}
      />
    ),
    root,
  );
  return { dispose, onClose, onCreate, onDelete, onUpdate, root };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("ProjectEditor", () => {
  it("creates a trimmed project title and requires a title", () => {
    const { dispose, onCreate, root } = renderEditor();
    const title = root.querySelector("textarea")!;

    title.value = "  ";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    root
      .querySelector("form")!
      .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    expect(onCreate).not.toHaveBeenCalled();

    title.value = "  Website  ";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    root
      .querySelector("form")!
      .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    expect(onCreate).toHaveBeenCalledWith("Website");
    dispose();
  });

  it("updates the supplied project", () => {
    const model = Model.empty();
    const project = model.getProject(model.createProject({ title: "Original" }));
    const { dispose, onUpdate, root } = renderEditor(project);
    const title = root.querySelector("textarea")!;
    title.value = "Updated";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    root
      .querySelector("form")!
      .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    expect(onUpdate).toHaveBeenCalledWith(project, "Updated");
    dispose();
  });

  it("confirms before discarding changes and before deleting a project", () => {
    const model = Model.empty();
    const project = model.getProject(model.createProject({ title: "Project" }));
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    const { dispose, onClose, onDelete, root } = renderEditor(project);
    const title = root.querySelector("textarea")!;
    title.value = "Unsaved";
    title.dispatchEvent(new Event("input", { bubbles: true }));

    [...root.querySelectorAll("button")]
      .find((button) => button.textContent === "Cancelar")!
      .click();
    title.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    root
      .querySelector('[x-role="kodekai project editor backdrop"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent === "Excluir projeto")!
      .click();

    expect(confirm).toHaveBeenCalledTimes(4);
    expect(onClose).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    dispose();
  });

  it("deletes after confirmation and focuses the title on open", () => {
    const model = Model.empty();
    const project = model.getProject(model.createProject({ title: "Project" }));
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const { dispose, onDelete, root } = renderEditor(project);

    expect(document.activeElement).toBe(root.querySelector("textarea"));
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent === "Excluir projeto")!
      .click();
    expect(onDelete).toHaveBeenCalledWith(project);
    dispose();
  });
});
