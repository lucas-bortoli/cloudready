import { type Accessor, type JSX } from "solid-js";
import { createStore, produce, type SetStoreFunction } from "solid-js/store";
import type { Point2d, Size2d } from "../../lib/math";
import generateUuid from "../../lib/uuid";

/** Generates a stable identifier for a newly managed window. */
const makeWindowId = () => generateUuid<"WindowId">();

/** A stable identifier for a window managed by {@link WindowManager}. */
export type WindowId = ReturnType<typeof makeWindowId>;

/** The viewport layout applied to a window, or `null` when it floats freely. */
export type WindowDock = "dock-full" | "dock-left" | "dock-right" | null;

/** Decides whether a window may be destroyed after its close control is clicked. */
export type WindowCloser = () => boolean;

interface WindowState {
  /** Stable identifier used to address this window. */
  id: WindowId;
  /** Text displayed in the window's title bar. */
  title: string;
  /** The floating window frame's top-left position, or `null` before initial placement. */
  position: Point2d | null;
  /** The viewport layout currently applied to the window. */
  dock: WindowDock;
  /** Whether the window is currently hidden from the desktop. */
  isMinimized: boolean;
  /** Whether the window can be minimized through its titlebar control. */
  isMinimizable: boolean;
  /** Whether the window is pinned. */
  isPinned: boolean;
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
  private readonly setWindows: SetStoreFunction<WindowState[]>;

  /** Creates an empty reactive collection of managed windows. */
  public constructor() {
    const [windows, setWindows] = createStore<WindowState[]>([]);
    this.getWindows = () => windows;
    this.setWindows = setWindows;
  }

  /**
   * Creates a new window with the given options.
   * @param options Optional window properties. Omitted properties use defaults.
   * @returns The ID of the newly created window.
   */
  public createWindow(options?: CreateWindowOptions): WindowId {
    const id = makeWindowId();
    this.setWindows(this.getWindows().length, {
      id,
      title: options?.title ?? "Untitled",
      position: options?.position ?? null,
      dock: options?.dock ?? null,
      isMinimized: options?.isMinimized ?? false,
      isMinimizable: options?.isMinimizable ?? true,
      isPinned: options?.isPinned ?? false,
      isResizable: options?.isResizable ?? true,
      closer: options?.closer,
      size: options?.size ?? { width: 400, height: 300 },
      minimumSize: options?.minimumSize ?? { width: 200, height: 150 },
      content: options?.content ?? (() => undefined),
    });
    return id;
  }

  /**
   * Destroys a window by ID without consulting its closer.
   * @param windowId The ID of the window to remove.
   * @returns Whether a window was removed.
   */
  public destroyWindow(windowId: WindowId): boolean {
    const windowIndex = this.getWindows().findIndex((window) => window.id === windowId);

    if (windowIndex < 0) {
      return false;
    }

    this.setWindows(
      produce((windows) => {
        windows.splice(windowIndex, 1);
      }),
    );
    return true;
  }

  /**
   * Updates the title of a window.
   * @param windowId The ID of the window to update.
   * @param newTitle The new title for the window.
   */
  public setTitle(windowId: WindowId, newTitle: string) {
    this.setWindows((window) => window.id === windowId, "title", newTitle);
  }

  /**
   * Updates a window's floating frame position.
   * @param windowId The ID of the window to update.
   * @param position New top-left position, or `null` to request automatic placement.
   */
  public setPosition(windowId: WindowId, position: Point2d | null) {
    this.setWindows((window) => window.id === windowId, "position", position);
  }

  /**
   * Updates the viewport layout applied to a window.
   * @param windowId The ID of the window to update.
   * @param dock New dock layout, or `null` for a floating window.
   */
  public setDock(windowId: WindowId, dock: WindowDock) {
    this.setWindows((window) => window.id === windowId, "dock", dock);
  }

  /**
   * Updates whether a window is hidden from the desktop.
   * @param windowId The ID of the window to update.
   * @param isMinimized Whether the window should be minimized.
   */
  public setMinimized(windowId: WindowId, isMinimized: boolean) {
    this.setWindows((window) => window.id === windowId, "isMinimized", isMinimized);
  }

  /**
   * Updates whether a window can be minimized through its titlebar control.
   * @param windowId The ID of the window to update.
   * @param isMinimizable Whether the minimize control should be available.
   */
  public setMinimizable(windowId: WindowId, isMinimizable: boolean) {
    this.setWindows((window) => window.id === windowId, "isMinimizable", isMinimizable);
  }

  /**
   * Updates whether a floating window can be resized.
   * @param windowId The ID of the window to update.
   * @param isResizable Whether resize handles should be available while floating.
   */
  public setResizable(windowId: WindowId, isResizable: boolean) {
    this.setWindows((window) => window.id === windowId, "isResizable", isResizable);
  }

  /**
   * Updates the function that approves closing a window.
   * @param windowId The ID of the window to update.
   * @param closer Returns whether the window should be removed. Omit to hide the close control.
   */
  public setCloser(windowId: WindowId, closer?: WindowCloser) {
    this.setWindows(
      (window) => window.id === windowId,
      "closer",
      () => closer,
    );
  }

  /**
   * Updates a window's usable client content area, excluding window frame chrome.
   * @param windowId The ID of the window to update.
   * @param size New client width and height in CSS pixels.
   */
  public setSize(windowId: WindowId, size: Size2d) {
    this.setWindows((window) => window.id === windowId, "size", size);
  }

  /**
   * Updates the minimum usable client content area, excluding window frame chrome.
   * @param windowId The ID of the window to update.
   * @param minimumSize New minimum client width and height in CSS pixels.
   */
  public setMinimumSize(windowId: WindowId, minimumSize: Size2d) {
    this.setWindows((window) => window.id === windowId, "minimumSize", minimumSize);
  }
}
