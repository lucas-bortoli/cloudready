import { createSignal, onCleanup, onSettled } from "solid-js";

/** Loads a consent document and reports whether it is available. */
export function useLegalDocument(
  load: () => Promise<string>,
  onReadyChange: (ready: boolean) => void,
) {
  const [document, setDocument] = createSignal<string>();
  const [error, setError] = createSignal<unknown>();
  let disposed = false;

  onSettled(() => {
    onReadyChange(false);
    void load().then(
      (value) => {
        if (disposed) return;
        setDocument(value);
        onReadyChange(true);
      },
      (reason: unknown) => {
        if (!disposed) setError(() => reason);
      },
    );
  });
  onCleanup(() => {
    disposed = true;
  });

  return { document, error };
}
