// @vitest-environment happy-dom

import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatIsoDateTime } from "../../lib/iso-date-time";
import { Model } from "./data";
import Kodekai from "./Kodekai";

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

function pointerEvent(type: string, clientX: number, clientY: number) {
  return new PointerEvent(type, { bubbles: true, button: 0, clientX, clientY, pointerId: 1 });
}

function renderBoard() {
  const model = Model.empty();
  const projectId = model.createProject({ title: "Cloudready" });
  const expiration = formatIsoDateTime(new Date("2026-09-27T15:30:00.000Z"));
  const firstId = model.createCard({ projectId, title: "First", expiration });
  const secondId = model.createCard({ projectId, title: "Second", expiration });
  const thirdId = model.createCard({ projectId, title: "Third", expiration });
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = render(() => <Kodekai model={model} />, container);
  const board = container.querySelector<HTMLElement>('[x-role="kodekai"]')!;
  const icebox = container.querySelector<HTMLUListElement>('[data-kodekai-bucket="icebox"]')!;
  const inProgress = container.querySelector<HTMLUListElement>(
    '[data-kodekai-bucket="in-progress"]',
  )!;
  const source = icebox.querySelectorAll<HTMLLIElement>("[data-kodekai-card]")[0];

  const listRects = new Map<HTMLElement, DOMRect>([
    [icebox, rect(0, 0, 256, 220)],
    [inProgress, rect(300, 0, 256, 220)],
  ]);
  const cardRects = new Map<HTMLElement, DOMRect>([
    [source, rect(0, 20, 256, 40)],
    [icebox.querySelectorAll<HTMLLIElement>("[data-kodekai-card]")[1], rect(0, 70, 256, 40)],
    [icebox.querySelectorAll<HTMLLIElement>("[data-kodekai-card]")[2], rect(0, 120, 256, 40)],
  ]);
  const boundingRect = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      return cardRects.get(this) ?? listRects.get(this) ?? rect(0, 0, 0, 0);
    });

  return {
    board,
    boundingRect,
    container,
    dispose: () => {
      dispose();
      container.remove();
    },
    firstId,
    inProgress,
    model,
    secondId,
    source,
    thirdId,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("Kodekai card dragging", () => {
  it("uses a clone preview and reorders without shifting the source before drop", () => {
    const { boundingRect, container, dispose, firstId, model, secondId, source, thirdId } =
      renderBoard();

    source.dispatchEvent(pointerEvent("pointerdown", 10, 30));
    document.dispatchEvent(pointerEvent("pointermove", 12, 32));

    expect(source.className).not.toContain("opacity-0");
    expect(container.querySelector("[data-kodekai-drop-indicator]")).toBeNull();

    document.dispatchEvent(pointerEvent("pointermove", 10, 180));

    const preview = container.querySelector<HTMLLIElement>('li[aria-hidden="true"]');
    expect(preview).not.toBeNull();
    expect(preview?.style.position).toBe("fixed");
    expect(preview?.style.width).toBe("256px");
    expect(source.className).toContain("opacity-0");
    expect(source.getBoundingClientRect().top).toBe(20);
    expect(container.querySelector("[data-kodekai-drop-indicator]")?.className).toContain(
      "absolute",
    );

    document.dispatchEvent(pointerEvent("pointerup", 10, 180));

    expect(model.listCards(model.getCard(firstId).projectId).map((card) => card.id)).toEqual([
      secondId,
      thirdId,
      firstId,
    ]);
    expect(container.querySelector('li[aria-hidden="true"]')).toBeNull();
    expect(source.className).not.toContain("opacity-0");
    boundingRect.mockRestore();
    dispose();
  });

  it("moves a card into an empty bucket at display index zero", () => {
    const { dispose, firstId, inProgress, model, source } = renderBoard();

    source.dispatchEvent(pointerEvent("pointerdown", 10, 30));
    document.dispatchEvent(pointerEvent("pointermove", 320, 20));
    document.dispatchEvent(pointerEvent("pointerup", 320, 20));

    expect(model.getCard(firstId)).toMatchObject({ bucket: "in-progress", displayIndex: 0 });
    expect(inProgress.querySelectorAll("[data-kodekai-card]")).toHaveLength(1);
    dispose();
  });

  it("hides no-op drop targets immediately around the source card", () => {
    const { container, dispose, source } = renderBoard();

    source.dispatchEvent(pointerEvent("pointerdown", 10, 30));
    document.dispatchEvent(pointerEvent("pointermove", 10, 50));

    expect(container.querySelector("[data-kodekai-drop-indicator]")).toBeNull();
    document.dispatchEvent(pointerEvent("pointercancel", 10, 50));
    dispose();
  });

  it("supports insertion before and between cards", () => {
    const firstBoard = renderBoard();
    const lastCard = firstBoard.container
      .querySelectorAll<HTMLLIElement>("[data-kodekai-card]")
      .item(2);

    lastCard.dispatchEvent(pointerEvent("pointerdown", 10, 130));
    document.dispatchEvent(pointerEvent("pointermove", 10, 5));
    document.dispatchEvent(pointerEvent("pointerup", 10, 5));

    expect(
      firstBoard.model
        .listCards(firstBoard.model.getCard(firstBoard.firstId).projectId)
        .map((card) => card.id),
    ).toEqual([firstBoard.thirdId, firstBoard.firstId, firstBoard.secondId]);
    firstBoard.dispose();

    const betweenBoard = renderBoard();
    betweenBoard.source.dispatchEvent(pointerEvent("pointerdown", 10, 30));
    document.dispatchEvent(pointerEvent("pointermove", 10, 110));
    document.dispatchEvent(pointerEvent("pointerup", 10, 110));

    expect(
      betweenBoard.model
        .listCards(betweenBoard.model.getCard(betweenBoard.firstId).projectId)
        .map((card) => card.id),
    ).toEqual([betweenBoard.secondId, betweenBoard.firstId, betweenBoard.thirdId]);
    betweenBoard.dispose();
  });

  it("cancels an active drag without mutating the model", () => {
    const { dispose, firstId, model, source } = renderBoard();

    source.dispatchEvent(pointerEvent("pointerdown", 10, 30));
    document.dispatchEvent(pointerEvent("pointermove", 10, 120));
    document.dispatchEvent(pointerEvent("pointercancel", 10, 120));

    expect(model.getCard(firstId)).toMatchObject({ bucket: "icebox", displayIndex: 0 });
    expect(document.querySelector('li[aria-hidden="true"]')).toBeNull();

    source.dispatchEvent(pointerEvent("pointerdown", 10, 30));
    document.dispatchEvent(pointerEvent("pointermove", 600, 300));
    document.dispatchEvent(pointerEvent("pointerup", 600, 300));

    expect(model.getCard(firstId)).toMatchObject({ bucket: "icebox", displayIndex: 0 });
    dispose();
  });
});
