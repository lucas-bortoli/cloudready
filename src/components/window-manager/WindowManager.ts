import type { JSX } from "@solidjs/web";
import { createSignal, createStore, flush, type Accessor, type StoreSetter } from "solid-js";
import type { Point2d, Size2d } from "../../lib/math";
import generateUuid from "../../lib/uuid";
import LayerManager, { type LayerItem } from "../layer-manager/LayerManager";
import WindowMotion from "./WindowMotion";

/** Generates a stable identifier for a newly managed window. */
const makeWindowId = () => generateUuid<"WindowId">();

/** A stable identifier for a window managed by {@link WindowManager}. */
export type WindowId = ReturnType<typeof makeWindowId>;

/** The viewport layout applied to a window, or `null` when it floats freely. */
export type WindowDock = "dock-full" | "dock-left" | "dock-right" | null;

/** Decides whether a window may be destroyed after its close control is clicked. */
export type WindowCloser = () => boolean;

/**
 * Ownership of one overlay. Disposal releases registration without moving focus.
 */
export interface WindowOverlayRegistration {
  /**
   * Releases ownership. Repeated calls are safe, including after owner destruction.
   */
  dispose(): void;
}

/**
 * Thrown when an overlay owner is missing, closing, or minimized.
 */
export class WindowActivationOwnerError extends Error {
  public constructor() {
    super("Overlay ownership requires an available window.");
    this.name = "WindowActivationOwnerError";
  }
}

/**
 * Thrown when an overlay element already has a live ownership registration.
 */
export class WindowOverlayAlreadyRegisteredError extends Error {
  public constructor() {
    super("The overlay element is already registered.");
    this.name = "WindowOverlayAlreadyRegisteredError";
  }
}

export interface WindowState {
  /** Stable identifier used to address this window. */
  id: WindowId;
  /** Text displayed in the window's title bar. */
  title: string;
  /** The floating window frame's top-left position, or `null` before initial placement. */
  position: Point2d | null;
  /** Whether measured size changes should keep this window centered. */
  isAutoPositioned: boolean;
  /** Whether its exit animation is in progress. */
  isClosing: boolean;
  /** The viewport layout currently applied to the window. */
  dock: WindowDock;
  /** Whether the window is currently hidden from the desktop. */
  isMinimized: boolean;
  /** Whether the window can be minimized through its titlebar control. */
  isMinimizable: boolean;
  /** Whether the window is pinned. */
  isPinned: boolean;
  /** Reactive stacking position assigned by the layer manager. */
  zIndex: () => number;
  /** Handle that controls this window's global stacking order. */
  layerItem: LayerItem;
  /** Whether the floating window can be resized. */
  isResizable: boolean;
  /** Optionally approves destruction when the window close control is clicked. */
  closer?: WindowCloser;
  /** The usable client content area's width and height, excluding window frame chrome. */
  size: Size2d;
  /** The minimum usable client content area, excluding window frame chrome. */
  minimumSize: Size2d;
  /** Lazily renders the window's client content. */
  content: () => JSX.Element;
}

/** An immutable view of a window managed by {@link WindowManager}. */
export type WindowEntry = Readonly<WindowState>;

/** Optional properties used when creating a window. */
export interface CreateWindowOptions {
  /** Text displayed in the window's title bar. Defaults to `"Untitled"`. */
  title?: string;
  /** Initial floating frame position. Defaults to automatic centered placement. */
  position?: Point2d;
  /** Initial viewport layout. Defaults to a floating window. */
  dock?: WindowDock;
  /** Whether the window is initially hidden. Defaults to `false`. */
  isMinimized?: boolean;
  /** Whether the window is initially minimizable. Defaults to `true`. */
  isMinimizable?: boolean;
  /** Whether the window is initially pinned. Defaults to `false`. */
  isPinned?: boolean;
  /** Whether the floating window is initially resizable. Defaults to `true`. */
  isResizable?: boolean;
  /** Optionally approves closing the window and displays its close control. */
  closer?: WindowCloser;
  /** The usable client content area's width and height, excluding window frame chrome. */
  size?: Size2d;
  /** The minimum usable client content area, excluding window frame chrome. */
  minimumSize?: Size2d;
  /** Lazily renders the window's client content. */
  content?: () => JSX.Element;
}

/**
 * Owns the reactive collection of application windows.
 *
 * Window size values always describe client content, not the titlebar or frame.
 * Pointer-interaction state remains local to the rendered window.
 */
