import type { JSX } from "solid-js";
import type { WindowDock, WindowEntry } from "./WindowManager";

export const taskbarHeight = 48;

/** Converts a layout measurement to an integer CSS pixel value. */
export const integerPixels = (value: number) => `${Math.round(value)}px`;

/** Returns the viewport layout styles for a window frame. */
export function getWindowStyle(entry: WindowEntry): JSX.CSSProperties {
  if (entry.dock === "dock-full") {
    return {
      top: 0,
      right: 0,
      bottom: integerPixels(taskbarHeight),
      left: 0,
      display: entry.isMinimized ? "none" : undefined,
    };
  }

  if (entry.dock === "dock-left") {
    return {
      top: 0,
      right: "50%",
      bottom: integerPixels(taskbarHeight),
      left: 0,
      display: entry.isMinimized ? "none" : undefined,
    };
  }

  if (entry.dock === "dock-right") {
    return {
      top: 0,
      right: 0,
      bottom: integerPixels(taskbarHeight),
      left: "50%",
      display: entry.isMinimized ? "none" : undefined,
    };
  }

  return {
    top: integerPixels(entry.position?.y ?? 12),
    left: integerPixels(entry.position?.x ?? 12),
    width: integerPixels(entry.size.width),
    "min-width": integerPixels(entry.minimumSize.width),
    display: entry.isMinimized ? "none" : undefined,
  };
}

/** Returns frame-chrome styles for a window's current dock layout. */
export function getFrameStyle(dock: WindowDock): JSX.CSSProperties {
  if (dock === "dock-full") {
    return {
      "box-sizing": "border-box",
      "border-top-width": 0,
      "border-right-width": 0,
      "border-bottom-width": 0,
      "border-left-width": 0,
      "border-top-left-radius": 0,
      "border-top-right-radius": 0,
      "border-bottom-left-radius": 0,
      "border-bottom-right-radius": 0,
    };
  }

  if (dock === "dock-left") {
    return {
      "box-sizing": "border-box",
      "border-top-width": 0,
      "border-bottom-width": 0,
      "border-left-width": 0,
      "border-top-left-radius": 0,
      "border-bottom-left-radius": 0,
    };
  }

  if (dock === "dock-right") {
    return {
      "box-sizing": "border-box",
      "border-top-width": 0,
      "border-right-width": 0,
      "border-bottom-width": 0,
      "border-top-right-radius": 0,
      "border-bottom-right-radius": 0,
    };
  }

  return {};
}
