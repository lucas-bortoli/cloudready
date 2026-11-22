// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import type { PlaybackEvent } from "./PlayerController";

const mocks = vi.hoisted(() => ({
  showDialog: vi.fn(() => ({ result: Promise.resolve("ok") })),
  notify: null as ((event: PlaybackEvent) => void) | null,
}));

vi.mock("../../components/dialog/Dialog", () => ({ default: () => mocks.showDialog }));
vi.mock("../../components/window-manager/useWindowCloser", () => ({ default: () => {} }));
vi.mock("../file-manager/file-picker/FilePicker", () => ({
  default: () => ({ isOpen: () => false, show: () => Promise.resolve([]) }),
  FilePickerCancelledError: class extends Error {},
}));
vi.mock("./BrowserPlaybackAdapter", () => ({
  default: class {
    attach() {}
    open(_url: string, notify: (event: PlaybackEvent) => void) {
      mocks.notify = notify;
    }
    async play() {}
    pause() {}
    seek() {}
    setVolume() {}
    clear() {}
    dispose() {}
  },
}));
vi.mock("./DefaultSkin", () => ({
  default: (props: { controller: { add: (items: { name: string; url: string }[]) => void } }) => (
    <button onClick={() => props.controller.add([{ name: "one", url: "/one" }])}>Add</button>
  ),
}));

import MediaPlayer from "./MediaPlayer";

it("shows playback errors in a dialog without repeating it for unrelated state updates", async () => {
  mocks.showDialog.mockClear();
  const { artifact } = await captureArtifact(async () => {
    const container = document.createElement("div");
    const dispose = render(() => <MediaPlayer />, container);
    container.querySelector("button")!.click();
    flush();
    mocks.notify!({ type: "error" });
    flush();
    expect(mocks.showDialog).toHaveBeenCalledOnce();
    expect(mocks.showDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Playback error" }),
    );
    mocks.notify!({ type: "time", time: 1, duration: 10 });
    flush();
    expect(mocks.showDialog).toHaveBeenCalledOnce();
    dispose();
  });
  expectNoDiagnostics(artifact);
});
