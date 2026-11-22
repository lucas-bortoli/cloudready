// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { expect, it, vi } from "vitest";
import DefaultSkin from "./DefaultSkin";
import PlayerController, { type PlaybackAdapter } from "./PlayerController";

it("removes the selected queue item through the button without diagnostics", async () => {
  const { artifact } = await captureArtifact(async () => {
    const adapter: PlaybackAdapter = {
      open: vi.fn(),
      play: vi.fn(async () => {}),
      pause: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    const controller = new PlayerController(adapter);
    const [state, setState] = createSignal(controller.getSnapshot());
    const unsubscribe = controller.subscribe(() => setState(controller.getSnapshot()));
    const container = document.createElement("div");
    const dispose = render(
      () => (
        <DefaultSkin
          state={state()}
          controller={controller}
          pickerOpen={false}
          onAddFiles={() => {}}
          attachVideo={() => {}}
        />
      ),
      container,
    );
    const button = container.querySelector<HTMLButtonElement>('button[title="Remove selected"]')!;
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector('[role="listbox"]')?.getAttribute("aria-label")).toBe(
      "Playback queue",
    );
    controller.add([{ name: "one", url: "/one" }]);
    flush();
    expect(button.getAttribute("aria-disabled")).toBeNull();
    button.click();
    flush();
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(adapter.clear).toHaveBeenCalledOnce();
    dispose();
    unsubscribe();
    controller.dispose();
  });
  expectNoDiagnostics(artifact);
});

it("formats elapsed and total time with matching hour fields", async () => {
  const { artifact } = await captureArtifact(async () => {
    const adapter: PlaybackAdapter = {
      open: vi.fn(),
      play: vi.fn(async () => {}),
      pause: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    const controller = new PlayerController(adapter);
    const [state, setState] = createSignal(controller.getSnapshot());
    const container = document.createElement("div");
    const dispose = render(
      () => (
        <DefaultSkin
          state={state()}
          controller={controller}
          pickerOpen={false}
          onAddFiles={() => {}}
          attachVideo={() => {}}
        />
      ),
      container,
    );
    const slider = container.querySelector('[role="slider"][aria-label="Seek"]')!;
    const times = () => slider.nextElementSibling?.textContent;
    expect(times()).toBe("00:00 / 00:00");
    setState({ ...controller.getSnapshot(), time: 65.9, duration: 3599 });
    flush();
    expect(times()).toBe("01:05 / 59:59");
    setState({ ...controller.getSnapshot(), time: 65, duration: 3601 });
    flush();
    expect(times()).toBe("00:01:05 / 01:00:01");
    dispose();
    controller.dispose();
  });
  expectNoDiagnostics(artifact);
});
