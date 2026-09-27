// @vitest-environment happy-dom

import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatIsoDateTime } from "../../lib/iso-date-time";
import { Model } from "./model/model";
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

function keyboardEvent(key: string) {
  return new KeyboardEvent("keydown", { bubbles: true, key, shiftKey: true });
}

function findCard(container: ParentNode, cardId: string) {
  return Array.from(container.querySelectorAll<HTMLLIElement>("[data-kodekai-card]")).find(
    (card) => card.dataset.kodekaiCard === cardId,
  )!;
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
    cardRects,
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

    source.focus();
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

    const movedCard = Array.from(
      container.querySelectorAll<HTMLLIElement>("[data-kodekai-card]"),
    ).find((card) => card.dataset.kodekaiCard === firstId)!;
    expect(document.activeElement).toBe(movedCard);
    movedCard.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(model.listCards(model.getCard(firstId).projectId).map((card) => card.id)).toEqual([
      secondId,
      thirdId,
      firstId,
    ]);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
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

describe("Kodekai card keyboard navigation", () => {
  it("reorders cards vertically and retains focus", () => {
    const { dispose, firstId, model, secondId, source, thirdId } = renderBoard();

    source.focus();
    source.dispatchEvent(keyboardEvent("ArrowDown"));

    expect(model.listCards(model.getCard(firstId).projectId).map((card) => card.id)).toEqual([
      secondId,
      firstId,
      thirdId,
    ]);
    const movedDownCard = findCard(document, firstId);
    expect(document.activeElement).toBe(movedDownCard);

    movedDownCard.dispatchEvent(keyboardEvent("ArrowUp"));

    expect(model.listCards(model.getCard(firstId).projectId).map((card) => card.id)).toEqual([
      firstId,
      secondId,
      thirdId,
    ]);
    expect(document.activeElement).toBe(findCard(document, firstId));
    dispose();
  });

  it("keeps cards in place at the top and bottom of a bucket", () => {
    const { dispose, firstId, model, source, thirdId } = renderBoard();
    const lastCard = Array.from(
      document.querySelectorAll<HTMLLIElement>("[data-kodekai-card]"),
    ).find((card) => card.dataset.kodekaiCard === thirdId)!;

    source.dispatchEvent(keyboardEvent("ArrowUp"));
    lastCard.dispatchEvent(keyboardEvent("ArrowDown"));

    expect(model.getCard(firstId)).toMatchObject({ bucket: "icebox", displayIndex: 0 });
    expect(model.getCard(thirdId)).toMatchObject({ bucket: "icebox", displayIndex: 2 });
    dispose();
  });

  it("moves cards horizontally to the matching visual row and retains focus", () => {
    const { cardRects, dispose, firstId, inProgress, model, secondId, thirdId } = renderBoard();

    model.moveCard(secondId, { bucket: "in-progress", displayIndex: 0 });
    model.moveCard(thirdId, { bucket: "in-progress", displayIndex: 1 });
    const destinationCards = inProgress.querySelectorAll<HTMLLIElement>("[data-kodekai-card]");
    cardRects.set(destinationCards[0], rect(300, 10, 256, 40));
    cardRects.set(destinationCards[1], rect(300, 60, 256, 40));

    const currentSource = findCard(document, firstId);
    cardRects.set(currentSource, rect(0, 20, 256, 40));
    currentSource.focus();
    currentSource.dispatchEvent(keyboardEvent("ArrowRight"));

    expect(model.getCard(firstId)).toMatchObject({ bucket: "in-progress", displayIndex: 1 });
    expect(model.listCards(model.getCard(firstId).projectId).map((card) => card.id)).toEqual([
      secondId,
      firstId,
      thirdId,
    ]);
    const movedCard = findCard(inProgress, firstId);
    expect(document.activeElement).toBe(movedCard);
    dispose();
  });

  it("does not move cards beyond the outermost buckets", () => {
    const { dispose, firstId, model, source } = renderBoard();

    source.dispatchEvent(keyboardEvent("ArrowLeft"));

    expect(model.getCard(firstId)).toMatchObject({ bucket: "icebox", displayIndex: 0 });
    dispose();
  });
});
