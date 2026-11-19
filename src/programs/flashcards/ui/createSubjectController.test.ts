import { createRoot } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import { filesystem } from "../../../filesystem/FileSystemClient";
import { openSubjectPackage } from "../core/subject-package/package";
import type { OpenSubjectPackage } from "../core/subject-package/types";
import { createSubjectController } from "./createSubjectController";

vi.mock("../../../filesystem/FileSystemClient", () => ({ filesystem: { readFile: vi.fn() } }));
vi.mock("../core/subject-package/package", () => ({ openSubjectPackage: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("retains open subjects on failure, replaces matching paths and cleans up on disposal", async () => {
  const first = { close: vi.fn().mockResolvedValue(undefined) } as unknown as OpenSubjectPackage;
  const second = { close: vi.fn().mockResolvedValue(undefined) } as unknown as OpenSubjectPackage;
  const replacement = {
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as OpenSubjectPackage;
  vi.mocked(filesystem.readFile).mockResolvedValue(new Blob());
  vi.mocked(openSubjectPackage)
    .mockResolvedValueOnce(first)
    .mockRejectedValueOnce(new Error("bad file"))
    .mockResolvedValueOnce(second)
    .mockResolvedValueOnce(replacement);
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
  expect(first.close).not.toHaveBeenCalled();
  expect(controller.subjects()).toEqual([
    { path: "/first.lap", subject: first },
    { path: "/second.lap", subject: second },
  ]);
  expect(controller.selection()).toBeNull();
  expect(controller.subject()).toBe(second);
  await controller.openFile("/first.lap");
  expect(first.close).toHaveBeenCalledOnce();
  expect(controller.subjects()).toEqual([
    { path: "/second.lap", subject: second },
    { path: "/first.lap", subject: replacement },
  ]);
  dispose();
  expect(second.close).toHaveBeenCalledOnce();
  expect(replacement.close).toHaveBeenCalledOnce();
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
