import Menu16 from "@carbon/icons/es/menu/16.js";
import type { JSX } from "@solidjs/web";
import { children, createEffect, createMemo, createSignal, onSettled, Show } from "solid-js";
import { cn } from "../../lib/dom";
import Button from "../button/Button";
import FixedSidebar from "../sidebar/FixedSidebar";
import ResizableSidebar from "../sidebar/ResizableSidebar";
import CarbonIcon from "../taskbar/CarbonIcon";
import { useWindowBack } from "../window-manager/WindowBackContext";

/** Props for the application frame and its named slots. */
export interface AppFrameProps {
  /** Direct children must be AppFrame slots, optionally wrapped in Solid control flow. */
  children?: JSX.Element;
}

/** Content displayed in the main pane. */
export interface AppFrameMainProps {
  children?: JSX.Element;
}

/** Content and optional CSS classes for the main header. */
export interface AppFrameHeaderProps {
  children?: JSX.Element;
  class?: string;
}
/** Content displayed in the main status bar. */
export interface AppFrameStatusProps {
  children?: JSX.Element;
}
/** Content displayed above the sidebar body. */
export interface AppFrameSidebarHeaderProps {
  children?: JSX.Element;
}
/** Content displayed below the sidebar body. */
export interface AppFrameSidebarStatusProps {
  children?: JSX.Element;
}

/** Sidebar content, controlled selection, and optional persistence. */
export interface AppFrameSidebarProps extends AppFrameProps {
  /** Local storage key for the docked sidebar width. */
  sizeKey?: string;
  /** Changing this value closes the narrow drawer after navigation. */
  navigationKey?: string;
  /** Key of the selected sidebar item, or null when nothing is selected. */
  selectedItem: string | null;
  /** Receives the key of a clicked sidebar item. */
  setSelectedItem: (key: string) => void;
}

const slotType = Symbol("AppFrame slot");

type SlotName = "main" | "header" | "status" | "sidebar" | "sidebarHeader" | "sidebarStatus";
type Slot = {
  [Name in SlotName]: {
    [slotType]: Name;
    props: Name extends "sidebar" ? AppFrameSidebarProps : AppFrameHeaderProps;
  };
}[SlotName];

function slotElement(slot: Slot): JSX.Element {
  // Solid's children helper keeps these descriptors intact. Only their children reach the DOM.
  return slot as unknown as JSX.Element;
}

function isSlot(child: unknown): child is Slot {
  return typeof child === "object" && child !== null && slotType in child;
}

function Main(props: AppFrameMainProps) {
  return slotElement({ [slotType]: "main", props });
}

function Header(props: AppFrameHeaderProps) {
  return slotElement({ [slotType]: "header", props });
}

function Status(props: AppFrameStatusProps) {
  return slotElement({ [slotType]: "status", props });
}

function Sidebar(props: AppFrameSidebarProps) {
  return slotElement({ [slotType]: "sidebar", props });
}

function SidebarHeader(props: AppFrameSidebarHeaderProps) {
  return slotElement({ [slotType]: "sidebarHeader", props });
}

function SidebarStatus(props: AppFrameSidebarStatusProps) {
  return slotElement({ [slotType]: "sidebarStatus", props });
}

/**
 * Lays out an application's main pane and optional resizable sidebar.
 * At widths below 600px, the sidebar appears as an overlay drawer.
 * Header and status slots on each side share rows while the sidebar is docked.
 * Direct children must be AppFrame slots, optionally wrapped in Solid control flow.
 *
 * @example
 * ```tsx
 * <AppFrame>
 *   <AppFrame.Sidebar
 *     sizeKey="notes.sidebar.width"
 *     navigationKey={currentPage()}
 *     selectedItem={currentPage()}
 *     setSelectedItem={navigate}
 *   >
 *     <SidebarSection label="Pages">...</SidebarSection>
 *   </AppFrame.Sidebar>
 *   <AppFrame.SidebarHeader>Notes</AppFrame.SidebarHeader>
 *   <AppFrame.Header class="px-4">Toolbar</AppFrame.Header>
 *   <AppFrame.Main><Page /></AppFrame.Main>
 *   <AppFrame.Status>Ready</AppFrame.Status>
 *   <AppFrame.SidebarStatus>Pages</AppFrame.SidebarStatus>
 * </AppFrame>
 * ```
 */