export default class WindowManager {
  /** Reactive, read-only list of managed windows. */
  public readonly getWindows: Accessor<readonly WindowEntry[]>;
  /** Updates the reactive collection of managed windows. */
  private readonly setWindows: StoreSetter<WindowState[]>;
  private readonly layerManager: LayerManager;
  public readonly motion = new WindowMotion();
  /**
   * Window owning current keyboard focus, or null when focus is outside managed windows.
   */
  public readonly activeWindowId: Accessor<WindowId | null>;
  private readonly setActiveWindowId: (id: WindowId | null) => void;
  private readonly frames = new Map<WindowId, HTMLElement>();
  private readonly windowLayers = new Map<WindowId, LayerItem>();
  private readonly overlays = new Map<HTMLElement, { windowId: WindowId }>();
  private trackedDocument: Document | null = null;
  private browserFocused = false;
  private detachActivationTracking: (() => void) | null = null;

  /**
   * Registers a frame for focus ownership and window motion.
   */
  public registerFrame(windowId: WindowId, frame: HTMLElement): void {
    this.frames.set(windowId, frame);
    this.motion.registerFrame(windowId, frame);
    this.refreshActivation();
  }
  /**
   * Releases a frame's focus and motion registration.
   */
  public unregisterFrame(windowId: WindowId): void {
    this.frames.delete(windowId);
    this.motion.unregisterFrame(windowId);
    this.refreshActivation();
  }
  /**
   * Registers an overlay as part of its owner's focus region without changing focus or stacking.
   *
   * @param windowId An existing window that is neither closing nor minimized.
   * @param element The rendered overlay root; descendants inherit its ownership.
   * @returns An independent, idempotent ownership registration.
   * @throws {WindowActivationOwnerError} When the owner is unavailable.
   * @throws {WindowOverlayAlreadyRegisteredError} When the element is already registered.
   */
  public registerOwnedOverlay(windowId: WindowId, element: HTMLElement): WindowOverlayRegistration {
    if (this.windowLayers.has(windowId) && !this.findWindow(windowId)) flush();
    if (!this.canActivate(windowId)) throw new WindowActivationOwnerError();
    if (this.overlays.has(element)) throw new WindowOverlayAlreadyRegisteredError();
    const registration = { windowId };
    this.overlays.set(element, registration);
    this.refreshActivation();
    return {
      dispose: () => {
        // An old disposer must not release a later registration of the same element.
        if (this.overlays.get(element) !== registration) return;
        this.overlays.delete(element);
        this.refreshActivation();
      },
    };
  }

