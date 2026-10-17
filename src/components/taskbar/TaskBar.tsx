import Apps16 from "@carbon/icons/es/apps/16.js";
import FitToScreen16 from "@carbon/icons/es/fit-to-screen/16.js";
import Wifi16 from "@carbon/icons/es/wifi/16.js";
import { createSignal, For, onCleanup, onMount, Show, splitProps, type JSX } from "solid-js";
import { cn } from "../../lib/dom";
import focusTrap from "../../lib/focus-trap";
import createFairyIcon from "../../programs/fairy/createFairyIcon";
import FairyPopover from "../../programs/fairy/FairyPopover";
import MachineIntelligenceWindow from "../machine-intelligence/MachineIntelligenceWindow";
import { useHotkey, useHotkeyRegistry } from "../hotkeys/HotkeyContext";
import { useLayerItem } from "../layer-manager/LayerContext";
import { useToast } from "../toast/ToastContext";
import { useSession } from "../session/SessionContext";
import type { WindowId } from "../window-manager/WindowManager";
import { useWindowManager } from "../window-manager/WindowManagerContext";
import CarbonIcon from "./CarbonIcon";
import Clock from "./Clock";
import StartMenu from "./StartMenu";
import "./TaskBar.css";
import VolumeUpImage from "./volume-up.svg";

/** Renders a taskbar control with the shared pointer and keyboard-focus treatment. */
function TaskbarButton(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [button, nativeProps] = splitProps(props, ["children", "class", "type"]);

  return (
    <button
      {...nativeProps}
      class={cn(
        "z-0 cursor-pointer outline-sky-200 transition-colors focus:z-10 focus:outline-2 focus:outline-offset-2",
        button.class,
      )}
      type={button.type ?? "button"}
    >
      {button.children}
    </button>
  );
}

function Separator() {
  return <i class="mx-2 inline-block h-4 w-px bg-neutral-600" />;
}

