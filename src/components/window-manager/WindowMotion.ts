import type { WindowDock, WindowId, WindowState } from "./WindowManager";

/** Owns rendered-frame animation state, measurements, and taskbar targets. */
export default class WindowMotion {
  private readonly frames = new Map<WindowId, HTMLElement>();
  private readonly transitions = new Map<WindowId, Animation>();
  private readonly minimizing = new Set<WindowId>();
  private readonly dockAnimationSuppressed = new Set<WindowId>();
  private readonly closeTimers = new Map<WindowId, ReturnType<typeof setTimeout>>();

  public registerFrame(windowId: WindowId, frame: HTMLElement): void {
    this.frames.set(windowId, frame);
  }

  public unregisterFrame(windowId: WindowId): void {
    this.cancelTransition(windowId);
    this.frames.delete(windowId);
  }

  public suppressNextDockAnimation(windowId: WindowId): void {
    this.dockAnimationSuppressed.add(windowId);
  }

  public isMinimizing(windowId: WindowId): boolean {
    return this.minimizing.has(windowId);
  }

  public prefersReducedMotion(): boolean {
    return (
      typeof window === "undefined" ||
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    );
  }

  public cancelTransition(windowId: WindowId): void {
    this.transitions.get(windowId)?.cancel();
    this.transitions.delete(windowId);
    this.minimizing.delete(windowId);
    const frame = this.frames.get(windowId);
    if (frame) frame.style.pointerEvents = "";
  }

  public scheduleClose(windowId: WindowId, finish: () => void): void {
    this.cancelTransition(windowId);
    this.closeTimers.set(windowId, setTimeout(finish, 220));
  }

  public finishClose(windowId: WindowId): void {
    this.cancelTransition(windowId);
    clearTimeout(this.closeTimers.get(windowId));
    this.closeTimers.delete(windowId);
    this.dockAnimationSuppressed.delete(windowId);
  }

  private animateFrame(windowId: WindowId, keyframes: Keyframe[], onFinish?: () => void): void {
    const frame = this.frames.get(windowId);
    if (!frame?.animate || this.prefersReducedMotion()) {
      onFinish?.();
      return;
    }
    const animation = frame.animate(keyframes, { duration: 220, easing: "ease-in-out" });
    this.transitions.set(windowId, animation);
    animation.onfinish = () => {
      if (this.transitions.get(windowId) !== animation) return;
      this.transitions.delete(windowId);
      frame.style.pointerEvents = "";
      onFinish?.();
    };
  }

  public beforeDock(entry: WindowState): DOMRect | undefined {
    const frame = this.frames.get(entry.id);
    const animate =
      !this.dockAnimationSuppressed.delete(entry.id) &&
      !!frame?.animate &&
      !this.prefersReducedMotion() &&
      !entry.isMinimized;
    const before = animate ? frame!.getBoundingClientRect() : undefined;
    this.cancelTransition(entry.id);
    return before;
  }

  public afterDock(
    windowId: WindowId,
    dock: WindowDock,
    before: DOMRect | undefined,
    current: () => WindowState | undefined,
  ): void {
    const frame = this.frames.get(windowId);
    if (!before || !frame) return;
    queueMicrotask(() => {
      const entry = current();
      if (
        entry?.dock !== dock ||
        entry.isClosing ||
        entry.isMinimized ||
        this.minimizing.has(windowId)
      )
        return;
      const after = frame.getBoundingClientRect();
      if (!after.width || !after.height) return;
      this.animateFrame(windowId, [
        {
          transformOrigin: "top left",
          transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})`,
        },
        { transformOrigin: "top left", transform: "translate(0, 0) scale(1, 1)" },
      ]);
    });
  }

  public setMinimized(
    entry: WindowState,
    isMinimized: boolean,
    commit: (value: boolean) => void,
  ): void {
    const { id } = entry;
    this.cancelTransition(id);
    if (entry.isMinimized === isMinimized) return;
    const frame = this.frames.get(id);
    const target =
      typeof document === "undefined"
        ? null
        : (document.querySelector<HTMLElement>(`[data-window-taskbar-id="${id}"]`) ??
          document.querySelector<HTMLElement>('[x-role="taskbar"]'));
    if (!frame || !target || !frame.animate || this.prefersReducedMotion()) {
      commit(isMinimized);
      return;
    }
    if (!isMinimized) commit(false);
    const frameRect = frame.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const dx = targetRect.left + targetRect.width / 2 - (frameRect.left + frameRect.width / 2);
    const dy = targetRect.top + targetRect.height / 2 - (frameRect.top + frameRect.height / 2);
    const targetTransform = `translate(${dx}px, ${dy}px) scale(0.08)`;
    frame.style.pointerEvents = "none";
    if (isMinimized) this.minimizing.add(id);
    this.animateFrame(
      id,
      isMinimized
        ? [
            { opacity: 1, transform: "translate(0, 0) scale(1)" },
            { opacity: 0, transform: targetTransform },
          ]
        : [
            { opacity: 0, transform: targetTransform },
            { opacity: 1, transform: "translate(0, 0) scale(1)" },
          ],
      isMinimized
        ? () => {
            this.minimizing.delete(id);
            commit(true);
          }
        : undefined,
    );
  }
}
