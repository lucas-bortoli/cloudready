import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import useDialog from "../../components/dialog/Dialog";
import useWindowCloser from "../../components/window-manager/useWindowCloser";
import { filesystem } from "../../filesystem/FileSystemClient";
import useFilePicker, { FilePickerCancelledError } from "../file-manager/file-picker/FilePicker";
import BrowserPlaybackAdapter from "./BrowserPlaybackAdapter";
import DefaultSkin from "./DefaultSkin";
import PlayerController from "./PlayerController";

const mediaExtensions = /\.(mp3|m4a|aac|wav|ogg|opus|flac|mp4|m4v|webm|ogv|mov)$/i;

/** Connects the player to CloudReady windows and the filesystem picker. */
export default function MediaPlayer() {
  const picker = useFilePicker({
    type: "file",
    suffixes: [],
    multiple: true,
    filter: (entry) =>
      entry.mimeType.startsWith("audio/") ||
      entry.mimeType.startsWith("video/") ||
      (entry.mimeType === "application/octet-stream" && mediaExtensions.test(entry.name)),
  });

  const showDialog = useDialog();
  const adapter = new BrowserPlaybackAdapter();
  const controller = new PlayerController(adapter);
  const [state, setState] = createSignal(controller.getSnapshot());
  const unsubscribe = controller.subscribe(() => setState(controller.getSnapshot()));
  const playbackError = createMemo(() => state().error);

  createEffect(playbackError, (error) => {
    if (!error) return;
    let message: string;
    if (error === "start") {
      message = "Playback could not start. Select Play to try again.";
    } else {
      message = "This file could not be played. Choose another file or try again.";
    }
    const dialog = showDialog({
      icon: "error",
      title: "Playback error",
      content: () => <p>{message}</p>,
      actions: { ok: "OK" },
    });
    void dialog.result.catch(() => {});
  });

  useWindowCloser(() => true);

  onCleanup(() => {
    unsubscribe();
    controller.dispose();
  });

  function addFiles() {
    picker
      .show()
      .then((entries) => {
        controller.add(
          entries
            .filter((entry) => entry.kind === "file")
            .map((entry) => ({ name: entry.name, url: filesystem.fileUrl(entry.path) })),
        );
      })
      .catch((error) => {
        if (!(error instanceof FilePickerCancelledError)) {
          void showDialog({
            icon: "error",
            title: "Could not open file picker",
            content: () => <p>Could not open the file picker.</p>,
            actions: { ok: "OK" },
          });
        }
      });
  }

  function attachVideo(surface: HTMLDivElement) {
    adapter.attach(surface);
  }

  return (
    <DefaultSkin
      state={state()}
      controller={controller}
      pickerOpen={picker.isOpen()}
      onAddFiles={addFiles}
      attachVideo={attachVideo}
    />
  );
}
