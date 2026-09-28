// @vitest-environment happy-dom

import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { formatIsoDateTime } from "../../../lib/iso-date-time";
import { Model } from "../model/model";
import CardEditor from "./CardEditor";

function renderEditor(card?: ReturnType<Model["getCard"]>) {
  const projectId = Model.empty().createProject({ title: "Project" });
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
      <CardEditor
        card={card}
        projectId={projectId}
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

describe("CardEditor", () => {
  it("creates a card with entered values and keeps its backdrop within the board root", () => {
    const { dispose, onCreate, root } = renderEditor();
    const title = root.querySelector("textarea")!;
    title.value = "Write tests";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    const form = root.querySelector("form")!;
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    const createdCard = onCreate.mock.calls[0][0];
    expect(createdCard).toMatchObject({
      title: "Write tests",
      priority: "normal",
      bucket: "icebox",
    });
    expect(new Date(createdCard.expiration).toISOString()).toContain(
      root.querySelector<HTMLInputElement>('input[type="date"]')!.value,
    );
    expect(root.querySelector('[x-role="kodekai card editor backdrop"]')?.parentElement).toBe(root);
    expect(root.querySelector('[x-role="kodekai card editor"]')).not.toBeNull();
    expect(root.querySelector('[role="dialog"]')?.closest('[x-role="kodekai"]')).toBe(root);
    dispose();
    root.remove();
  });

  it("edits the selected card and requires a title", () => {
    const model = Model.empty();
    const projectId = model.createProject({ title: "Project" });
    const id = model.createCard({
      projectId,
      title: "Original",
      expiration: formatIsoDateTime(new Date("2026-09-27T12:00:00.000Z")),
    });
    const card = model.getCard(id);
    const { dispose, onUpdate, root } = renderEditor(card);
    root.querySelector("textarea")!.value = "  ";
    root.querySelector("textarea")!.dispatchEvent(new Event("input", { bubbles: true }));
    root
      .querySelector("form")!
      .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    expect(onUpdate).not.toHaveBeenCalled();

    root.querySelector("textarea")!.value = "Updated";
    root.querySelector("textarea")!.dispatchEvent(new Event("input", { bubbles: true }));
    const prioritySelect = root.querySelector("select")!;
    prioritySelect.value = "urgent";
    prioritySelect.dispatchEvent(new Event("change", { bubbles: true }));
    root
      .querySelector("form")!
      .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    expect(onUpdate).toHaveBeenCalledWith(
      card,
      expect.objectContaining({ priority: "urgent", title: "Updated" }),
    );
    dispose();
    root.remove();
  });

  it("confirms before deleting an existing card", () => {
    vi.useFakeTimers();
    const model = Model.empty();
    const projectId = model.createProject({ title: "Project" });
    const card = model.getCard(model.createCard({ projectId, title: "Original" }));
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    const { dispose, onClose, onDelete, root } = renderEditor(card);
    const deleteButton = [...root.querySelectorAll("button")].find(
      (button) => button.textContent === "Excluir cartão",
    )!;

    deleteButton.click();
    expect(onDelete).not.toHaveBeenCalled();
    deleteButton.click();
    expect(onDelete).toHaveBeenCalledWith(card);
    expect(root.querySelector(".kodekai-editor-closing")).not.toBeNull();
    vi.runAllTimers();
    expect(onClose).toHaveBeenCalledOnce();
    dispose();
    root.remove();
  });

  it("cancels without submitting changes", () => {
    vi.useFakeTimers();
    const { dispose, onClose, onCreate, root } = renderEditor();
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent === "Cancelar")!
      .click();
    expect(root.querySelector(".kodekai-editor-closing")).not.toBeNull();
    vi.runAllTimers();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onCreate).not.toHaveBeenCalled();
    dispose();
    root.remove();
  });

  it("asks before discarding dirty changes from every close control", () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    const { dispose, onClose, root } = renderEditor();
    const title = root.querySelector("textarea")!;
    title.value = "Unsaved card";
    title.dispatchEvent(new Event("input", { bubbles: true }));

    [...root.querySelectorAll("button")]
      .find((button) => button.textContent === "Cancelar")!
      .click();
    title.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    root
      .querySelector('[x-role="kodekai card editor backdrop"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(confirm).toHaveBeenCalledTimes(3);
    expect(onClose).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    dispose();
    root.remove();
  });

  it("closes a dirty editor after confirming that its changes should be discarded", () => {
    vi.useFakeTimers();
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    const { dispose, onClose, root } = renderEditor();
    const title = root.querySelector("textarea")!;
    title.value = "Unsaved card";
    title.dispatchEvent(new Event("input", { bubbles: true }));

    [...root.querySelectorAll("button")]
      .find((button) => button.textContent === "Cancelar")!
      .click();

    vi.runAllTimers();

    expect(onClose).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
    dispose();
    root.remove();
  });

  it("focuses the title, traps tab navigation, and closes with Escape", () => {
    vi.useFakeTimers();
    const { dispose, onClose, root } = renderEditor();
    const focusable = [...root.querySelectorAll<HTMLElement>("textarea, select, input, button")];
    const title = focusable[0];
    const last = focusable.at(-1)!;

    expect(document.activeElement).toBe(title);

    for (const element of focusable) {
      Object.defineProperty(element, "getClientRects", {
        value: () => [{ width: 1, height: 1 }],
      });
    }
    last.focus();
    last.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" }),
    );
    expect(document.activeElement).toBe(title);

    title.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    vi.runAllTimers();
    expect(onClose).toHaveBeenCalledOnce();
    dispose();
    root.remove();
  });
});
