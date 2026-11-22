import { render } from "@solidjs/web";
import { captureArtifact, expectNoDiagnostics } from "@solidjs/diagnostics";
import { flush } from "solid-js";
import { expect, it, vi } from "vitest";
import ResizableSidebar from "./ResizableSidebar";

it("resizes with the keyboard and respects its limits", () => {
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
  } as typeof ResizeObserver;
  try {
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = render(
      () => <ResizableSidebar selectedItem={null} setSelectedItem={vi.fn()} />,
      root,
    );
    flush();
    const divider = root.querySelector("[role=separator]")!;
    expect(divider.getAttribute("aria-valuenow")).toBe("200");
    divider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    flush();
    expect(divider.getAttribute("aria-valuenow")).toBe("210");
    divider.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    flush();
    expect(divider.getAttribute("aria-valuenow")).toBe("160");
    divider.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    flush();
    expect(divider.getAttribute("aria-valuenow")).toBe("480");
    dispose();
    root.remove();
  } finally {
    globalThis.ResizeObserver = original;
  }
});

it("restores and saves a sidebar width using its size key", () => {
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
  } as typeof ResizeObserver;
  const root = document.createElement("div");
  document.body.append(root);
  const values = new Map([["test.sidebar.width", "300"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  try {
    const dispose = render(
      () => (
        <ResizableSidebar
          selectedItem={null}
          setSelectedItem={vi.fn()}
          sizeKey="test.sidebar.width"
        />
      ),
      root,
    );
    flush();
    const divider = root.querySelector("[role=separator]")!;
    expect(divider.getAttribute("aria-valuenow")).toBe("300");
    divider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(localStorage.getItem("test.sidebar.width")).toBe("310");
    dispose();
  } finally {
    vi.unstubAllGlobals();
    root.remove();
    globalThis.ResizeObserver = original;
  }
});

it("disconnects its resize observer without Solid diagnostics", async () => {
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public observe = observe;
      public disconnect = disconnect;
    },
  );
  try {
    const { artifact } = await captureArtifact(
      () => {
        const root = document.createElement("div");
        document.body.append(root);
        const dispose = render(
          () => <ResizableSidebar selectedItem={null} setSelectedItem={vi.fn()} />,
          root,
        );
        flush();
        expect(observe).toHaveBeenCalledWith(root);
        dispose();
        expect(disconnect).toHaveBeenCalledOnce();
        root.remove();
      },
      { scenario: "resizable-sidebar-lifecycle" },
    );
    expectNoDiagnostics(artifact);
  } finally {
    vi.unstubAllGlobals();
  }
});
