// @vitest-environment happy-dom

import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { LayerProvider, useLayerItem, useLayerManager } from "./LayerContext";
import LayerManager, { DisposedLayerItemError, type Layer, type LayerItem } from "./LayerManager";

describe("LayerManager", () => {
  it("assigns contiguous z-indexes in fixed layer order", () => {
    const manager = new LayerManager();
    const window = manager.createItem("windowing");
    const background = manager.createItem("background");
    const toast = manager.createItem("toasts");

    expect([background.zIndex(), window.zIndex(), toast.zIndex()]).toEqual([0, 1, 2]);
  });

  it("reorders items within their layer", () => {
    const manager = new LayerManager();
    const first = manager.createItem("windowing");
    const second = manager.createItem("windowing");
    const third = manager.createItem("windowing");

    third.sendBack();
    expect([first.zIndex(), second.zIndex(), third.zIndex()]).toEqual([0, 2, 1]);
    third.sendForward();
    expect([first.zIndex(), second.zIndex(), third.zIndex()]).toEqual([0, 1, 2]);
    first.bringToTop();
    expect([first.zIndex(), second.zIndex(), third.zIndex()]).toEqual([2, 0, 1]);
    first.sendToBottom();
    expect([first.zIndex(), second.zIndex(), third.zIndex()]).toEqual([0, 1, 2]);
  });

  it("moves an item to the front of its destination layer", () => {
    const manager = new LayerManager();
    const window = manager.createItem("windowing");
    const pinned = manager.createItem("windowing:pinned");
    const shell = manager.createItem("shell");

    window.moveToLayer("shell");

    expect([pinned.zIndex(), shell.zIndex(), window.zIndex()]).toEqual([0, 1, 2]);
  });

  it("recalculates indexes when an item is disposed and rejects later operations", () => {
    const manager = new LayerManager();
    const first = manager.createItem("windowing");
    const second = manager.createItem("windowing");

    first.dispose();

    expect(second.zIndex()).toBe(0);
    expect(() => first.bringToTop()).toThrow(DisposedLayerItemError);
  });
});

function TestItem(props: { layer: Layer; onItem: (item: LayerItem) => void }) {
  props.onItem(useLayerItem(props.layer));
  return null;
}

function LayerCleanupTest(props: {
  onItems: (items: { first: LayerItem; second: LayerItem }) => void;
}) {
  const manager = useLayerManager();
  const [showFirst, setShowFirst] = createSignal(true);
  let first: LayerItem | undefined;
  let second: LayerItem | undefined;

  return (
    <>
      <Show when={showFirst()}>
        <TestItem layer="windowing" onItem={(item) => (first = item)} />
      </Show>
      <TestItem layer="windowing" onItem={(item) => (second = item)} />
      <button
        type="button"
        onClick={() => {
          if (!first || !second) throw new Error("Test items did not mount.");
          props.onItems({ first, second });
          setShowFirst(false);
        }}
      >
        remove
      </button>
      <span data-manager={manager ? "present" : "missing"} />
    </>
  );
}

describe("useLayerItem", () => {
  it("releases an item when its component unmounts", () => {
    const container = document.createElement("div");
    document.body.append(container);
    let items: { first: LayerItem; second: LayerItem } | undefined;
    const dispose = render(
      () => (
        <LayerProvider>
          <LayerCleanupTest onItems={(nextItems) => (items = nextItems)} />
        </LayerProvider>
      ),
      container,
    );

    container.querySelector<HTMLButtonElement>("button")?.click();

    const mountedItems = items;
    if (!mountedItems) throw new Error("Test items did not mount.");
    expect(mountedItems.second.zIndex()).toBe(0);
    expect(() => mountedItems.first.sendToBottom()).toThrow(DisposedLayerItemError);

    dispose();
    container.remove();
  });
});
