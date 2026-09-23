import { createSignal, onCleanup, onMount } from "solid-js";
import Button from "./components/button/Button";
import TextInput from "./components/text-input/TextInput";
import Taskbar from "./components/taskbar/TaskBar";
import type { WindowId } from "./components/window-manager/WindowManager";
import { useWindowManager } from "./components/window-manager/WindowManagerContext";
import WindowsOutlet from "./components/window-manager/WindowsOutlet";

/** Root desktop application, including its initial demonstration window. */
export default function App() {
  const windowManager = useWindowManager();
  const [singleLineValue, setSingleLineValue] = createSignal("CloudReady");
  const [multiLineValue, setMultiLineValue] = createSignal("First line\nSecond line");

  let windowId: WindowId | undefined;

  onMount(() => {
    windowId = windowManager.createWindow({
      content: () => (
        <section class="p-4">
          <h1 class="mb-3 text-xl font-semibold text-neutral-900">Hi!</h1>
          <div class="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => undefined}>
              Primary
            </Button>
            <Button variant="secondary" onClick={() => undefined}>
              Secondary
            </Button>
            <Button variant="danger" onClick={() => undefined}>
              Danger
            </Button>
            <Button variant="ghost" onClick={() => undefined} loading>
              Ghost
            </Button>
          </div>
          <div class="mt-5 grid gap-4 text-neutral-900">
            <label class="grid gap-1.5">
              <span class="font-medium">Single-line textarea</span>
              <TextInput
                class="w-64"
                onValueChange={setSingleLineValue}
                placeholder="Type a single line"
                value={singleLineValue()}
              />
              <output class="font-mono text-sm text-neutral-600">{singleLineValue()}</output>
            </label>
            <label class="grid gap-1.5">
              <span class="font-medium">Multiline textarea</span>
              <TextInput
                class="w-64"
                multiLine
                onValueChange={setMultiLineValue}
                value={multiLineValue()}
              />
              <output class="font-mono text-sm whitespace-pre-wrap text-neutral-600">
                {multiLineValue()}
              </output>
            </label>
          </div>
        </section>
      ),
    });
  });

  onCleanup(() => {
    if (windowId) {
      windowManager.removeWindow(windowId);
      windowId = undefined;
    }
  });

  return (
    <div x-role="desktop root" class="relative h-full w-full text-base">
      <h1>Hello World! {windowManager.getWindows().length} window(s)</h1>
      <WindowsOutlet />
      <Taskbar />
    </div>
  );
}
