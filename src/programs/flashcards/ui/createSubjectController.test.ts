import { createRoot } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import { filesystem } from "../../../filesystem/FileSystemClient";
import { openSubjectPackage } from "../core/subject-package/package";
import type { OpenSubjectPackage } from "../core/subject-package/types";
import { createSubjectController } from "./createSubjectController";

vi.mock("../../../filesystem/FileSystemClient", () => ({ filesystem: { readFile: vi.fn() } }));
vi.mock("../core/subject-package/package", () => ({ openSubjectPackage: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("retains the old subject on failure, closes replacements and cleans up on disposal", async () => {
  const first = { close: vi.fn().mockResolvedValue(undefined) } as unknown as OpenSubjectPackage;
  const second = { close: vi.fn().mockResolvedValue(undefined) } as unknown as OpenSubjectPackage;
  vi.mocked(filesystem.readFile).mockResolvedValue(new Blob());
  vi.mocked(openSubjectPackage)
    .mockResolvedValueOnce(first)
    .mockRejectedValueOnce(new Error("bad file"))
    .mockResolvedValueOnce(second);
  let dispose!: () => void;
  const controller = createRoot((stop) => {
    dispose = stop;
    return createSubjectController();
  });
  await controller.openFile("/first.lap");
  controller.setSelection("lesson");
  await controller.openFile("/bad.lap");
  expect(controller.subject()).toBe(first);
  expect(controller.error()).toBe("bad file");
  await controller.openFile("/second.lap");
  expect(first.close).toHaveBeenCalledOnce();
  expect(controller.selection()).toBeNull();
  expect(controller.subject()).toBe(second);
  dispose();
  expect(second.close).toHaveBeenCalledOnce();
});

it("closes a stale package when a newer open wins", async () => {
  let resolveFirst!: (value: OpenSubjectPackage) => void;
  const stale = { close: vi.fn().mockResolvedValue(undefined) } as unknown as OpenSubjectPackage;
  const latest = { close: vi.fn().mockResolvedValue(undefined) } as unknown as OpenSubjectPackage;
  vi.mocked(filesystem.readFile).mockResolvedValue(new Blob());
  vi.mocked(openSubjectPackage)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce(latest);
  let dispose!: () => void;
  const controller = createRoot((stop) => {
    dispose = stop;
    return createSubjectController();
  });
  const first = controller.openFile("/first.lap");
  await Promise.resolve();
  await controller.openFile("/latest.lap");
  resolveFirst(stale);
  await first;
  expect(stale.close).toHaveBeenCalledOnce();
  expect(controller.subject()).toBe(latest);
  dispose();
});
