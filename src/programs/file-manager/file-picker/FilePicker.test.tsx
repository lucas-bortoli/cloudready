// @vitest-environment happy-dom

import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { createRoot } from "solid-js";
import { expect, it, vi } from "vitest";
import useFilePicker, { FilePickerCancelledError, FilePickerExistsError } from "./FilePicker";

const { manager } = vi.hoisted(() => ({
  manager: {
    createWindow: vi.fn(() => "picker-window"),
    destroyWindow: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
  },
}));

vi.mock("../../../components/window-manager/WindowManagerContext", () => ({
  useWindowManager: () => manager,
}));

it("rejects duplicate opens and cancels a picker disposed before settlement", async () => {
  const { artifact } = await captureArtifact(
    async () => {
      let dispose = () => {};
      const picker = createRoot((cleanup) => {
        dispose = cleanup;
        return useFilePicker({ type: "directory" });
      });

      const first = picker.show();
      const cancelled = expect(first).rejects.toBeInstanceOf(FilePickerCancelledError);
      const duplicate = expect(picker.show()).rejects.toBeInstanceOf(FilePickerExistsError);
      expect(manager.createWindow).toHaveBeenCalledOnce();
      dispose();
      await Promise.all([cancelled, duplicate]);
      await Promise.resolve();
      expect(manager.destroyWindow).toHaveBeenCalledTimes(2);
      expect(manager.destroyWindow).toHaveBeenLastCalledWith("picker-window");
    },
    { scenario: "file-picker-immediate-lifecycle" },
  );
  expectNoDiagnostics(artifact);
});
