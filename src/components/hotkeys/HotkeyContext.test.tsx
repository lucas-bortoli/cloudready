// @vitest-environment happy-dom

import { type ParentProps } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { HotkeyProvider, HotkeyRegistry, useHotkey } from "./HotkeyContext";

function pressKey(key: string) {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key });
}

function KeyBinding(props: { handler: (event: KeyboardEvent) => boolean }) {
  useHotkey({ eventType: "keydown", handler: props.handler });
  return undefined;
}

function TestProvider(props: ParentProps) {
  return <HotkeyProvider>{props.children}</HotkeyProvider>;
}

describe("HotkeyRegistry", () => {
  it("owns Keyboard Lock API capture and release", async () => {
    const originalKeyboard = Object.getOwnPropertyDescriptor(navigator, "keyboard");
    const lock = vi.fn(async () => undefined);
    const unlock = vi.fn();
    Object.defineProperty(navigator, "keyboard", {
      configurable: true,
      value: { lock, unlock },
    });
    const registry = new HotkeyRegistry();

    expect(await registry.lockKeyboard()).toBe(true);
    registry.unlockKeyboard();

    expect(lock).toHaveBeenCalledOnce();
    expect(unlock).toHaveBeenCalledOnce();
    registry.dispose();
    if (originalKeyboard) Object.defineProperty(navigator, "keyboard", originalKeyboard);
    else delete (navigator as Navigator & { keyboard?: unknown }).keyboard;
  });

  it("dispatches to the most recently registered handler that handles the key", () => {
    const registry = new HotkeyRegistry();
    const earlierHandler = vi.fn(() => true);
    const laterHandler = vi.fn(() => true);
    registry.register({ eventType: "keydown", handler: earlierHandler });
    registry.register({ eventType: "keydown", handler: laterHandler });
    const event = pressKey("Tab");

    document.dispatchEvent(event);

    expect(laterHandler).toHaveBeenCalledOnce();
    expect(earlierHandler).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    registry.dispose();
  });

  it("unregisters a component binding when its component unmounts", () => {
    const container = document.createElement("div");
    const handler = vi.fn(() => true);
    const dispose = render(
      () => (
        <TestProvider>
          <KeyBinding handler={handler} />
        </TestProvider>
      ),
      container,
    );

    document.dispatchEvent(pressKey("Meta"));
    expect(handler).toHaveBeenCalledOnce();

    dispose();
    document.dispatchEvent(pressKey("Meta"));
    expect(handler).toHaveBeenCalledOnce();
  });
});