export default function Taskbar() {
  const layerItem = useLayerItem("shell");
  const [isStartMenuOpen, setIsStartMenuOpen] = createSignal(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = createSignal(false);
  const [isFairyOpen, setIsFairyOpen] = createSignal(false);
  const session = useSession();
  const [shouldFocusStartMenuSearch, setShouldFocusStartMenuSearch] = createSignal(true);
  const [isFullscreen, setIsFullscreen] = createSignal(Boolean(document.fullscreenElement));
  const hotkeys = useHotkeyRegistry();
  const { showToast } = useToast();
  let isSuperPressPending = false;
  const windowManager = useWindowManager();

  const handleWindowButton = (windowId: WindowId) => {
    const window = windowManager.getWindows().find((w) => w.id === windowId);
    if (!window) return;

    if (window.isMinimized || windowManager.motion.isMinimizing(windowId)) {
      windowManager.setMinimized(windowId, false);
      windowManager.bringToTop(windowId);
    } else if (window.isMinimizable) {
      windowManager.setMinimized(windowId, true);
    }
  };

  const openStartMenu = (shouldFocusSearch: boolean) => {
    setShouldFocusStartMenuSearch(shouldFocusSearch);
    setIsStartMenuOpen(true);
  };

  const toggleStartMenu = (shouldFocusSearch = true) => {
    if (isStartMenuOpen()) {
      setIsStartMenuOpen(false);
      return;
    }
    openStartMenu(shouldFocusSearch);
  };

  const handleStartMenuButtonClick = () => {
    toggleStartMenu();
  };

  const closeStartMenu = () => {
    setIsStartMenuOpen(false);
  };

  const toggleAccountMenu = () => setIsAccountMenuOpen(!isAccountMenuOpen());
  const signOut = () => void session.signOut();
  const toggleFairy = () => setIsFairyOpen(!isFairyOpen());
  const closeFairy = () => setIsFairyOpen(false);
  const openMachineIntelligence = () => {
    windowManager.createWindow({
      title: "Machine Intelligence",
      size: { width: 620, height: 540 },
      minimumSize: { width: 460, height: 380 },
      content: () => <MachineIntelligenceWindow />,
    });
  };

  const handleSuperKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Meta" && !event.repeat) isSuperPressPending = true;
    else if (event.metaKey) isSuperPressPending = false;
    return false;
  };

  const handleSuperKeyUp = (event: KeyboardEvent) => {
    if (event.key !== "Meta") return false;
    if (isSuperPressPending) toggleStartMenu(false);
    isSuperPressPending = false;
    return false;
  };

  const handleFullscreenChange = async () => {
    const fullscreen = Boolean(document.fullscreenElement);
    setIsFullscreen(fullscreen);
    if (!fullscreen) {
      hotkeys.unlockKeyboard();
      return;
    }

    if (await hotkeys.lockKeyboard()) {
      showToast({
        title: "Keyboard captured",
        message: "Keyboard shortcuts are now captured by CloudReady.",
      });
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        hotkeys.unlockKeyboard();
        return;
      }

      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen or keyboard lock may be unavailable or denied by the browser.
    }
  };

  onMount(() => {
    document.addEventListener("fullscreenchange", handleFullscreenChange);
  });

  onCleanup(() => {
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    hotkeys.unlockKeyboard();
  });

  useHotkey({
    eventType: "keydown",
    handler: handleSuperKeyDown,
  });

  useHotkey({
    eventType: "keyup",
    handler: handleSuperKeyUp,
  });
  return (
    <section
      x-role="taskbar"
      class="absolute top-0 right-0 left-0 flex h-12 items-center border-b border-neutral-700 bg-neutral-800 p-1 text-neutral-100"
      style={{ "z-index": layerItem.zIndex() }}
      use:focusTrap={focusTrap}
    >
      <TaskbarButton
        aria-controls="start-menu"
        aria-expanded={isStartMenuOpen()}
        class="inline-flex h-10 items-center gap-2 rounded-xs bg-neutral-800 px-3 hover:bg-neutral-700"
        onClick={handleStartMenuButtonClick}
      >
        <CarbonIcon icon={Apps16} />
        Apps
      </TaskbarButton>
      <Separator />
      <section x-role="window list" class="mr-auto">
        <For
          each={windowManager.getWindows()}
          children={(window) => (
            <TaskbarButton
              data-window-taskbar-id={window.id}
              class="inline-flex h-10 items-center gap-2 rounded-xs bg-neutral-800 px-3 hover:bg-neutral-700"
              onClick={handleWindowButton.bind(null, window.id)}
            >
              {window.title}
            </TaskbarButton>
          )}
        />
      </section>
      <Separator />
      <TaskbarButton
        aria-controls="fairy-conversation"
        aria-expanded={isFairyOpen()}
        class="inline-flex h-10 items-center gap-2 rounded-xs bg-neutral-800 px-3 hover:bg-neutral-700"
        onClick={toggleFairy}
      >
        <img
          src={createFairyIcon({
            wingsFill: "#e0e0e0",
            bodyFill: "white",
            wingsOutline: "white",
          })}
          class="h-6"
        />
        Navi
      </TaskbarButton>
      <Show when={isFairyOpen()}>
        <FairyPopover onClose={closeFairy} onConnect={openMachineIntelligence} />
      </Show>
      <TaskbarButton
        aria-controls="volume-mixer"
        class="inline-flex h-10 items-center gap-2 rounded-xs bg-neutral-800 px-3 hover:bg-neutral-700"
      >
        <CarbonIcon icon={Wifi16} class="size-4 shrink-0" />
      </TaskbarButton>
      <TaskbarButton
        aria-controls="volume-mixer"
        class="inline-flex h-10 items-center gap-2 rounded-xs bg-neutral-800 px-3 hover:bg-neutral-700"
      >
        <img src={VolumeUpImage} class="size-4 shrink-0" aria-hidden="true" />
      </TaskbarButton>
      <Separator />
      <TaskbarButton
        aria-label={isFullscreen() ? "Exit fullscreen" : "Enter fullscreen and capture keyboard"}
        class="inline-flex h-10 items-center gap-2 rounded-xs bg-neutral-800 px-3 hover:bg-neutral-700"
        onClick={toggleFullscreen}
      >
        <CarbonIcon icon={FitToScreen16} />
      </TaskbarButton>
      <Clock />
      <div class="relative">
        <TaskbarButton
          aria-expanded={isAccountMenuOpen()}
          class="h-10 rounded-xs px-3 hover:bg-neutral-700"
          onClick={toggleAccountMenu}
        >
          {session.user().displayName}
        </TaskbarButton>
        <Show when={isAccountMenuOpen()}>
          <section
            x-role="account menu"
            class="absolute right-0 bottom-12 w-36 rounded-lg border border-neutral-600 bg-neutral-800 p-1 shadow-xl"
          >
            <TaskbarButton
              x-role="sign out"
              class="w-full rounded px-3 py-2 text-left hover:bg-neutral-700"
              onClick={signOut}
            >
              Sign out
            </TaskbarButton>
          </section>
        </Show>
      </div>
      <Show when={isStartMenuOpen()}>
        <StartMenu onClose={closeStartMenu} shouldFocusSearch={shouldFocusStartMenuSearch()} />
      </Show>
    </section>
  );
}
