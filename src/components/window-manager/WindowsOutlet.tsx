import { For } from "solid-js";
import Window from "./Window";
import { useWindowManager } from "./WindowManagerContext";

/** Renders every window owned by the nearest {@link WindowManager}. */
export default function WindowsOutlet() {
  const windowManager = useWindowManager();

  return <For each={windowManager.getWindows()} children={(entry) => <Window entry={entry} />} />;
}
