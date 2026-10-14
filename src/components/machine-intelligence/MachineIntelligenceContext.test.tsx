// @vitest-environment happy-dom

import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { miStartAuthorization } from "../../lib/kernel-rpc/machine-intelligence";
import {
  MachineIntelligenceClient,
  MachineIntelligenceProvider,
  createClient,
  useClient,
} from "./MachineIntelligenceContext";
import {
  ChatGptPopupBlockedError,
  MachineIntelligenceProviderDisposedError,
  MachineIntelligenceProviderMissingError,
} from "./errors";

vi.mock("../../lib/kernel-rpc/core", () => ({
  KernelRpcApiError: class extends Error {},
}));

vi.mock("../../lib/kernel-rpc/machine-intelligence", () => ({
  miDisconnect: vi.fn(),
  miGenerateText: vi.fn(),
  miGetAuthorization: vi.fn(),
  miGetConnection: vi.fn(),
  miListModels: vi.fn(),
  miStartAuthorization: vi.fn(),
}));

afterEach(() => vi.restoreAllMocks());

describe("MachineIntelligenceProvider", () => {
  it("shares a client with components and invalidates it on unmount", async () => {
    const container = document.createElement("div");
    let hooked: MachineIntelligenceClient | undefined;
    function Consumer() {
      hooked = useClient();
      return undefined;
    }
    const dispose = render(
      () => (
        <MachineIntelligenceProvider>
          <Consumer />
        </MachineIntelligenceProvider>
      ),
      container,
    );
    const imperative = createClient();
    expect(imperative).toBe(hooked);
    dispose();
    expect(() => createClient()).toThrow(MachineIntelligenceProviderMissingError);
    await expect(imperative.connection()).rejects.toBeInstanceOf(
      MachineIntelligenceProviderDisposedError,
    );
  });

  it("reports a blocked popup before starting authorization", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const client = new MachineIntelligenceClient();
    await expect(client.connect()).rejects.toBeInstanceOf(ChatGptPopupBlockedError);
    expect(miStartAuthorization).not.toHaveBeenCalled();
  });

  it("opens the window before requesting authorization and closes it on failure", async () => {
    const close = vi.fn();
    const popup = { opener: window, closed: false, close, location: { replace: vi.fn() } };
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    let rejectAuthorization!: (error: Error) => void;
    vi.mocked(miStartAuthorization).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectAuthorization = reject;
        }),
    );
    const client = new MachineIntelligenceClient();
    const result = client.connect();
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(miStartAuthorization).toHaveBeenCalledOnce();
    expect(popup.opener).toBeNull();
    rejectAuthorization(new Error("Kernel unavailable"));
    await expect(result).rejects.toThrow("Kernel unavailable");
    expect(close).toHaveBeenCalledOnce();
  });
});
