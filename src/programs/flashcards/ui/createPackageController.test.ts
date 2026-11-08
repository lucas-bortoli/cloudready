import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as session from "../browser/session";
import { createPackageController, type PackageController } from "./createPackageController";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("package controller", () => {
  it("releases a stale result and the active reference on disposal", async () => {
    const stale = { hash: "stale" } as session.LoadedPackage;
    const active = { hash: "active" } as session.LoadedPackage;
    let resolveStale!: (value: session.LoadedPackage) => void;
    const open = vi.spyOn(session, "openPackage");
    open.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStale = resolve;
        }),
    );
    open.mockResolvedValueOnce(active);
    const release = vi.spyOn(session, "releasePackage").mockImplementation(() => {});
    let controller!: PackageController;
    let dispose!: () => void;
    createRoot((destroy) => {
      dispose = destroy;
      controller = createPackageController("user");
    });
    const first = controller.openDevice(new File(["a"], "a.apkg"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = controller.openDevice(new File(["b"], "b.apkg"));
    await second;
    resolveStale(stale);
    await first;
    expect(controller.loaded()).toEqual(active);
    expect(release).toHaveBeenCalledWith("user", "stale");
    dispose();
    expect(release).toHaveBeenCalledWith("user", "active");
  });

  it("ignores a read that completes after cancellation", async () => {
    const open = vi.spyOn(session, "openPackage");
    let resolveRead!: (bytes: ArrayBuffer) => void;
    const file = new File(["a"], "a.apkg");
    vi.spyOn(file, "arrayBuffer").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    let controller!: PackageController;
    let dispose!: () => void;
    createRoot((destroy) => {
      dispose = destroy;
      controller = createPackageController("user");
    });
    const pending = controller.openDevice(file);
    controller.cancel();
    resolveRead(new ArrayBuffer(1));
    await pending;
    expect(controller.busy()).toBe(false);
    expect(open).not.toHaveBeenCalled();
    dispose();
  });
});
