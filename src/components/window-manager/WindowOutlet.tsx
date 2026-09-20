import { For } from "solid-js";
import type { WindowEntry } from "./WindowManager";
import { useWindowManager } from "./WindowManagerContext";

function Window(props: { entry: WindowEntry }) {
  return (
    <div
      x-role="window"
      class="absolute z-0 origin-center -translate-1/2 overflow-hidden rounded-lg border border-neutral-400 shadow-2xl"
      style={{
        top: `${180}px`,
        left: `${220}px`,
        width: `${props.entry.size.width}px`,
        height: `${props.entry.size.height}px`,
      }}
    >
      <header
        x-role="titlebar"
        class="flex h-8 w-full items-center bg-amber-400 px-2 text-neutral-50"
      >
        <h1>{props.entry.title}</h1>
        <button>x</button>
      </header>
      <main
        x-role="client content container"
        class="h-[calc(100%-(--spacing(8)))] w-full overflow-hidden bg-white"
      >
        {props.entry.content()}
      </main>
    </div>
  );
}

export default function WindowOutlet() {
  const windowManager = useWindowManager();

  return <For each={windowManager.getWindows()}>{(entry) => <Window entry={entry} />}</For>;
}
