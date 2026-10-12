import { createContext, onCleanup, useContext, type ParentProps } from "solid-js";

/** The keyboard event phase that a hotkey handler receives. */
export type HotkeyEventType = "keydown" | "keyup";

/** Handles a global keyboard event and reports whether it consumed the event. */
export type HotkeyHandler = (event: KeyboardEvent) => boolean;

/** Registers a handler for one document-level keyboard event phase. */
export interface HotkeyBinding {
  eventType: HotkeyEventType;
  handler: HotkeyHandler;
}

interface KeyboardLockApi {
  lock: (keyCodes?: string[]) => Promise<void>;
  unlock: () => void;
}

/**
 * Thrown when a hotkey hook is used without a surrounding provider.
 */
export class HotkeyContextError extends Error {
  /** Creates a missing hotkey provider error. */
  public constructor() {
    super("HotkeyProvider is missing.");
    this.name = "HotkeyContextError";
  }
}

/**
 * Owns the document listeners and ordered set of global hotkey handlers.
 *
 * Dispatches handlers from most recently registered to least recently registered.
 */
export class HotkeyRegistry {
  private readonly keyDownHandlers = new Set<HotkeyHandler>();
  private readonly keyUpHandlers = new Set<HotkeyHandler>();
  private readonly keyboard = (navigator as Navigator & { keyboard?: KeyboardLockApi }).keyboard;

  /** Creates the registry and starts listening for document keyboard events. */
  public constructor() {
    document.addEventListener("keydown", this.handleKeyDown, true);
    document.addEventListener("keyup", this.handleKeyUp, true);
  }

  /**
   * Registers a handler and returns a function that unregisters it.
   *
   * @param binding The event phase and handler to register.
   * @returns A function that removes the binding.
   */
  public register(binding: HotkeyBinding): () => void {
    const handlers = binding.eventType === "keydown" ? this.keyDownHandlers : this.keyUpHandlers;
    handlers.add(binding.handler);

    return () => handlers.delete(binding.handler);
  }

  /**
   * Requests capture of all browser-available physical keys while in fullscreen mode.
   *
   * @returns Whether the browser granted keyboard capture.
   */
  public async lockKeyboard(): Promise<boolean> {
    if (!this.keyboard) return false;

    try {
      await this.keyboard.lock();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Releases any keyboard capture previously requested by this registry.
   */
  public unlockKeyboard(): void {
    this.keyboard?.unlock();
  }

  /**
   * Releases the document listeners and keyboard capture owned by this registry.
   */
  public dispose(): void {
    document.removeEventListener("keydown", this.handleKeyDown, true);
    document.removeEventListener("keyup", this.handleKeyUp, true);
    this.keyDownHandlers.clear();
    this.keyUpHandlers.clear();
    this.unlockKeyboard();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.dispatch(this.keyDownHandlers, event);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.dispatch(this.keyUpHandlers, event);
  };

  private dispatch(handlers: ReadonlySet<HotkeyHandler>, event: KeyboardEvent): void {
    for (const handler of [...handlers].reverse()) {
      if (!handler(event)) continue;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }
}

const HotkeyContext = createContext<HotkeyRegistry>();

/**
 * Provides one document-scoped hotkey registry to a component subtree.
 *
 * @param props The descendant component tree that can register hotkeys.
 */
export function HotkeyProvider(props: ParentProps) {
  const hotkeys = new HotkeyRegistry();
  onCleanup(() => hotkeys.dispose());

  return <HotkeyContext.Provider value={hotkeys}>{props.children}</HotkeyContext.Provider>;
}

/**
 * Returns the hotkey registry supplied by the nearest provider.
 *
 * @throws {HotkeyContextError} When called outside a provider.
 */
export function useHotkeyRegistry(): HotkeyRegistry {
  const hotkeys = useContext(HotkeyContext);
  if (!hotkeys) throw new HotkeyContextError();
  return hotkeys;
}

/**
 * Registers a global keyboard handler for the lifetime of the current component.
 *
 * @param binding The event phase and handler to register.
 */
export function useHotkey(binding: HotkeyBinding): void {
  const hotkeys = useHotkeyRegistry();
  onCleanup(hotkeys.register(binding));
}
