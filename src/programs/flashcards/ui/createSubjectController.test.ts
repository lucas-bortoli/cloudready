import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { createRoot, flush } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import { filesystem } from "../../../filesystem/FileSystemClient";
import { openSubjectPackage, writeSubjectPackage } from "../core/subject-package/package";
import type { OpenSubjectPackage } from "../core/subject-package/types";
import { createSubjectController } from "./createSubjectController";

vi.mock("../../../filesystem/FileSystemClient", () => ({
  filesystem: { readFile: vi.fn(), writeFile: vi.fn() },
}));
vi.mock("../core/subject-package/package", () => ({
  openSubjectPackage: vi.fn(),
  writeSubjectPackage: vi.fn(),
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("restores stored subjects without reactive write diagnostics", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify(["/restored.lap"]),
    setItem: vi.fn(),
  });
  const subject = { close: vi.fn().mockResolvedValue(undefined) } as unknown as OpenSubjectPackage;
  vi.mocked(filesystem.readFile).mockResolvedValue(new Blob());
  vi.mocked(openSubjectPackage).mockResolvedValue(subject);

  const { artifact } = await captureArtifact(
    async () => {
      const { controller, dispose } = createRoot((dispose) => ({
        controller: createSubjectController(),
        dispose,
      }));
      flush();
      try {
        await vi.waitFor(() => expect(controller.subjects()).toHaveLength(1));
      } finally {
        dispose();
      }
    },
    { scenario: "subject-controller-restore" },
  );
  expectNoDiagnostics(artifact);
  expect(subject.close).toHaveBeenCalledOnce();
});

it("remembers opened paths and restores them in a new controller", async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.mocked(filesystem.readFile).mockResolvedValue(new Blob());
  vi.mocked(openSubjectPackage).mockImplementation(
    async () => ({ close: vi.fn().mockResolvedValue(undefined) }) as unknown as OpenSubjectPackage,
  );
  const mount = () => createRoot((dispose) => ({ controller: createSubjectController(), dispose }));
  const first = mount();
  await first.controller.openFile("/first.lap");
  await first.controller.openFile("/second.lap");
  first.dispose();

  const restored = mount();
  flush();
  try {
    await vi.waitFor(() =>
      expect(restored.controller.subjects().map((entry) => entry.path)).toEqual([
        "/first.lap",
        "/second.lap",
      ]),
    );
  } finally {
    restored.dispose();
  }
});

it("retains open subjects on failure, reuses matching paths and cleans up on disposal", async () => {
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
  expect(first.close).not.toHaveBeenCalled();
  expect(controller.subjects().map(({ path, subject }) => ({ path, subject }))).toEqual([
    { path: "/first.lap", subject: first },
    { path: "/second.lap", subject: second },
  ]);
  expect(controller.selection()).toBeNull();
  expect(controller.subject()).toBe(second);
  await controller.openFile("/first.lap");
  expect(openSubjectPackage).toHaveBeenCalledTimes(3);
  expect(controller.subject()).toBe(first);
  dispose();
  expect(first.close).toHaveBeenCalledOnce();
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

it("retains edits made during a save and retries failed writes", async () => {
  const subject = { close: vi.fn().mockResolvedValue(undefined) } as unknown as OpenSubjectPackage;
  vi.mocked(filesystem.readFile).mockResolvedValue(new Blob());
  vi.mocked(openSubjectPackage).mockResolvedValue(subject);
  vi.mocked(writeSubjectPackage).mockImplementation(async (_, stream) => {
    const writer = stream.getWriter();
    await writer.write(new Uint8Array([1]));
    await writer.close();
    return [];
  });

  let finishWrite!: () => void;
  let signalWriteStarted!: () => void;
  const writeStarted = new Promise<void>((resolve) => {
    signalWriteStarted = resolve;
  });
  const file = { kind: "file" } as Awaited<ReturnType<typeof filesystem.writeFile>>;
  vi.mocked(filesystem.writeFile)
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishWrite = () => resolve(file);
          signalWriteStarted();
        }),
    )
    .mockResolvedValueOnce(file);

  const { controller, dispose } = createRoot((dispose) => ({
    controller: createSubjectController(),
    dispose,
  }));
  try {
    await controller.openFile("/subject.lap");
    const [entry] = controller.subjects();
    const rated = { ...entry.progress(), introduced: { "2026-11-19": { deck: 1 } } };
    entry.updateProgress(rated);
    await entry.save();
    expect(entry.saveError()).toBe("offline");
    expect(entry.progress()).toBe(rated);
    expect(entry.dirty()).toBe(true);
    const saving = entry.save();
    await writeStarted;
    const edited = { ...rated, introduced: { "2026-11-19": { deck: 2 } } };
    entry.updateProgress(edited);
    expect(entry.save()).toBe(saving);
    finishWrite();
    await saving;
    expect(entry.dirty()).toBe(true);
    expect(entry.saveError()).toBe("");
    await entry.save();
    expect(entry.dirty()).toBe(false);
    expect(vi.mocked(writeSubjectPackage).mock.calls.map(([input]) => input.progress)).toEqual([
      rated,
      rated,
      edited,
    ]);
  } finally {
    dispose();
  }
});

it("shares drafts across windows and releases the archive after the last window closes", async () => {
  const subject = { close: vi.fn().mockResolvedValue(undefined) } as unknown as OpenSubjectPackage;
  vi.mocked(filesystem.readFile).mockResolvedValue(new Blob());
  vi.mocked(openSubjectPackage).mockResolvedValue(subject);
  const mount = () => createRoot((dispose) => ({ controller: createSubjectController(), dispose }));
  const first = mount();
  const second = mount();
  try {
    await first.controller.openFile("/shared.lap");
    await second.controller.openFile("/shared.lap");
    const [entry] = first.controller.subjects();
    const progress = { ...entry.progress(), introduced: { "2026-11-19": { deck: 1 } } };
    entry.updateProgress(progress);
    flush();
    expect(second.controller.subjects()[0].progress()).toBe(progress);
    expect(filesystem.readFile).toHaveBeenCalledOnce();
  } finally {
    first.dispose();
    expect(subject.close).not.toHaveBeenCalled();
    second.dispose();
  }
  expect(subject.close).toHaveBeenCalledOnce();
});
