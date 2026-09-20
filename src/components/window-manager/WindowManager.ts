import { type Accessor, type JSX } from "solid-js";
import { createStore, produce, type SetStoreFunction } from "solid-js/store";
import type { Size2d } from "../../lib/math";
import generateUuid from "../../lib/uuid";

const makeWindowId = () => generateUuid<"WindowId">();

/** A stable identifier for a window managed by {@link WindowManager}. */
export type WindowId = ReturnType<typeof makeWindowId>;

interface WindowState {
  id: WindowId;
  title: string;
  /** The usable client content area's width and height, excluding window frame chrome. */
  size: Size2d;
  /** The minimum usable client content area, excluding window frame chrome. */
  minimumSize: Size2d;
  content: () => JSX.Element;
}

/** An immutable view of a window managed by {@link WindowManager}. */
export type WindowEntry = Readonly<WindowState>;

/** Optional properties used when creating a window. */
export interface CreateWindowOptions {
  /** Text displayed in the window's title bar. Defaults to `"Untitled"`. */
  title?: string;
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
 * Position and pointer-interaction state remain local to the rendered window.
 */
export default class WindowManager {
  /** Reactive, read-only list of managed windows. */
  public readonly getWindows: Accessor<readonly WindowEntry[]>;
  private readonly windows: WindowState[];
  private readonly setWindows: SetStoreFunction<WindowState[]>;

  public constructor() {
    const [windows, setWindows] = createStore<WindowState[]>([]);
    this.windows = windows;
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
    this.setWindows(this.windows.length, {
      id,
      title: options?.title ?? "Untitled",
      size: options?.size ?? { width: 400, height: 300 },
      minimumSize: options?.minimumSize ?? { width: 200, height: 150 },
      content: options?.content ?? (() => undefined),
    });
    return id;
  }

  /**
   * Removes a window by ID.
   * @param windowId The ID of the window to remove.
   * @returns Whether a window was removed.
   */
  public removeWindow(windowId: WindowId): boolean {
    const windowIndex = this.windows.findIndex((window) => window.id === windowId);

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
