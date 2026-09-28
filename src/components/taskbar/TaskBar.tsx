import Apps16 from "@carbon/icons/es/apps/16.js";
import { createSignal, Show } from "solid-js";
import { useLayerItem } from "../layer-manager/LayerContext";
import CarbonIcon from "./CarbonIcon";
import Clock from "./Clock";
import StartMenu from "./StartMenu";
import { useSession } from "../../session/SessionContext";

interface TaskbarProps {
  onLaunchFiles: () => void;
}

export default function Taskbar(props: TaskbarProps) {
  const layerItem = useLayerItem("shell");
  const [isStartMenuOpen, setIsStartMenuOpen] = createSignal(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = createSignal(false);
  const session = useSession();

  return (
    <section
      x-role="taskbar"
      class="absolute right-0 bottom-0 left-0 flex h-12 items-center bg-neutral-800 p-1 text-neutral-100"
      style={{ "z-index": layerItem.zIndex() }}
    >
      <button
        aria-controls="start-menu"
        aria-expanded={isStartMenuOpen()}
        class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-neutral-800 px-3 transition-colors hover:bg-neutral-700"
        type="button"
        onClick={() => setIsStartMenuOpen(!isStartMenuOpen())}
      >
        <span class="grid size-4 shrink-0 place-items-center">
          <CarbonIcon icon={Apps16} />
        </span>
        Apps
      </button>
      <section x-role="window list" />
      <div class="relative">
        <button
          aria-expanded={isAccountMenuOpen()}
          class="h-10 cursor-pointer rounded-full px-3 hover:bg-neutral-700"
          type="button"
          onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen())}
        >
          {session.user().displayName}
        </button>
        <Show when={isAccountMenuOpen()}>
          <section
            x-role="account menu"
            class="absolute right-0 bottom-12 w-36 rounded-lg border border-neutral-600 bg-neutral-800 p-1 shadow-xl"
          >
            <button
              x-role="sign out"
              class="w-full cursor-pointer rounded px-3 py-2 text-left hover:bg-neutral-700"
              type="button"
              onClick={() => void session.signOut()}
            >
              Sign out
            </button>
          </section>
        </Show>
      </div>
      <Clock />
      <Show when={isStartMenuOpen()}>
        <StartMenu onClose={() => setIsStartMenuOpen(false)} onLaunchFiles={props.onLaunchFiles} />
      </Show>
    </section>
  );
}