function AppFrame(props: AppFrameProps) {
  // Resolve control-flow wrappers while keeping slot contents under their eventual providers.
  const frameChildren = children(() => props.children);
  const slots = createMemo(() => {
    const named: Partial<Record<SlotName, AppFrameHeaderProps>> & {
      sidebar?: AppFrameSidebarProps;
    } = {};
    for (const child of frameChildren.toArray()) {
      if (child == null || typeof child === "boolean") continue;
      if (!isSlot(child)) {
        throw new Error(
          "AppFrame children must be AppFrame slots. Put page content in AppFrame.Main.",
        );
      }
      if (child[slotType] === "sidebar") {
        named.sidebar = child.props;
      } else {
        named[child[slotType]] = child.props;
      }
    }
    return named;
  });
  const sidebar = () => slots().sidebar;
  const [narrow, setNarrow] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  const [progress, setProgress] = createSignal<number | null>(null);
  let frame: HTMLElement | undefined;
  let menuButton: HTMLButtonElement | undefined;
  let drawer: HTMLDivElement | undefined;
  let drag: { x: number; y: number; start: number; active: boolean } | undefined;

  // Use the application window width, which may differ from the viewport width.
  onSettled(() => {
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.width < 600;
      if (next !== narrow()) {
        setOpen(false);
        setProgress(null);
        setNarrow(next);
      }
    });
    observer.observe(frame);
    return () => observer.disconnect();
  });

  // A caller can signal navigation without coupling the frame to its router.
  let navigationInitialized = false;
  createEffect(
    () => sidebar()?.navigationKey,
    () => {
      if (navigationInitialized) setOpen(false);
      navigationInitialized = true;
    },
  );

  const close = () => {
    setOpen(false);
    menuButton?.focus();
  };
  useWindowBack("dismiss", { available: () => narrow() && open(), run: close });
  const show = () => {
    setOpen(true);
    requestAnimationFrame(() =>
      drawer?.querySelector<HTMLElement>("button, [tabindex='0']")?.focus(),
    );
  };
  const pointerDown = (event: PointerEvent) => {
    if (!narrow() || !sidebar() || event.button !== 0) return;
    if (!open() && event.clientX - (frame?.getBoundingClientRect().left ?? 0) > 24) return;
    drag = { x: event.clientX, y: event.clientY, start: open() ? 1 : 0, active: false };
  };
  const pointerMove = (event: PointerEvent) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    // Leave vertical gestures available for scrolling until a horizontal drag wins.
    if (!drag.active && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      drag = undefined;
      return;
    }
    if (Math.abs(dx) < 8 && !drag.active) return;
    drag.active = true;
    setProgress(
      Math.max(0, Math.min(1, drag.start + dx / Math.min(320, (frame?.clientWidth ?? 320) - 56))),
    );
  };
  const pointerEnd = () => {
    if (drag?.active) setOpen((progress() ?? 0) >= 0.5);
    drag = undefined;
    setProgress(null);
  };
  const keyDown = (event: KeyboardEvent) => {
    if (!open() || !narrow()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !drawer) return;
    const elements = Array.from(
      drawer.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), [tabindex='0']",
      ),
    );
    if (!elements.length) {
      event.preventDefault();
      drawer.focus();
      return;
    }
    // Wrap keyboard focus within the open drawer.
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  // The docked sidebar shares grid rows with the main pane; the drawer uses a flex column.
  const sidebarContent = () => (
    <>
      <Show when={slots().sidebarHeader || (!narrow() && slots().header)}>
        <header class="row-start-1 min-h-12 shrink-0 border-b border-neutral-200">
          {slots().sidebarHeader?.children}
        </header>
      </Show>
      <div class="row-start-2 min-h-0 flex-1 overflow-y-auto">{sidebar()?.children}</div>
      <Show when={slots().sidebarStatus || (!narrow() && slots().status)}>
        <footer class="row-start-3 shrink-0 border-t border-neutral-200">
          {slots().sidebarStatus?.children}
        </footer>
      </Show>
    </>
  );
  const fraction = () => progress() ?? (open() ? 1 : 0);
  const sidebarExpanded = () => {
    if (open()) return "true";
    return "false";
  };

  return (
    <main
      ref={frame}
      x-role="app frame"
      class="@container relative grid h-full min-h-0 min-w-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-neutral-50 text-neutral-800"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onKeyDown={keyDown}
    >
      <Show when={!narrow() && sidebar()}>
        <ResizableSidebar
          class="col-start-1 row-span-3 row-start-1 grid! min-w-0 grid-rows-subgrid border-r border-neutral-200 bg-neutral-100"
          asideClass="row-span-3 grid min-w-0 grid-rows-subgrid"
          sizeKey={sidebar()?.sizeKey}
          selectedItem={sidebar()!.selectedItem}
          setSelectedItem={sidebar()!.setSelectedItem}
        >
          {sidebarContent()}
        </ResizableSidebar>
      </Show>
      <section class="col-start-2 row-span-3 row-start-1 grid min-w-0 grid-rows-subgrid overflow-hidden">
        <Show
          when={
            slots().header ||
            (narrow() && sidebar()) ||
            (!narrow() && sidebar() && slots().sidebarHeader)
          }
        >
          <header
            class={cn(
              "row-start-1 flex min-h-12 items-center border-b border-neutral-200 px-2",
              slots().header?.class,
            )}
          >
            <Show when={narrow() && sidebar()}>
              <Button
                ref={menuButton}
                title="Open sidebar"
                onClick={show}
                aria-expanded={sidebarExpanded()}
              >
                <CarbonIcon icon={Menu16} />
              </Button>
            </Show>
            <div class="min-w-0 flex-1">{slots().header?.children}</div>
          </header>
        </Show>
        <div class="row-start-2 flex min-h-0 flex-col overflow-auto">{slots().main?.children}</div>
        <Show when={slots().status || (!narrow() && sidebar() && slots().sidebarStatus)}>
          <footer class="row-start-3 border-t border-neutral-200">
            {slots().status?.children}
          </footer>
        </Show>
      </section>
      <Show when={narrow() && sidebar()}>
        <div
          class={[
            "absolute inset-0 z-20 bg-black",
            { "motion-safe:transition-opacity motion-safe:duration-180": progress() === null },
          ]}
          style={{ opacity: fraction() * 0.32, "pointer-events": fraction() > 0 ? "auto" : "none" }}
          onClick={close}
        />
        <div
          ref={drawer}
          tabindex={-1}
          role="dialog"
          aria-label="Sidebar"
          aria-modal="true"
          inert={!open()}
          class={[
            "absolute inset-y-0 left-0 z-30 w-[min(320px,calc(100%-56px))] bg-neutral-100 shadow-xl",
            {
              // Visibility stays visible until the slide-out transition finishes.
              "motion-safe:transition-[transform,visibility] motion-safe:duration-180 motion-safe:ease-[ease]":
                progress() === null,
            },
          ]}
          style={{
            transform: `translateX(${(fraction() - 1) * 100}%)`,
            visibility: fraction() > 0 ? "visible" : "hidden",
          }}
        >
          <FixedSidebar
            fill
            class="flex h-full"
            selectedItem={sidebar()!.selectedItem}
            setSelectedItem={sidebar()!.setSelectedItem}
          >
            {sidebarContent()}
          </FixedSidebar>
        </div>
      </Show>
    </main>
  );
}

export default Object.assign(AppFrame, {
  Main,
  Header,
  Status,
  Sidebar,
  SidebarHeader,
  SidebarStatus,
});
