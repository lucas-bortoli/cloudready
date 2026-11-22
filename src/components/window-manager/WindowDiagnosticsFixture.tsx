import { captureArtifact } from "@solidjs/diagnostics";
import { render } from "@solidjs/web";
import { createSignal, flush, onSettled, Show } from "solid-js";
import { LayerProvider } from "../layer-manager/LayerContext";
import useDialog from "../dialog/Dialog";
import { Model } from "../../programs/kodekai/model/model";
import { formatIsoDateTime } from "../../lib/iso-date-time";
import Kodekai from "../../programs/kodekai/Kodekai";
import { CurrentWindowProvider } from "./CurrentWindowContext";
import { WindowManagerProvider, useWindowManager } from "./WindowManagerContext";
import type WindowManager from "./WindowManager";
import type { WindowId } from "./WindowManager";
import WindowsOutlet from "./WindowsOutlet";
import "../../style.css";

function DialogFixture() {
  const createDialog = useDialog();
  const open = () => {
    const dialog = createDialog({
      icon: "question",
      title: "Delete document",
      content: () => <p>Delete this document?</p>,
      actions: { confirm: "Delete", cancel: "Keep" },
    });
    dialog.result.catch(() => {});
  };
  return (
    <>
      <button onClick={open}>Open dialog</button>
      <WindowsOutlet />
    </>
  );
}

interface BoardFixtureProps {
  model: Model;
  windowId: WindowId | undefined;
  onReady: (manager: WindowManager) => void;
}

function BoardFixture(props: BoardFixtureProps) {
  const manager = useWindowManager();
  onSettled(() => props.onReady(manager));
  return (
    <>
      <Show when={props.windowId}>
        {(id) => (
          <CurrentWindowProvider windowId={id()}>
            <Kodekai model={props.model} />
          </CurrentWindowProvider>
        )}
      </Show>
      <WindowsOutlet />
    </>
  );
}

export async function captureWindowScenario(scenario: "dialog" | "kodekai") {
  document.body.replaceChildren();
  const container = document.createElement("div");
  document.body.append(container);
  let position: { x: number; y: number; expectedX: number; expectedY: number } | undefined;
  const capturePosition = async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    flush();
    const frame = container.querySelector<HTMLElement>('[x-role="window"]')!;
    position = {
      x: frame.offsetLeft,
      y: frame.offsetTop,
      expectedX: Math.max(12, Math.round((window.innerWidth - frame.offsetWidth) / 2)),
      expectedY: Math.max(60, Math.round(48 + (window.innerHeight - 48 - frame.offsetHeight) / 2)),
    };
  };
  const { artifact } = await captureArtifact(
    async () => {
      if (scenario === "dialog") {
        const dispose = render(
          () => (
            <LayerProvider>
              <WindowManagerProvider>
                <DialogFixture />
              </WindowManagerProvider>
            </LayerProvider>
          ),
          container,
        );
        container.querySelector("button")!.click();
        flush();
        await Promise.resolve();
        flush();
        await capturePosition();
        dispose();
      } else {
        const model = Model.empty();
        const projectId = model.createProject({ title: "Cloudready" });
        model.createCard({
          projectId,
          title: "First",
          expiration: formatIsoDateTime(new Date("2026-09-27T15:30:00.000Z")),
        });
        model.createCard({ projectId, title: "Second" });
        model.createCard({ projectId, title: "Third" });
        let manager!: WindowManager;
        const [windowId, setWindowId] = createSignal<WindowId>();
        const ready = (value: WindowManager) => {
          manager = value;
        };
        const dispose = render(
          () => (
            <LayerProvider>
              <WindowManagerProvider>
                <BoardFixture model={model} windowId={windowId()} onReady={ready} />
              </WindowManagerProvider>
            </LayerProvider>
          ),
          container,
        );
        setWindowId(manager.createWindow());
        flush();
        await capturePosition();
        dispose();
      }
    },
    { scenario: `browser-${scenario}` },
  );
  container.remove();
  return { artifact, position };
}