  /**
   * Starts focus tracking for this manager, replacing any previous tracking session.
   *
   * @param targetDocument Document containing the registered frames and overlays.
   * @returns Idempotent cleanup that removes listeners and clears all ownership registrations.
   */
  public attachActivationTracking(targetDocument: Document): () => void {
    this.detachActivationTracking?.();
    const view = targetDocument.defaultView;
    let disposed = false;
    this.trackedDocument = targetDocument;
    this.browserFocused = targetDocument.hasFocus();
    const handleFocusIn = () => this.refreshActivation();
    const handleFocusOut = () => {
      // Focusout precedes focusin; defer to avoid deactivating during an owned focus transfer.
      queueMicrotask(() => {
        if (!disposed) this.refreshActivation();
      });
    };
    const handleBlur = () => {
      this.browserFocused = false;
      this.refreshActivation();
    };
    const handleFocus = () => {
      this.browserFocused = true;
      this.refreshActivation();
    };
    targetDocument.addEventListener("focusin", handleFocusIn);
    targetDocument.addEventListener("focusout", handleFocusOut);
    view?.addEventListener("blur", handleBlur);
    view?.addEventListener("focus", handleFocus);
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      targetDocument.removeEventListener("focusin", handleFocusIn);
      targetDocument.removeEventListener("focusout", handleFocusOut);
      view?.removeEventListener("blur", handleBlur);
      view?.removeEventListener("focus", handleFocus);
      this.trackedDocument = null;
      this.browserFocused = false;
      this.frames.clear();
      this.overlays.clear();
      this.setActiveWindowId(null);
      this.detachActivationTracking = null;
    };
    this.detachActivationTracking = dispose;
    this.refreshActivation();
    return dispose;
  }

  private canActivate(windowId: WindowId): boolean {
    const window = this.findWindow(windowId);
    return (
      !!window && !window.isClosing && !window.isMinimized && !this.motion.isMinimizing(windowId)
    );
  }

  private refreshActivation(): void {
    let element = this.browserFocused ? this.trackedDocument?.activeElement : null;
    while (element) {
      const owner =
        this.overlays.get(element as HTMLElement)?.windowId ??
        Array.from(this.frames).find(([, frame]) => frame === element)?.[0];
      if (owner !== undefined) {
        this.setActiveWindowId(this.canActivate(owner) ? owner : null);
        return;
      }
      element = element.parentElement;
    }
    this.setActiveWindowId(null);
  }

  public suppressNextDockAnimation(windowId: WindowId): void {
    this.motion.suppressNextDockAnimation(windowId);
  }
  public isMinimizing(windowId: WindowId): boolean {
    return this.motion.isMinimizing(windowId);
  }

  /** Creates an empty reactive collection of managed windows. */
  public constructor(layerManager = new LayerManager()) {
    const [windows, setWindows] = createStore<WindowState[]>([]);
    this.getWindows = () => windows;
    this.setWindows = setWindows;
    this.layerManager = layerManager;
    const [activeWindowId, setActiveWindowId] = createSignal<WindowId | null>(null);
    this.activeWindowId = activeWindowId;
    this.setActiveWindowId = setActiveWindowId;
  }

  /**
   * Creates a new window with the given options.
   * The window becomes visible to reactive reads after the scheduled update settles.
   * @param options Optional window properties. Omitted properties use defaults.
   * @returns The ID of the newly created window.
   */
  public createWindow(options?: CreateWindowOptions): WindowId {
    const id = makeWindowId();
    const isPinned = options?.isPinned ?? false;
    const layerItem = this.layerManager.createItem(isPinned ? "windowing:pinned" : "windowing");
    this.windowLayers.set(id, layerItem);
    this.setWindows((windows) => {
      windows.push({
        id,
        title: options?.title ?? "Untitled",
        position: options?.position ?? null,
        isAutoPositioned: options?.position === undefined,
        isClosing: false,
        dock: options?.dock ?? null,
        isMinimized: options?.isMinimized ?? false,
        isMinimizable: options?.isMinimizable ?? true,
        isPinned,
        zIndex: layerItem.zIndex,
        layerItem,
        isResizable: options?.isResizable ?? true,
        closer: options?.closer,
        size: options?.size ?? { width: 400, height: 300 },
        minimumSize: options?.minimumSize ?? { width: 200, height: 150 },
        content: options?.content ?? (() => undefined),
      });
    });
    return id;
  }

  /**
   * Destroys a window by ID without consulting its closer.
   * @param windowId The ID of the window to remove.
   * @returns Whether a window was removed.
   */
  public destroyWindow(windowId: WindowId): boolean {
    // Creation is scheduled, but callers can request destruction in the same turn.
    if (this.windowLayers.has(windowId) && !this.findWindow(windowId)) flush();
    const windowIndex = this.getWindows().findIndex((window) => window.id === windowId);

    if (windowIndex < 0 || this.getWindows()[windowIndex].isClosing) {
      return false;
    }

    this.motion.cancelTransition(windowId);
    if (this.motion.prefersReducedMotion()) {
      this.finishDestroyWindow(windowId);
    } else {
      this.updateWindow(windowId, (window) => {
        window.isClosing = true;
      });
      this.motion.scheduleClose(windowId, () => this.finishDestroyWindow(windowId));
    }
    this.refreshActivation();
    return true;
  }

  /** Completes removal after an exit animation, or immediately when motion is reduced. */
  public finishDestroyWindow(windowId: WindowId): void {
    this.motion.finishClose(windowId);
    const layer = this.windowLayers.get(windowId);
    if (!layer) return;

    this.unregisterFrame(windowId);
    for (const [element, registration] of this.overlays) {
      if (registration.windowId === windowId) this.overlays.delete(element);
    }
    layer.dispose();
    this.windowLayers.delete(windowId);

    this.setWindows((windows) => {
      const windowIndex = windows.findIndex((window) => window.id === windowId);
      if (windowIndex >= 0) windows.splice(windowIndex, 1);
    });
    flush();
    this.refreshActivation();
  }

  /**
   * Updates the title of a window.
   * @param windowId The ID of the window to update.
   * @param newTitle The new title for the window.
   */
  public setTitle(windowId: WindowId, newTitle: string) {
    this.updateWindow(windowId, (window) => {
      window.title = newTitle;
    });
  }

  /**
   * Updates a window's floating frame position.
   * @param windowId The ID of the window to update.
   * @param position New top-left position, or `null` to request automatic placement.
   */
  public setPosition(windowId: WindowId, position: Point2d | null) {
    this.updateWindow(windowId, (window) => {
      if (window.position && position) {
        window.position.x = position.x;
        window.position.y = position.y;
      } else {
        window.position = position;
      }
      window.isAutoPositioned = position === null;
    });
  }

  /** Updates measured automatic placement without disabling future recentering. */
  public setAutoPosition(windowId: WindowId, position: Point2d): void {
    // Placement is also measured during settlement, when flush is not reentrant.
    this.setWindows((windows) => {
      const window = windows.find((entry) => entry.id === windowId);
      if (window?.isAutoPositioned) {
        if (window.position) {
          window.position.x = position.x;
          window.position.y = position.y;
        } else {
          window.position = position;
        }
      }
    });
  }

  /**
   * Updates the viewport layout applied to a window.
   * @param windowId The ID of the window to update.
   * @param dock New dock layout, or `null` for a floating window.
   */
  public setDock(windowId: WindowId, dock: WindowDock) {
    if (this.windowLayers.has(windowId) && !this.findWindow(windowId)) flush();
    const entry = this.getWindows().find((window) => window.id === windowId);
    if (!entry || entry.dock === dock || entry.isClosing) return;
    const before = this.motion.beforeDock(entry);
    this.updateWindow(windowId, (window) => {
      window.dock = dock;
      window.isAutoPositioned = false;
    });
    this.motion.afterDock(windowId, dock, before, () => this.findWindow(windowId));
  }

  private updateWindow(windowId: WindowId, update: (window: WindowState) => void): void {
    this.setWindows((windows) => {
      const window = windows.find((entry) => entry.id === windowId);
      if (window) update(window);
    });
    flush();
  }

  private findWindow(windowId: WindowId): WindowState | undefined {
    return this.getWindows().find((window) => window.id === windowId);
  }

  /**
   * Updates whether a window is hidden from the desktop.
   * @param windowId The ID of the window to update.
   * @param isMinimized Whether the window should be minimized.
   */
  public setMinimized(windowId: WindowId, isMinimized: boolean) {
    if (this.windowLayers.has(windowId) && !this.findWindow(windowId)) flush();
    const entry = this.getWindows().find((window) => window.id === windowId);
    if (!entry || entry.isClosing) return;
    this.motion.setMinimized(entry, isMinimized, (value) => {
      this.updateWindow(windowId, (window) => {
        window.isMinimized = value;
      });
      this.refreshActivation();
    });
    this.refreshActivation();
  }

  /** Updates whether a window stays above ordinary application windows. */
  public setPinned(windowId: WindowId, isPinned: boolean) {
    const layer = this.windowLayers.get(windowId);
    if (!layer) return;
    layer.moveToLayer(isPinned ? "windowing:pinned" : "windowing");
    this.updateWindow(windowId, (window) => {
      window.isPinned = isPinned;
    });
  }

  /** Moves a window to the front of its current stacking layer. */
  public bringToTop(windowId: WindowId) {
    this.windowLayers.get(windowId)?.bringToTop();
  }

  /** Moves a window one position toward the back of its stacking layer. */
  public sendBack(windowId: WindowId) {
    this.windowLayers.get(windowId)?.sendBack();
  }

  /**
   * Updates whether a window can be minimized through its titlebar control.
   * @param windowId The ID of the window to update.
   * @param isMinimizable Whether the minimize control should be available.
   */
  public setMinimizable(windowId: WindowId, isMinimizable: boolean) {
    this.updateWindow(windowId, (window) => {
      window.isMinimizable = isMinimizable;
    });
  }

  /**
   * Updates whether a floating window can be resized.
   * @param windowId The ID of the window to update.
   * @param isResizable Whether resize handles should be available while floating.
   */
  public setResizable(windowId: WindowId, isResizable: boolean) {
    this.updateWindow(windowId, (window) => {
      window.isResizable = isResizable;
    });
  }

  /**
   * Updates the function that approves closing a window.
   * @param windowId The ID of the window to update.
   * @param closer Returns whether the window should be removed. Omit to hide the close control.
   * @param defer Whether to let Solid schedule the update, such as during settlement.
   */
  public setCloser(windowId: WindowId, closer?: WindowCloser, defer = false) {
    this.setWindows((windows) => {
      const window = windows.find((entry) => entry.id === windowId);
      if (window) window.closer = closer;
    });
    if (!defer) flush();
  }

  /**
   * Updates a window's usable client content area, excluding window frame chrome.
   * @param windowId The ID of the window to update.
   * @param size New client width and height in CSS pixels.
   */
  public setSize(windowId: WindowId, size: Size2d) {
    this.updateWindow(windowId, (window) => {
      window.size.width = size.width;
      window.size.height = size.height;
    });
  }

  /**
   * Updates the minimum usable client content area, excluding window frame chrome.
   * @param windowId The ID of the window to update.
   * @param minimumSize New minimum client width and height in CSS pixels.
   */
  public setMinimumSize(windowId: WindowId, minimumSize: Size2d) {
    this.updateWindow(windowId, (window) => {
      window.minimumSize = minimumSize;
    });
  }
}
