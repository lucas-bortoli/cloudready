// @vitest-environment happy-dom
import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { expect, it, vi } from "vitest";
import { Model } from "../model/model";
import Card from "./Card";

it("updates truncated text and disconnects its resize observer", async () => {
  const disconnect = vi.fn();
  const observe = vi.fn();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const runFrame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
    flush();
  };
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  let resize!: ResizeObserverCallback;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  try {
    const { artifact } = await captureArtifact(
      async () => {
        const model = Model.empty();
        const projectId = model.createProject({ title: "Project" });
        const cardId = model.createCard({ projectId, title: "First", content: "Content" });
        const initial = model.getCard(cardId)!;
        const root = document.createElement("ul");
        let update!: (card: typeof initial) => unknown;
        const dispose = render(() => {
          const [card, setCard] = createSignal(initial);
          update = setCard;
          return (
            <Card
              card={card()}
              tags={[]}
              draggingCardId={() => undefined}
              onSelect={() => {}}
              shouldSuppressClick={() => false}
            />
          );
        }, root);
        flush();
        await Promise.resolve();
        runFrame();
        expect(root.querySelector("h2")?.textContent).toBe("First");
        expect(root.querySelector("p")?.textContent).toBe("Content");
        expect(observe).toHaveBeenCalledOnce();
        update({ ...initial, title: "Updated", content: "Changed" });
        flush();
        runFrame();
        expect(root.querySelector("h2")?.textContent).toBe("Updated");
        expect(root.querySelector("p")?.textContent).toBe("Changed");
        resize([], {} as ResizeObserver);
        flush();
        expect(frames.size).toBe(1);
        dispose();
        expect(disconnect).toHaveBeenCalledOnce();
        expect(frames.size).toBe(0);
      },
      { scenario: "kodekai-card-text" },
    );
    expectNoDiagnostics(artifact);
  } finally {
    vi.unstubAllGlobals();
  }
});
